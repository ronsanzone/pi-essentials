import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// Hunk companion for Pi: launch Hunk in a tmux side pane, mirror the live
// review state in Pi, import saved Hunk comments into the prompt editor, and
// jump back to the tree entry where the review started.

type ReviewTarget = "branch" | "working" | "staged" | "last" | "custom";

type HunkTarget = {
  label: string;
  hunkArgs: string[];
};

type ReviewFile = {
  path: string;
  additions: number;
  deletions: number;
};

type ReviewComment = {
  filePath: string;
  line: number | null;
  body: string;
};

type HunkState = {
  active: boolean;
  repoRoot: string;
  targetLabel: string;
  hunkArgs: string[];
  rootEntryId: string | null;
  hunkSessionId: string | null;
  tmuxPaneId: string | null;
  files: ReviewFile[];
  comments: ReviewComment[];
  lastUpdated: number;
  error?: string;
};

type Theme = {
  fg: (name: string, value: string) => string;
};

type NavigableContext = ExtensionContext & {
  navigateTree?: (entryId: string, opts?: { summarize?: boolean; label?: string }) => Promise<void>;
};

const POLL_INTERVAL_MS = 2000;
const WIDGET_MIN_WIDTH = 50;
const HUNK_PANE_SIZE = "40%";
const HUNK_STATE_ENTRY_TYPE = "hunk-review-state";
const HUNK_WIDGET_ID = "hunk-review";

function shellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) words.push(current);
  return words;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function execText(pi: ExtensionAPI, cmd: string, args: string[], cwd: string): Promise<string> {
  const result = await pi.exec(cmd, args, { cwd });
  if (result.code === 0) return result.stdout;

  const message = result.stderr.trim() || result.stdout.trim() || `${cmd} ${args.join(" ")} failed`;
  throw new Error(message);
}

async function execTextAllowFailure(pi: ExtensionAPI, cmd: string, args: string[], cwd: string): Promise<string | null> {
  const result = await pi.exec(cmd, args, { cwd });
  return result.code === 0 ? result.stdout : null;
}

async function getRepoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
  return (await execText(pi, "git", ["rev-parse", "--show-toplevel"], cwd)).trim();
}

async function getDefaultBranch(pi: ExtensionAPI, repoRoot: string): Promise<string> {
  const originHead = await execTextAllowFailure(pi, "git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoRoot);
  if (originHead?.trim()) return originHead.trim();

  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const exists = await execTextAllowFailure(pi, "git", ["rev-parse", "--verify", candidate], repoRoot);
    if (exists != null) return candidate;
  }

  return "HEAD~1";
}

function targetToHunkArgs(target: ReviewTarget, targetArg: string | null): HunkTarget {
  switch (target) {
    case "branch": {
      const range = targetArg ?? "origin/main...HEAD";
      return { label: range, hunkArgs: ["diff", range] };
    }
    case "working":
      return { label: "working tree", hunkArgs: ["diff"] };
    case "staged":
      return { label: "staged", hunkArgs: ["diff", "--staged"] };
    case "last":
      return { label: "HEAD", hunkArgs: ["show", "HEAD"] };
    case "custom": {
      const words = shellWords(targetArg || "diff");
      return { label: words.join(" ") || "diff", hunkArgs: words.length ? words : ["diff"] };
    }
  }
}

function toLine(note: any): number | null {
  const rawLine = Array.isArray(note.newRange)
    ? note.newRange[0]
    : Array.isArray(note.oldRange)
      ? note.oldRange[0]
      : note.newLine ?? note.oldLine ?? note.line;
  const line = Number(rawLine);
  return Number.isFinite(line) && line > 0 ? line : null;
}

function noteToComment(note: any): ReviewComment {
  return {
    filePath: String(note.filePath ?? note.file ?? note.path ?? "(unknown)"),
    line: toLine(note),
    body: String(note.body ?? note.summary ?? note.text ?? note.message ?? ""),
  };
}

function parseReviewFiles(jsonText: string): ReviewFile[] {
  const parsed = JSON.parse(jsonText);
  const review = parsed.review ?? parsed;
  const files = review.files ?? parsed.files ?? [];

  return Array.isArray(files)
    ? files.map((file: any) => ({
        path: String(file.path ?? "(unknown)"),
        additions: Number(file.additions ?? 0),
        deletions: Number(file.deletions ?? 0),
      }))
    : [];
}

function parseComments(jsonText: string): ReviewComment[] {
  const parsed = JSON.parse(jsonText);
  const comments = parsed.comments ?? parsed.notes ?? parsed.reviewNotes ?? parsed.liveComments ?? parsed;
  return Array.isArray(comments) ? comments.map(noteToComment).filter((c) => c.body.trim()) : [];
}

function composePrompt(state: HunkState): string {
  const lines: string[] = [
    `I reviewed the diff (${state.targetLabel}) in Hunk. Please address the review feedback below.`,
    "",
    "Review context:",
    `- Target: ${state.targetLabel}`,
    `- Hunk session: ${state.hunkSessionId ?? "unknown"}`,
    "- Changed files:",
  ];

  for (const file of state.files) {
    lines.push(`  - ${file.path} (+${file.additions}/-${file.deletions})`);
  }

  lines.push("", "Comments:");
  if (state.comments.length === 0) {
    lines.push("No Hunk comments were found.");
  } else {
    for (const comment of state.comments) {
      lines.push("", `### ${formatLocation(comment)}`, comment.body.trim());
    }
  }

  lines.push(
    "",
    "Instructions:",
    "- Please consider the review feedback and decide the appropriate response.",
    "- Make changes where they are clearly warranted; otherwise explain your reasoning or ask for clarification.",
    "- Summarize any changes made and how to verify them.",
  );

  return `${lines.join("\n").trim()}\n`;
}

async function chooseTarget(pi: ExtensionAPI, ctx: ExtensionContext): Promise<HunkTarget | null> {
  const repoRoot = await getRepoRoot(pi, ctx.cwd);
  const defaultBranch = await getDefaultBranch(pi, repoRoot);
  const branchRange = `${defaultBranch}...HEAD`;
  const choice = await ctx.ui.select("Review target", [
    `Branch diff against default branch (${branchRange})`,
    "Working tree",
    "Staged changes",
    "Last commit (HEAD)",
    "Custom hunk command args",
    "Cancel",
  ]);

  if (!choice || choice === "Cancel") return null;
  if (choice.startsWith("Branch")) return targetToHunkArgs("branch", branchRange);
  if (choice === "Working tree") return targetToHunkArgs("working", null);
  if (choice === "Staged changes") return targetToHunkArgs("staged", null);
  if (choice.startsWith("Last")) return targetToHunkArgs("last", null);

  const custom = await ctx.ui.input("Custom Hunk nested command", "Example: diff origin/main...HEAD -- src or show HEAD~1");
  return custom?.trim() ? targetToHunkArgs("custom", custom.trim()) : null;
}

async function findSessionId(pi: ExtensionAPI, state: HunkState): Promise<string | null> {
  const list = await execTextAllowFailure(pi, "hunk", ["session", "list", "--json"], state.repoRoot);
  if (!list) return null;

  try {
    const sessions = (JSON.parse(list).sessions ?? []) as any[];
    const byPane = state.tmuxPaneId
      ? sessions.find((session) => session.terminal?.locations?.some((loc: any) => loc.paneId === state.tmuxPaneId))
      : null;
    if (byPane?.sessionId) return byPane.sessionId;

    const matchingRepoSessions = sessions
      .filter((session) => session.repoRoot === state.repoRoot || session.cwd === state.repoRoot)
      .sort((a, b) => String(b.launchedAt ?? "").localeCompare(String(a.launchedAt ?? "")));
    return matchingRepoSessions[0]?.sessionId ?? null;
  } catch {
    return null;
  }
}

async function refreshState(pi: ExtensionAPI, state: HunkState): Promise<HunkState> {
  const sessionId = state.hunkSessionId ?? await findSessionId(pi, state);
  if (!sessionId) {
    return { ...state, hunkSessionId: null, error: "No live Hunk session found", lastUpdated: Date.now() };
  }

  const reviewText = await execTextAllowFailure(pi, "hunk", ["session", "review", sessionId, "--json"], state.repoRoot);
  const commentsText = await execTextAllowFailure(
    pi,
    "hunk",
    ["session", "comment", "list", sessionId, "--type", "user", "--json"],
    state.repoRoot,
  );

  return {
    ...state,
    hunkSessionId: sessionId,
    files: reviewText ? parseReviewFiles(reviewText) : state.files,
    comments: commentsText ? parseComments(commentsText) : state.comments,
    error: undefined,
    lastUpdated: Date.now(),
  };
}

function formatLocation(comment: ReviewComment): string {
  return `${comment.filePath}${comment.line != null ? `:${comment.line}` : ""}`;
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function padToWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "…", false);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function widgetLine(theme: Theme, text: string, width: number, style = ""): string {
  const content = padToWidth(text, width);
  return `${theme.fg("accent", "│")}${style ? theme.fg(style, content) : content}${theme.fg("accent", "│")}`;
}

function renderHunkWidget(state: HunkState, width: number, theme: Theme): string[] {
  const outerWidth = Math.max(WIDGET_MIN_WIDTH, width);
  const innerWidth = Math.max(1, outerWidth - 2);
  const shortSession = state.hunkSessionId?.slice(0, 8) ?? "connecting";
  const age = state.lastUpdated ? `${Math.max(0, Math.round((Date.now() - state.lastUpdated) / 1000))}s ago` : "never";
  const live = state.error
    ? theme.fg("warning", "degraded")
    : state.hunkSessionId
      ? theme.fg("success", "live ●")
      : theme.fg("warning", "connecting ○");
  const title = ` Hunk Review: ${state.targetLabel} `;
  const titleRule = "─".repeat(Math.max(0, innerWidth - visibleWidth(title) - visibleWidth(" live ● ")));
  const titleLine = `${theme.fg("accent", "╭─")}${theme.fg("toolTitle", title)}${theme.fg("accent", titleRule)}${live}${theme.fg("accent", "─╮")}`;
  const lines = [truncateToWidth(titleLine, outerWidth, "", false)];

  const meta = ` session ${shortSession} · ${state.rootEntryId ? "root set" : "root missing"} · updated ${age} · ${state.comments.length} comments`;
  lines.push(widgetLine(theme, meta, innerWidth));

  if (state.error) {
    lines.push(widgetLine(theme, ` warning: ${state.error}`, innerWidth, "warning"));
  } else if (state.comments.length === 0) {
    lines.push(widgetLine(theme, " waiting for saved Hunk comments…", innerWidth, "dim"));
  } else {
    for (const comment of state.comments.slice(0, 3)) {
      lines.push(widgetLine(theme, ` ${formatLocation(comment)} — ${singleLine(comment.body)}`, innerWidth));
    }
  }

  lines.push(widgetLine(theme, " /hunk-import-comments · /hunk-jump-root · /hunk-close · /hunk-clear", innerWidth, "muted"));
  lines.push(`${theme.fg("accent", "╰")}${theme.fg("accent", "─".repeat(innerWidth))}${theme.fg("accent", "╯")}`);
  return lines;
}

function restoreState(ctx: ExtensionContext): HunkState | null {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry: any = entries[i];
    if (entry.type === "custom" && entry.customType === HUNK_STATE_ENTRY_TYPE) {
      return entry.data as HunkState;
    }
  }
  return null;
}

function initialState(repoRoot: string, target: HunkTarget, rootEntryId: string | null, paneId: string): HunkState {
  return {
    active: true,
    repoRoot,
    targetLabel: target.label,
    hunkArgs: target.hunkArgs,
    rootEntryId,
    hunkSessionId: null,
    tmuxPaneId: paneId,
    files: [],
    comments: [],
    lastUpdated: Date.now(),
  };
}

export default function hunkReviewExtension(pi: ExtensionAPI) {
  let state: HunkState | null = null;
  let lastCtx: ExtensionContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function persist() {
    if (state) pi.appendEntry(HUNK_STATE_ENTRY_TYPE, state);
  }

  function clearPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function render(ctx = lastCtx) {
    if (!ctx) return;

    if (!state?.active) {
      ctx.ui.setWidget(HUNK_WIDGET_ID, undefined);
      ctx.ui.setStatus(HUNK_WIDGET_ID, undefined);
      return;
    }

    ctx.ui.setWidget(HUNK_WIDGET_ID, (_tui: any, theme: Theme) => ({
      render: (width: number) => renderHunkWidget(state!, width, theme),
      invalidate: () => {},
    }));

    const status = state.error
      ? ctx.ui.theme.fg("warning", "Hunk ⚠")
      : state.comments.length
        ? ctx.ui.theme.fg("success", `Hunk ${state.comments.length}`)
        : ctx.ui.theme.fg("muted", "Hunk 0");
    ctx.ui.setStatus(HUNK_WIDGET_ID, status);
  }

  function startPolling(ctx: ExtensionContext) {
    lastCtx = ctx;
    clearPolling();
    timer = setInterval(async () => {
      if (!state?.active) return;
      try {
        state = await refreshState(pi, state);
        persist();
      } catch (error) {
        state = {
          ...state,
          error: error instanceof Error ? error.message : String(error),
          lastUpdated: Date.now(),
        };
      }
      render();
    }, POLL_INTERVAL_MS);
  }

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    state = restoreState(ctx);
    if (state?.active) {
      render(ctx);
      startPolling(ctx);
    }
  });

  pi.registerCommand("hunk-review-split", {
    description: "Open real Hunk UI in a tmux side split and show a persistent Pi companion widget",
    handler: async (_args, ctx) => {
      if (!process.env.TMUX) {
        ctx.ui.notify("/hunk-review-split requires tmux.", "error");
        return;
      }

      const repoRoot = await getRepoRoot(pi, ctx.cwd);
      const target = await chooseTarget(pi, ctx);
      if (!target) return;

      const rootEntryId = ctx.sessionManager.getLeafId();
      if (rootEntryId) pi.setLabel(rootEntryId, "hunk-review-root");

      const command = `cd ${shellQuote(repoRoot)} && hunk ${target.hunkArgs.map(shellQuote).join(" ")}`;
      const paneId = (await execText(
        pi,
        "tmux",
        ["split-window", "-h", "-l", HUNK_PANE_SIZE, "-P", "-F", "#{pane_id}", command],
        repoRoot,
      )).trim();

      state = initialState(repoRoot, target, rootEntryId, paneId);
      persist();
      render(ctx);
      startPolling(ctx);
      ctx.ui.notify("Hunk split opened. Add/save comments in Hunk; the Pi widget will update while the session is live.", "info");
    },
  });

  pi.registerCommand("hunk-import-comments", {
    description: "Import current live Hunk user comments into Pi's editor",
    handler: async (_args, ctx) => {
      if (!state?.active) {
        ctx.ui.notify("No active Hunk review workspace.", "warning");
        return;
      }

      state = await refreshState(pi, state);
      persist();
      render(ctx);
      ctx.ui.setEditorText(composePrompt(state));
      ctx.ui.notify(`Imported ${state.comments.length} Hunk comment(s) into the prompt box.`, state.comments.length ? "success" : "warning");
    },
  });

  pi.registerCommand("hunk-jump-root", {
    description: "Jump back to the Pi tree entry where the Hunk review started",
    handler: async (_args, ctx: NavigableContext) => {
      if (!state?.rootEntryId) {
        ctx.ui.notify("No Hunk review root recorded.", "warning");
        return;
      }
      if (!ctx.navigateTree) {
        ctx.ui.notify("Tree navigation is not available in this Pi version.", "warning");
        return;
      }
      await ctx.navigateTree(state.rootEntryId, { summarize: true, label: "return-from-hunk-followup" });
    },
  });

  pi.registerCommand("hunk-close", {
    description: "Close the Hunk tmux pane launched by Pi and keep the review widget state",
    handler: async (_args, ctx) => {
      if (state?.tmuxPaneId) {
        await execTextAllowFailure(pi, "tmux", ["kill-pane", "-t", state.tmuxPaneId], state.repoRoot);
      }
      if (state) {
        state = { ...state, active: false, tmuxPaneId: null, hunkSessionId: null, lastUpdated: Date.now() };
        persist();
      }
      render(ctx);
      ctx.ui.notify("Hunk pane closed.", "info");
    },
  });

  pi.registerCommand("hunk-clear", {
    description: "Clear the Hunk companion widget/workspace state",
    handler: async (_args, ctx) => {
      state = null;
      ctx.ui.setWidget(HUNK_WIDGET_ID, undefined);
      ctx.ui.setStatus(HUNK_WIDGET_ID, undefined);
      pi.appendEntry(HUNK_STATE_ENTRY_TYPE, { active: false });
      ctx.ui.notify("Hunk review state cleared.", "info");
    },
  });

  pi.registerShortcut("alt+r", {
    description: "Open /hunk-review-split",
    handler: async (ctx) => {
      if (ctx.isIdle()) pi.sendUserMessage("/hunk-review-split");
      else pi.sendUserMessage("/hunk-review-split", { deliverAs: "followUp" });
    },
  });

  pi.on("session_shutdown", async () => {
    clearPolling();
  });
}

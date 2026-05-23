# Hunk Review Companion: Fork/Tree and Interactive Widget Plan

## Context

The current Hunk Review extension opens the real Hunk TUI in a tmux split and keeps a Pi-side companion widget active while the Hunk session is live. The widget tracks the live Hunk session, shows saved user comments, and supports importing all comments into the Pi prompt.

Current command surface:

- `/hunk-review-split` — open real Hunk in a tmux split and start the companion widget.
- `/hunk-import-comments` — import current live Hunk user comments into Pi's editor.
- `/hunk-jump-root` — navigate back to the Pi tree entry where review began.
- `/hunk-close` — close the launched Hunk tmux pane.
- `/hunk-clear` — clear Hunk companion state/widget.

The next phase is to make the companion more interactive and use Pi's session tree/fork model to manage comment-specific investigation and implementation branches.

## Goals

1. Treat a Hunk review as a persistent Pi review workspace.
2. Keep Hunk as the authoritative diff/comment UI.
3. Keep Pi as the orchestration/control plane for importing, branching, and agent prompts.
4. Allow users to work through individual Hunk comments in isolated Pi branches.
5. Provide a quick way to return to the review root from any follow-up branch.
6. Make the widget/panel interactive without reimplementing Hunk's diff UI.

## Non-goals

- Do not embed the full Hunk TUI inside Pi.
- Do not reintroduce a Pi-native diff renderer.
- Do not rely on closed Hunk sessions being queryable after exit.
- Do not automatically overwrite the prompt while the user is typing unless explicitly enabled later.

## Proposed Concepts

### Review Workspace

A Hunk review workspace is session-level state persisted into Pi's session entries.

Suggested shape:

```ts
type HunkWorkspaceState = {
  active: boolean;
  repoRoot: string;
  targetLabel: string;
  hunkArgs: string[];

  // Pi tree/session integration
  rootEntryId: string | null;
  rootLabel: string; // default: "hunk-review-root"
  forkedComments: Record<string, {
    entryId: string | null;
    label: string;
    createdAt: number;
  }>;

  // Hunk live session integration
  hunkSessionId: string | null;
  tmuxPaneId: string | null;
  files: ReviewFile[];
  comments: ReviewComment[];
  importedCommentIds: string[];
  resolvedCommentIds: string[];

  lastUpdated: number;
  error?: string;
};
```

### Comment Identity

Use Hunk's `commentId`, `noteId`, or `id` where present. Fall back to a stable hash of:

- file path
- line
- body text
- source/type

This identity is needed for:

- marking comments imported
- tracking comment-specific forks
- indicating resolved/done state in the widget/panel

### Review Root

When `/hunk-review-split` starts:

1. Capture `ctx.sessionManager.getLeafId()`.
2. Label it with `pi.setLabel(rootEntryId, "hunk-review-root")`.
3. Persist it in the workspace state.

The root is the stable point users can return to after exploring comment-specific branches.

## Planned User Workflows

### Workflow 1: Start Review and Import All Comments

1. User runs `/hunk-review-split`.
2. Pi opens Hunk in tmux split.
3. User adds comments in Hunk.
4. Companion widget updates comment count/previews.
5. User runs `/hunk-import-comments`.
6. Pi fills editor with all current Hunk comments.

This is the current baseline.

### Workflow 2: Fork Selected Comment

1. User opens `/hunk-panel`.
2. Panel lists comments from live Hunk session.
3. User selects a comment.
4. User presses `f` or chooses "Fork selected".
5. Pi forks from the current branch or review root.
6. New branch receives a prompt focused on that comment.
7. Widget persists and shows the review workspace from the forked branch.
8. User can run `/hunk-jump-root` to return to review root.

Prompt template:

```text
Address this Hunk review comment.

Review target: <targetLabel>
Hunk session: <sessionId>
Location: <filePath>:<line>
Kind: <FIX|QUESTION|DISCUSS|NIT>

Comment:
<comment body>

Instructions:
- Inspect the relevant code before editing.
- If this is a FIX, make the change unless there is a strong reason not to.
- If this is a QUESTION or DISCUSS item, answer or propose a path before broad edits.
- Summarize what changed and how to verify it.
```

### Workflow 3: Fork All Comments from Review Root

1. User opens `/hunk-panel`.
2. User presses `F` or chooses "Fork all".
3. Pi forks from the review root with a prompt containing all comments.
4. The original review root remains available via `/hunk-jump-root`.

This supports a clean implementation branch without losing review workspace context.

### Workflow 4: Navigate Between Hunk and Pi

From `/hunk-panel`:

- `n` — call `hunk session navigate <id> --next-comment`.
- `p` — call `hunk session navigate <id> --prev-comment`.
- `enter` — import selected comment into editor.
- `a` — import all comments into editor.
- `f` — fork selected comment.
- `F` — fork all comments from review root.
- `j` — jump Pi back to review root.
- `r` — refresh comments/session state.
- `q` — close panel.

This keeps Hunk as the visual diff surface while Pi controls branch/import operations.

## Interactive Widget Improvements

The current widget is a styled passive card. Next improvements should keep it compact and move deeper interaction into `/hunk-panel`.

### Widget v2

Show:

- target label
- live/degraded/disconnected status
- comment count
- root status
- latest 1–3 comments
- compact action hints

Optional additions:

- Mark comments that were imported: `imported ✓`
- Mark comments that have fork branches: `forked ↱`
- Mark comments resolved manually: `done ✓`
- Show current Hunk focus from `hunk session context <id> --json`.

Example:

```text
╭─ Hunk Review: working tree ─────────────── live ● 3 comments ─╮
│ session 5d01e9e0 · root set · updated 1s ago                  │
│ [FIX] settings.json:13 — Keep provider defaults out...   ↱     │
│ [QUESTION] install.sh:42 — Should this overwrite links?        │
│ /hunk-panel · /hunk-import-comments · /hunk-jump-root          │
╰────────────────────────────────────────────────────────────────╯
```

### Footer Status

Keep footer status minimal:

- `Hunk 0`
- `Hunk 3`
- `Hunk ⚠`
- `Hunk off`

Avoid replacing Pi's footer wholesale.

## `/hunk-panel` Design

Use `ctx.ui.custom()` with a focused overlay. This should be the main interactive UI.

### Layout

```text
╭─ Hunk Comments: working tree ───────────────────────────────╮
│ Session 5d01e9e0 · 3 comments · root set                    │
│                                                             │
│ > [FIX] settings.json:13                           new       │
│     Keep provider defaults out of repo                      │
│   [QUESTION] install.sh:42                         forked    │
│     Should this overwrite existing symlinks?                 │
│   [NIT] README.md:8                                imported  │
│     Small wording cleanup                                    │
│                                                             │
│ enter import selected · a import all · f fork · F fork all   │
│ j jump root · n/p navigate Hunk comments · r refresh · q quit│
╰─────────────────────────────────────────────────────────────╯
```

### Keybindings

- `up/down` or `j/k` — move selection.
- `enter` — import selected comment into editor.
- `a` — import all comments into editor.
- `f` — fork selected comment from current branch.
- `F` — fork selected comment from review root, or fork all comments depending on final UX choice.
- `A` — fork all comments from review root if `F` is used for selected-from-root.
- `j` — jump Pi to review root. If `j/k` are used for selection, use `g` for jump root instead.
- `n/p` — navigate Hunk next/previous comment.
- `r` — refresh live Hunk state.
- `q` or `escape` — close panel.

Resolve key conflicts before implementation. Prefer discoverability over strict vim conventions.

## Fork/Tree Commands

### `/hunk-fork-comment`

Interactive selector or accepts a comment index/id argument.

Behavior:

1. Refresh live Hunk comments.
2. Select comment if not provided.
3. Fork current Pi branch.
4. Send focused comment prompt in fork.
5. Persist mapping from comment id to fork entry/session information.
6. Re-render widget.

### `/hunk-fork-all`

Behavior:

1. Refresh live Hunk comments.
2. Fork from review root by default.
3. Send all-comments prompt.
4. Persist fork metadata.

### `/hunk-jump-root`

Current implementation should be extended to:

- refresh/re-render widget after navigation if possible
- label the abandoned branch summary as `return-from-hunk-followup`
- warn if root entry no longer exists

## State Persistence

Persist state with:

```ts
pi.appendEntry("hunk-review-state", state)
```

Restore on `session_start` by scanning custom entries from newest to oldest.

State should persist across:

- tree navigation
- fork/clone operations in the same session file
- `/reload`

State may become stale across:

- Hunk process exit
- Pi restart after Hunk died
- repository path changes

When stale, keep the review workspace but show disconnected/degraded state and offer `/hunk-review-split` to reconnect.

## Safety and UX Notes

### Avoid Surprise Prompt Overwrites

Before importing comments into editor, consider asking confirmation if Pi exposes editor content. If not, avoid auto-import. Keep import explicit.

### Keep Hunk Live for Reliable Comment Reads

Read comments while Hunk is running:

```bash
hunk session comment list <session-id> --type user --json
```

Do not depend on querying sessions after Hunk exits.

### Multiple Hunk Sessions

Prefer resolving by tmux pane id first. Fall back to newest matching repo session.

### Tree Replacement Footguns

Commands that call `ctx.fork()` or `ctx.navigateTree()` replace session context. After replacement, use only the callback context passed to `withSession`; do not use stale captured session-bound objects.

## Suggested Implementation Order

1. Add stable comment ids and imported/forked status tracking.
2. Add `/hunk-panel` read-only selector with refresh and close.
3. Add panel import selected/import all actions.
4. Add `/hunk-fork-comment` and panel `fork selected` action.
5. Add `/hunk-fork-all` and panel `fork all` action.
6. Improve `/hunk-jump-root` restoration/rendering after navigation.
7. Add Hunk navigation controls from panel (`next-comment`, `prev-comment`).
8. Add optional current Hunk focus display using `hunk session context`.
9. Add compact/expanded widget modes if the widget becomes too large.

## Open Questions

1. Should selected-comment forks default to current branch or review root?
   - Current branch keeps recent context.
   - Review root keeps comment branches clean and parallel.
   - The panel can eventually support both.

2. Should imported comments be marked imported automatically after editor insertion?
   - Probably yes for selected imports.
   - For all-comments import, mark all current comments imported.

3. Should the extension support resolving/dismissing comments locally?
   - Hunk owns real comments.
   - Pi can maintain local `resolvedCommentIds` for workflow tracking.

4. Should `/hunk-close` clear active state or leave a disconnected review workspace visible?
   - Current behavior clears active widget.
   - Future behavior could preserve a collapsed disconnected workspace for jump-root/fork history.

5. Should popup mode remain?
   - It is pleasant visually but less robust for live import.
   - If retained, document it as view-only/best-effort and keep split as primary.

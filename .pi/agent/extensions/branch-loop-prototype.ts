import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATE_TYPE = "branch-loop-prototype";

type PrototypeState = {
  active: boolean;
  anchorEntryId?: string;
  maxTurns?: number;
  currentTurn?: number;
  startedAt?: number;
  lastError?: string;
};

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input?.trim()) return fallback;
  const value = Number.parseInt(input.trim(), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`expected a positive integer, got ${JSON.stringify(input)}`);
  }
  return value;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAgentToStart(ctx: any, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!ctx.isIdle()) return true;
    await wait(50);
  }
  return false;
}

function prototypePrompt(turn: number, maxTurns: number, anchorEntryId: string): string {
  return `Branch loop prototype iteration ${turn}/${maxTurns}.

This is a context-management probe. Please do not edit files or run tools.

Respond with exactly one short paragraph that includes:
- the iteration number ${turn}
- whether you can see prior sibling iteration transcript context
- the anchor id prefix ${anchorEntryId.slice(0, 8)}

Then stop.`;
}

function seededSetupPrompt(sentinel: string): string {
  return `Branch loop seeded context setup.

Remember this parent sentinel phrase for the upcoming branch-loop context test: ${sentinel}

Acknowledge in one short sentence. Do not repeat the sentinel unless a later message asks for the parent sentinel phrase.`;
}

function contextProbePrompt(turn: number, maxTurns: number, anchorEntryId: string): string {
  const siblingProbe = turn === 1
    ? "Also include this sibling-only marker in your answer: SIBLING-MARKER-TURN-1."
    : "Report whether you can see the sibling-only marker from iteration 1. Do not guess; say NO if it is not visible.";

  return `Branch loop parent-context probe iteration ${turn}/${maxTurns}.

This is a context-management probe. Please do not edit files or run tools.

A parent sentinel phrase may have been provided by the user before this command was invoked. The sentinel phrase is intentionally NOT repeated in this prompt.

Respond with exactly these fields:
- iteration: ${turn}
- parent_sentinel: <the sentinel phrase from parent context, or NONE if not visible>
- sibling_iteration_context_visible: YES or NO
- sibling_marker_from_turn_1_visible: YES or NO or N/A_FOR_TURN_1
- anchor_prefix: ${anchorEntryId.slice(0, 8)}

${siblingProbe}

Then stop.`;
}

export default function branchLoopPrototype(pi: ExtensionAPI): void {
  let state: PrototypeState = { active: false };

  function persist(action: string): void {
    pi.appendEntry(STATE_TYPE, { version: 1, action, state: { ...state } });
  }

  function setStatus(ctx: any): void {
    if (!ctx.hasUI) return;
    if (!state.active) {
      ctx.ui.setStatus("branch-loop-proto", undefined);
      return;
    }
    ctx.ui.setStatus(
      "branch-loop-proto",
      ctx.ui.theme.fg("accent", `Branch loop prototype ${state.currentTurn ?? 0}/${state.maxTurns ?? "?"}`),
    );
  }

  function loadState(ctx: any): void {
    state = { active: false };
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;
      const data = entry.data as { state?: PrototypeState } | undefined;
      if (data?.state) state = { ...data.state };
    }
    setStatus(ctx);
  }

  pi.on("session_start", async (_event, ctx) => loadState(ctx));
  pi.on("session_tree", async (_event, ctx) => loadState(ctx));

  async function runBranchLoopProbe(
    ctx: any,
    maxTurns: number,
    promptBuilder: (turn: number, maxTurns: number, anchorEntryId: string) => string,
    labelPrefix: string,
  ): Promise<void> {
    const anchorEntryId = ctx.sessionManager.getLeafId();
    state = {
      active: true,
      anchorEntryId,
      maxTurns,
      currentTurn: 0,
      startedAt: Date.now(),
    };
    persist("start");
    setStatus(ctx);
    pi.setLabel(anchorEntryId, `${labelPrefix}-anchor-${anchorEntryId.slice(0, 8)}`);
    ctx.ui.notify(`${labelPrefix} anchored at ${anchorEntryId.slice(0, 12)}; running ${maxTurns} branches`, "info");

    for (let turn = 1; turn <= maxTurns; turn++) {
      state.currentTurn = turn;
      persist("turn-start");
      setStatus(ctx);

      try {
        const nav = await ctx.navigateTree(anchorEntryId, { summarize: false, label: `${labelPrefix}-turn-${turn}-start` });
        if (nav?.cancelled) {
          throw new Error(`navigation to anchor ${anchorEntryId.slice(0, 12)} was cancelled`);
        }

        await wait(100);
        pi.sendUserMessage(promptBuilder(turn, maxTurns, anchorEntryId));

        // pi.sendUserMessage() is synchronous from ExtensionAPI. Give the
        // agent loop a chance to observe the queued user message before
        // waitForIdle(), otherwise waitForIdle() can race and return while
        // the turn has not actually started yet.
        const started = await waitForAgentToStart(ctx);
        if (!started) {
          throw new Error("agent turn did not start after sendUserMessage within 5s");
        }

        await ctx.waitForIdle();
        const branchLeafId = ctx.sessionManager.getLeafId();
        pi.setLabel(branchLeafId, `${labelPrefix}-turn-${turn}-done`);
        ctx.ui.notify(`${labelPrefix} turn ${turn}/${maxTurns} completed at ${branchLeafId.slice(0, 12)}`, "info");
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        state.active = false;
        persist("error");
        setStatus(ctx);
        ctx.ui.notify(`${labelPrefix} failed on turn ${turn}: ${state.lastError}`, "error");
        return;
      }
    }

    try {
      const nav = await ctx.navigateTree(anchorEntryId, { summarize: false, label: `${labelPrefix}-anchor-complete` });
      if (nav?.cancelled) {
        ctx.ui.notify("Final navigation back to anchor was cancelled", "warning");
      }
    } catch {
      // Non-fatal: the prototype branches are still useful to inspect.
    }
    state.active = false;
    persist("complete");
    setStatus(ctx);
    ctx.ui.notify(`${labelPrefix} complete. Inspect /tree for ${maxTurns} sibling branches from the anchor.`, "success");
  }

  pi.registerCommand("branch-loop-test", {
    description: "Prototype goal-loop context isolation by running sibling branches from one anchor",
    handler: async (args, ctx: any) => {
      const trimmed = args.trim();
      if (trimmed === "clear") {
        state = { active: false };
        persist("clear");
        setStatus(ctx);
        ctx.ui.notify("Branch loop prototype state cleared", "info");
        return;
      }
      if (state.active) {
        ctx.ui.notify("Branch loop prototype is already active; use /branch-loop-test clear first", "warning");
        return;
      }

      let maxTurns: number;
      try {
        maxTurns = parsePositiveInt(trimmed, 3);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      await runBranchLoopProbe(ctx, maxTurns, prototypePrompt, "branch-loop");
    },
  });

  pi.registerCommand("branch-loop-context-test", {
    description: "Prototype branch-loop parent-context retention and sibling isolation using existing parent context",
    handler: async (args, ctx: any) => {
      const trimmed = args.trim();
      if (state.active) {
        ctx.ui.notify("Branch loop prototype is already active; use /branch-loop-test clear first", "warning");
        return;
      }

      let maxTurns: number;
      try {
        maxTurns = parsePositiveInt(trimmed, 3);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      await runBranchLoopProbe(ctx, maxTurns, contextProbePrompt, "branch-loop-context");
    },
  });

  pi.registerCommand("branch-loop-seeded-context-test", {
    description: "Prototype parent-context retention by first seeding a sentinel, then branching from that point",
    handler: async (args, ctx: any) => {
      if (state.active) {
        ctx.ui.notify("Branch loop prototype is already active; use /branch-loop-test clear first", "warning");
        return;
      }

      const parts = args.trim().split(/\s+/).filter(Boolean);
      let maxTurns = 3;
      let sentinel = "";
      if (parts.length > 0 && /^\d+$/.test(parts[0]!)) {
        maxTurns = parsePositiveInt(parts.shift(), 3);
      }
      sentinel = parts.join(" ").trim();
      if (!sentinel) {
        sentinel = `SEEDED-SENTINEL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      }

      ctx.ui.notify(`Seeding parent context with sentinel, then anchoring after acknowledgement`, "info");
      pi.sendUserMessage(seededSetupPrompt(sentinel));
      const started = await waitForAgentToStart(ctx);
      if (!started) {
        ctx.ui.notify("Seed setup turn did not start within 5s", "error");
        return;
      }
      await ctx.waitForIdle();

      ctx.ui.notify(`Seed setup complete. Sentinel was ${sentinel}. Starting branch probe; prompts will not repeat it.`, "info");
      await runBranchLoopProbe(ctx, maxTurns, contextProbePrompt, "branch-loop-seeded-context");
    },
  });
}

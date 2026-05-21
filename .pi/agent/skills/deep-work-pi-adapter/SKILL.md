---
name: deep-work-pi-adapter
description: Use automatically when running Claude-origin deep-work skills in Pi. Maps harness-neutral or Claude-specific subagent language to pi-subagents without requiring the original skills to fork.
---

# Deep-work Pi Adapter

These instructions adapt the existing deep-work skills for Pi. The deep-work skills may mention Claude Code examples such as `TaskCreate`, `TaskUpdate`, `TaskList`, `Agent()`, `Explore()`, or generic phrases like "dispatch a fresh subagent". In Pi, preserve the process and use Pi-native tools.

## Subagent mapping

When a deep-work skill says to dispatch or run a fresh subagent, use the `subagent` tool from `pi-subagents` with `context: "fresh"` unless the user explicitly asks for forked/current conversation context.

Role mapping:

- `Agent(prompt)` or generic "task subagent" → `subagent({ agent: "agent", task: prompt, context: "fresh" })`
- `Explore(prompt)` or generic exploratory subagent → `subagent({ agent: "explore", task: prompt, context: "fresh" })`
- implementation subagent / implementer subagent → `subagent({ agent: "implementer", task: prompt, context: "fresh" })`
- spec compliance reviewer / spec reviewer subagent → `subagent({ agent: "spec-reviewer", task: prompt, context: "fresh" })`
- code quality reviewer subagent → `subagent({ agent: "code-quality-reviewer", task: prompt, context: "fresh" })`
- broad final review / quick-review session review → prefer `subagent({ agent: "reviewer", task: prompt, context: "fresh" })` unless a more specific review agent is requested.

If an exact mapped agent is unavailable, first call `subagent({ action: "list" })` and choose the closest available agent, preserving the intended role.

## Preserve deep-work process

Do not simplify away the deep-work workflow. In particular, for Phase 6 implementation:

1. Dispatch one fresh implementer subagent per narrow task.
2. After implementation, dispatch a fresh spec reviewer.
3. If spec review fails, send the specific findings back to an implementer subagent to fix, then re-review.
4. After spec passes, dispatch a fresh code quality reviewer.
5. If code quality review requests Critical or Significant changes, send those findings back to an implementer subagent to fix, then re-review.
6. Only mark a task complete after both reviews pass.

## Harness-specific wording

- Treat Claude Code `TaskCreate`, `TaskUpdate`, and `TaskList` references as examples from another harness. Use Pi's available todo/task mechanisms and the `subagent` tool instead.
- Treat `model: "sonnet"` as a Claude model preference. In Pi, use the current/default model unless the user or available Pi configuration provides a clear equivalent.
- Do not fork or edit the original deep-work skill instructions just to make them Pi-specific; this adapter is the Pi-specific interpretation layer.

## Prompt construction

When launching a subagent from a deep-work skill, include:

- the exact task text;
- the relevant plan excerpt or requirements;
- any constraints from the deep-work skill;
- expected output shape;
- validation expectations;
- review findings when asking an implementer to fix issues.

Do not ask subagents to read the whole deep-work plan unless needed. Keep each subagent's scope narrow.

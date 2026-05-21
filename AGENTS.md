# pi-essentials instructions

This repo contains Pi-native workflow assets.

When editing skills:

- Avoid Claude Code-only tool names (`AskUserQuestion`, `TodoWrite`, `TaskCreate`, `TeamCreate`, `SendMessage`, slash-command assumptions).
- Prefer harness-neutral language plus Pi examples.
- Use Pi tools by name only where helpful: `read`, `bash`, `edit`, `write`, `subagent`.
- Do not hardcode Claude model names. Use capability language such as “default strong reasoning model”, “standard coding model”, or “independent reviewer”.
- Keep artifacts resumable through markdown and `.state.json` rather than in-memory session state.
- Preserve the Phase 2 bias firewall: Phase 2 must never read `00-ticket.md` or receive the original user prompt in inherited context.

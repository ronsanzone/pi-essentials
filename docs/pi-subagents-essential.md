# pi-subagents-essential

`pi-subagents-essential` is the `pi-essentials` local fork of `pi-subagents`.

## Upstream base

- Upstream package: `pi-subagents`
- Forked from installed version: `0.25.0`
- Local package path: `.pi/agent/packages/pi-subagents-essential`

## Why this fork exists

The upstream package discovers project subagents by recursively scanning the legacy `.agents/` directory for Markdown files with `name` and `description` frontmatter. That misclassifies Agent Skills / Claude marketplace plugin skills as executable subagents in repos that follow the `agentskills.io` layout, for example:

```text
.agents/skills/*/SKILL.md
.agents/marketplace/plugins/*/skills/*/SKILL.md
```

Those files are skills, not subagents. Listing or launching them as subagents is confusing and can bloat/blur orchestration behavior.

## Local behavior

This fork keeps subagent functionality but makes discovery Agent Skills-safe:

- `SKILL.md` is never treated as a subagent.
- `.agents/skills/**` is not treated as subagents.
- `.pi/skills/**` is not treated as subagents.
- `.agents/marketplace/plugins/**/skills/**` is not treated as subagents.

Real subagents should live in explicit agent locations such as:

```text
~/.pi/agent/agents/
.pi/agents/
.agents/agents/
```

## Validation

Run:

```bash
cd ~/.pi/agent/packages/pi-subagents-essential
npm test
```

The regression test verifies that MMS-style Agent Skills trees are not discovered as subagents while real `.agents/agents/*.md` files are.

## Updating from upstream

1. Copy upstream `pi-subagents` into `.pi/agent/packages/pi-subagents-essential`.
2. Restore the local package name/version in `package.json`.
3. Reapply the Agent Skills-safe discovery patch in `src/agents/agents.ts`.
4. Run `npm test` in the fork.
5. In an MMS Pi session, run `subagent({ action: "list" })` and confirm marketplace skills are absent.

# pi-subagents-essential

`pi-subagents-essential` is the fork of `pi-subagents` used by this `pi-essentials` config.

## Source location

- Upstream package: `pi-subagents`
- Fork repo: `git@github.com:ronsanzone/pi-subagents-essentials.git`
- Development checkout: `~/code/pi-subagents-essentials`
- Loaded by this repo through `agent/settings.json` as a Git Pi package pinned to `main` after installation to `~/.pi/agent/settings.json`.

The fork source is intentionally **not vendored in this repo**. Keep subagent package changes in `~/code/pi-subagents-essentials`, push them to `origin/main`, and let Pi install/update the Git package.

## Why this fork exists

The upstream package discovers project subagents by recursively scanning the legacy `.agents/` directory for Markdown files with `name` and `description` frontmatter. That misclassifies Agent Skills / Claude marketplace plugin skills as executable subagents in repos that follow the `agentskills.io` layout, for example:

```text
.agents/skills/*/SKILL.md
.agents/marketplace/plugins/*/skills/*/SKILL.md
```

Those files are skills, not subagents. Listing or launching them as subagents is confusing and can bloat/blur orchestration behavior.

## Fork behavior

The fork keeps subagent functionality but makes discovery Agent Skills-safe:

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

Run in the fork checkout:

```bash
cd ~/code/pi-subagents-essentials
node --experimental-strip-types --test test/unit/agent-frontmatter.test.ts --test-name-pattern "Agent Skills"
```

For a full test run, install the fork's dev dependencies first:

```bash
cd ~/code/pi-subagents-essentials
npm install
npm test
```

## Updating from upstream

1. Pull/rebase upstream changes in `~/code/pi-subagents-essentials`.
2. Reapply or verify the Agent Skills-safe discovery patch in `src/agents/agents.ts`.
3. Run the validation test above.
4. Commit and push the fork changes to `origin/main`.
5. In this repo, run `pi update --extensions` if you need to reconcile the installed Git package immediately.
6. In a Pi session, run `subagent({ action: "list" })` and confirm marketplace skills are absent.

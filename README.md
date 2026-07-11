# pi-essentials

Pi core configuration, extensions, themes, local skills, and workflow assets.

This package owns Pi-specific configuration paths via symlinks into `~/.pi/agent`. Shared Agent Skills installed with `npx skills` live in `~/.agents/skills` and are not owned by this repository.

## Layout

```text
agent/
  AGENTS.md                    # installed as ~/.pi/agent/AGENTS.md
  settings.json                # installed as ~/.pi/agent/settings.json
agents/                        # custom Pi subagents; installed as ~/.pi/agent/agents
extensions/                    # Pi extensions; installed as ~/.pi/agent/extensions
extensions.disabled/           # disabled extension experiments; installed as ~/.pi/agent/extensions.disabled
skills-local/                  # Pi-specific skills; installed as ~/.pi/agent/skills-local
npm/                           # package metadata/reference; runtime npm state stays under ~/.pi/agent/npm
themes/                        # installed as ~/.pi/agent/themes
install.sh                     # symlink/migration installer
```

## Not packaged

The installer intentionally leaves these local under `~/.pi/agent`:

- `auth.json`
- `mcp-oauth/`
- `mcp-cache.json`
- `mcp-onboarding.json`
- `sessions/`
- `run-history.jsonl`
- model backups
- Pi-managed npm package state under `npm/`

Shared skills installed by `npx skills` are managed outside this repository at:

```text
~/.agents/skills/
```

Pi discovers that directory automatically. Do not install npx skills into a symlinked `~/.pi/agent/skills` path.

## Install

```bash
~/code/pi-essentials/install.sh
```

The script:

1. backs up existing managed paths to `~/.pi/agent.backups/<timestamp>/`;
2. replaces them with symlinks into this repo.

Managed paths:

```text
~/.pi/agent/AGENTS.md
~/.pi/agent/settings.json
~/.pi/agent/agents
~/.pi/agent/extensions
~/.pi/agent/extensions.disabled
~/.pi/agent/skills-local
~/.pi/agent/themes
```

## Skill ownership

- `~/.agents/skills` is the shared, npx-managed skill store for Pi, Claude Code, Codex, and other harnesses.
- `~/.pi/agent/skills-local` contains only Pi-specific skills owned by this repository.
- `~/.pi/agent/skills` is intentionally not managed by this package.
- Workflow-specific agents from context-engineering-workflows-v2 live under `~/.agents`.
- Keep agent names unique across `agents/` and `~/.agents` so Pi subagent discovery has one winner.
- `pi-skill-toggle` inventories both shared and Pi-local roots.
- The optional private `mongo-pi-extensions` package is mounted at `~/.pi/agent/private-packages/mongo-pi-extensions` and appears after the public package entries in `agent/settings.json`.

## Context debugging

The `context-debug` extension captures Pi system prompt, message context, and provider payload diagnostics on demand.

```text
/context-debug status
/context-debug on
/context-debug off
/context-debug once
/context-debug report
```

Reports are written outside repos by default under `~/.pi/agent/context-debug/runs/`.

## Deep-work phase scope

Deep-work skill assets are no longer installed from this package. Any deep-work harness or skill package is responsible for selecting phases, preserving context boundaries, enforcing gates, and installing its own runtime assets.

## Porting principles

- Keep artifacts under `~/notes/context-engineering/<repo>/<topic-slug>/`.
- Preserve the Phase 1 → Phase 2 bias firewall.
- Prefer markdown state over harness-specific task state.
- Replace Claude Code-specific APIs with Pi-native tools and `subagent` delegation.
- Use model capability tiers rather than hardcoded model names.
- Optimize for GPT-5.5-style models with adaptive gates and risk-based review.

## Pi tool vocabulary

- File reads: `read`
- Search/shell: `bash` with `rg`, `find`, `git`, test commands, etc.
- Edits: `edit` or `write`
- Delegation: Pi `subagent`
- Progress tracking: artifacts, `.state.json`, and `05-plan.md` Execution Progress

## Install-managed asset contract

Each install-managed asset should be portable and non-secret. Runtime state, credentials, generated caches, synced third-party skills, and host-specific provider setup should live outside this repo or in their own package.

## Changelog

07-09: the subagent extension does not work well with 5.6 models. They get lost and burn a lot of tokens. Removing it for now. Add it back with `"git:git@github.com:ronsanzone/pi-subagents-essentials.git@main"` in settings.

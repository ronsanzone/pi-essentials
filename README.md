# pi-essentials

Pi agents, extensions, themes, model config, and workflow assets.

This package owns a small set of Pi configuration paths via symlinks into `~/.pi/agent`.

## Layout

```text
agent/
  AGENTS.md                    # installed as ~/.pi/agent/AGENTS.md
  settings.json                # installed as ~/.pi/agent/settings.json
agents/                        # custom Pi subagents; installed as ~/.pi/agent/agents
extensions/                    # Pi extensions; installed as ~/.pi/agent/extensions
extensions.disabled/           # disabled extension experiments kept for reference only
npm/                           # package metadata kept in repo; not installed by install.sh
themes/                        # installed as ~/.pi/agent/themes
install.sh                     # symlink installer
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
~/.pi/agent/themes
```

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

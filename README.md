# pi-essentials

Pi- and GPT-optimized skills, agents, extensions, themes, model config, and workflow assets.

This package owns non-secret Pi configuration via symlinks into `~/.pi/agent`. Runtime state, credentials, and MongoDB/Grove-specific provider configuration remain outside this package.

## Layout

```text
.pi/agent/
  AGENTS.md
  agents/                      # custom Pi subagents
  extensions/                  # Pi extensions
  extensions.disabled/         # disabled extensions kept for reference
  npm/                         # package.json for Pi npm packages
  packages/                    # local Pi package forks
  scripts/                     # helper scripts
  settings.json                # Pi user settings
  skills/                      # Pi skills
    _shared/
      dw-setup.sh              # resolves repo/topic/artifact directory
    deep-work-pi-adapter/
    dw-01-research-questions/  # Phase 1
    dw-02-research/            # Phase 2 + bias-firewall extractor
    dw-03-design-discussion/   # Phase 3
    dw-04-outline/             # Phase 4
    dw-05-plan/                # Phase 5 + co-located plan-review prompt
    dw-06-implement/           # Adaptive implementation worker
  themes/
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
2. replaces them with symlinks into this repo;
3. runs `npm install` in `.pi/agent/npm`.

Managed paths:

```text
~/.pi/agent/AGENTS.md
~/.pi/agent/agents
~/.pi/agent/extensions
~/.pi/agent/extensions.disabled
~/.pi/agent/scripts
~/.pi/agent/themes
~/.pi/agent/skills
~/.pi/agent/settings.json
~/.pi/agent/npm
~/.pi/agent/packages
```

## Local package forks

### `pi-subagents-essential`

`pi-subagents-essential` is a local fork of `pi-subagents` with Agent Skills-safe discovery. It prevents `SKILL.md` files and Claude/Agent Skills marketplace plugin trees from being listed as executable subagents. See `docs/pi-subagents-essential.md`.

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

The deep-work skills are **phase workers**, not an end-to-end pipeline controller. A separate harness is responsible for selecting phases, preserving context boundaries, enforcing gates, and invoking these skills.

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

## Phase contract

Each deep-work phase should:

1. Resolve `REPO`, `TOPIC_SLUG`, and `ARTIFACT_DIR` with `.pi/agent/skills/_shared/dw-setup.sh`.
2. Validate prerequisite artifacts.
3. Read only the artifacts allowed for that phase.
4. Write its output artifact.
5. Run any required co-located review prompt for that phase, if specified.
6. Update `.state.json` conservatively.
7. Return a concise summary and artifact path to the harness/user.

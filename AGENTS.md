# pi-essentials repo guidance

This repo contains source-controlled Pi assets. The repo layout is source-oriented; `install.sh` is responsible for symlinking assets into the runtime location under `~/.pi/agent`.

## Layout

- `agent/AGENTS.md` -> installed as `~/.pi/agent/AGENTS.md`.
- `agent/settings.json` -> installed as `~/.pi/agent/settings.json`.
- `agents/` -> installed as `~/.pi/agent/agents`.
- `skills/` -> installed as `~/.pi/agent/skills` (hand-curated, ours).
- `skills-synced/` -> installed as `~/.pi/agent/skills-synced` (upstream-synced via `skills-lock.json`).
- `skills-lock.json` -> installed as `~/.pi/agent/skills-lock.json` (hash-pinned sync manifest).
- `themes/` -> installed as `~/.pi/agent/themes`.
- `extensions.disabled/` -> installed as `~/.pi/agent/extensions.disabled`.
- `npm/` -> installed as `~/.pi/agent/npm`.
- `extensions/*` -> overlaid into `~/.pi/agent/extensions/*`.
- `scripts/*` -> overlaid into `~/.pi/agent/scripts/*`.

## Adding or changing assets

- Add Pi subagents as Markdown files in `agents/`.
- Add skills as directories under `skills/<skill-name>/` with `SKILL.md` plus any helper files.
- Sync an **upstream** skill (instead of hand-forking): add an entry to `skills-lock.json`, then run `python3 scripts/sync-skills.py --update`. The skill lands in `skills-synced/<name>/`. Do not hand-edit `skills-synced/` — it is generated. To bump, re-run `--update` and commit the new content + hash. To detect upstream drift, run `python3 scripts/sync-skills.py` (verify mode, network).
- Add extensions as TypeScript files in `extensions/`.
- Keep disabled extension experiments in `extensions.disabled/`.
- Add themes in `themes/`.
- Add user-level Pi settings in `agent/settings.json` only when they are non-secret and portable.
- Add npm dependencies for extensions/tools in `npm/package.json`; let `install.sh` run `npm install`.

Do not commit runtime state or secrets. Keep auth, sessions, caches, OAuth data, and host-specific generated state under the real `~/.pi/agent`, not in this repo.

## Skill authoring

- Prefer harness-neutral language plus Pi examples.
- Avoid Claude Code-only tool names such as `AskUserQuestion`, `TodoWrite`, `TaskCreate`, `TeamCreate`, and `SendMessage`.
- Mention Pi tools by name only where helpful: `read`, `bash`, `edit`, `write`, `subagent`.
- Do not hardcode Claude model names; use capability language such as “default strong reasoning model”, “standard coding model”, or “independent reviewer”.
- Keep long-running workflow artifacts resumable through Markdown and `.state.json`, not in-memory session state.
- Preserve the deep-work Phase 2 bias firewall: Phase 2 must never read `00-ticket.md` or receive the original user prompt in inherited context.

## Install and verify

After changing install-managed assets, run:

```bash
bash -n install.sh
./install.sh
```

Verify representative symlinks:

```bash
ls -l ~/.pi/agent/AGENTS.md \
      ~/.pi/agent/settings.json \
      ~/.pi/agent/agents \
      ~/.pi/agent/skills \
      ~/.pi/agent/extensions \
      ~/.pi/agent/npm
```

For subagent changes, start a fresh Pi session or reload packages as needed, then verify discovery:

```text
subagent({ action: "list" })
```

For extension or package changes, restart/reload Pi as needed and check extension startup output. If npm dependencies changed, expect `install.sh` to update `npm/package-lock.json`.

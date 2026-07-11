# pi-essentials repo guidance

This repo contains source-controlled Pi assets. The repo layout is source-oriented; `install.sh` is responsible for symlinking assets into the runtime location under `~/.pi/agent`.

## Layout

- `agent/AGENTS.md` -> installed as `~/.pi/agent/AGENTS.md`.
- `agent/settings.json` -> installed as `~/.pi/agent/settings.json`.
- `agents/` -> installed as `~/.pi/agent/agents`.
- `skills-local/` -> installed as `~/.pi/agent/skills-local` (Pi-specific skills owned by this repo).
- `themes/` -> installed as `~/.pi/agent/themes`.
- `extensions.disabled/` -> installed as `~/.pi/agent/extensions.disabled`.
- `npm/` -> package metadata/reference only; Pi runtime npm state stays under the real `~/.pi/agent/npm`.
- `extensions/*` -> installed as `~/.pi/agent/extensions/*`.
- Shared Agent Skills installed by `npx skills` live at `~/.agents/skills` and are discovered by Pi automatically.

## Adding or changing assets

- Add Pi subagents as Markdown files in `agents/`.
- Add Pi-specific skills as directories under `skills-local/<skill-name>/` with `SKILL.md` plus any helper files.
- Install shared or upstream skills through the owning source repository's `npx skills` workflow; do not add generated links or copied third-party skills to this repository.
- Add extensions as TypeScript files in `extensions/`.
- Keep disabled extension experiments in `extensions.disabled/`.
- Add themes in `themes/`.
- Add user-level Pi settings in `agent/settings.json` only when they are non-secret and portable.
- Keep Pi-managed package dependencies outside this repository under the real `~/.pi/agent/npm`.

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
      ~/.pi/agent/extensions \
      ~/.pi/agent/extensions.disabled \
      ~/.pi/agent/skills-local \
      ~/.pi/agent/npm \
      ~/.agents/skills
```

For subagent changes, start a fresh Pi session or reload packages as needed, then verify discovery:

```text
subagent({ action: "list" })
```

For extension or package changes, restart/reload Pi as needed and check extension startup output. Pi-managed npm dependencies are installed under the real `~/.pi/agent/npm`; changes to this repo's `npm/package.json` are reference changes, not runtime symlink changes.

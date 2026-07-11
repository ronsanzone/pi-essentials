#!/usr/bin/env bash
# Install pi-essentials into ~/.pi/agent using symlinks.
# Non-secret, user-authored config is owned by this repo. Runtime state/secrets remain local.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.pi/agent"
BACKUP_ROOT="$HOME/.pi/agent.backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST" "$BACKUP_ROOT"

backup_existing() {
  local dest="$1" name="$2"
  local backup_dir="$BACKUP_ROOT/$STAMP"
  mkdir -p "$backup_dir"
  echo "backup $dest -> $backup_dir/$name"
  mv "$dest" "$backup_dir/$name"
}

link_path() {
  local src_rel="$1"
  local dest_rel="$2"
  local src="$ROOT/$src_rel"
  local dest="$DEST/$dest_rel"

  if [[ ! -e "$src" && ! -L "$src" ]]; then
    echo "skip missing $src_rel"
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local target
    target="$(readlink "$dest")"
    if [[ "$target" == "$src" ]]; then
      echo "ok link $dest -> $src"
      return 0
    fi
    echo "remove existing symlink $dest -> $target"
    rm "$dest"
  elif [[ -e "$dest" ]]; then
    backup_existing "$dest" "${dest_rel//\//-}"
  fi

  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "link $dest -> $src"
}

# Remove links from the pre-npx Pi layout, but only when they point into this
# repository. Runtime content owned by another package is left alone.
detach_legacy_repo_link() {
  local dest_rel="$1"
  local src_rel="$2"
  local dest="$DEST/$dest_rel"
  local expected="$ROOT/$src_rel"

  [[ -L "$dest" ]] || return 0
  if [[ "$(readlink "$dest")" == "$expected" ]]; then
    echo "remove obsolete repo link $dest -> $expected"
    rm "$dest"
  fi
}

# npx skills now owns ~/.agents/skills. These links were part of the old
# package-owned layout and must not redirect generated runtime state into Git.
detach_legacy_repo_link "skills" "skills"
detach_legacy_repo_link "skills-synced" "skills-synced"
detach_legacy_repo_link "skills-lock.json" "skills-lock.json"
detach_legacy_repo_link "scripts/sync-skills.py" "scripts/sync-skills.py"
detach_legacy_repo_link "packages" ".pi/agent/packages"
detach_legacy_repo_link "npm" "npm"

# A real ~/.pi/agent/skills directory is also legacy state: npx skills owns
# ~/.agents/skills, while this package owns only skills-local. Preserve any
# manually-created legacy content in the normal Pi backup location.
if [[ -d "$DEST/skills" && ! -L "$DEST/skills" ]]; then
  backup_existing "$DEST/skills" "skills-legacy"
fi

# Keep Pi's package-manager state outside source repositories. Preserve the
# current install once when migrating from the old npm symlink; future package
# installs are owned by Pi under this real directory.
if [[ ! -e "$DEST/npm" && -d "$ROOT/npm" ]]; then
  mkdir -p "$DEST/npm"
  for metadata in package.json package-lock.json; do
    [[ -f "$ROOT/npm/$metadata" ]] && cp -p "$ROOT/npm/$metadata" "$DEST/npm/$metadata"
  done
  if [[ -d "$ROOT/npm/node_modules" ]]; then
    cp -a "$ROOT/npm/node_modules" "$DEST/npm/node_modules"
  fi
  echo "materialized Pi npm state at $DEST/npm"
fi

# Whole-path assets managed by this package.
link_path "agent/AGENTS.md" "AGENTS.md"
link_path "agent/settings.json" "settings.json"
link_path "agents" "agents"
link_path "extensions" "extensions"
link_path "extensions.disabled" "extensions.disabled"
link_path "skills-local" "skills-local"
link_path "themes" "themes"

cat <<MSG

pi-essentials installed.

Managed links now point from:
  $DEST/{AGENTS.md,settings.json,agents,extensions,extensions.disabled,skills-local,themes}

to package files under:
  $ROOT/{agent/AGENTS.md,agent/settings.json,agents,extensions,extensions.disabled,skills-local,themes}

Pi package state is intentionally real and runtime-owned:
  $DEST/npm

Shared npx skills are intentionally outside this package:
  $HOME/.agents/skills

Runtime/secrets intentionally not managed:
  auth.json, mcp-oauth/, mcp-cache.json, mcp-onboarding.json, sessions/, run-history.jsonl

Backups, if any, are under:
  $BACKUP_ROOT/$STAMP
MSG

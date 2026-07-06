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

# Whole-path assets managed by this package.
link_path "agent/AGENTS.md" "AGENTS.md"
link_path "agent/settings.json" "settings.json"
link_path "agents" "agents"
link_path "extensions" "extensions"
link_path "themes" "themes"

cat <<MSG

pi-essentials installed.

Managed links now point from:
  $DEST/{AGENTS.md,settings.json,agents,extensions,themes}

to package files under:
  $ROOT/{agent/AGENTS.md,agent/settings.json,agents,extensions,themes}

Runtime/secrets intentionally not managed:
  auth.json, mcp-oauth/, mcp-cache.json, mcp-onboarding.json, sessions/, run-history.jsonl

Backups, if any, are under:
  $BACKUP_ROOT/$STAMP
MSG

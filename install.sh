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

link_overlay_dir_files() {
  local src_rel="$1"
  local dest_rel="$2"
  local src_dir="$ROOT/$src_rel"
  local dest_dir="$DEST/$dest_rel"

  [[ -d "$src_dir" ]] || return 0

  if [[ -L "$dest_dir" ]]; then
    echo "remove existing $dest_rel directory symlink $dest_dir -> $(readlink "$dest_dir")"
    rm "$dest_dir"
  elif [[ -e "$dest_dir" && ! -d "$dest_dir" ]]; then
    backup_existing "$dest_dir" "${dest_rel//\//-}"
  fi
  mkdir -p "$dest_dir"

  shopt -s nullglob
  for src in "$src_dir"/*; do
    local base dest
    base="$(basename "$src")"
    dest="$dest_dir/$base"
    if [[ -L "$dest" ]]; then
      local target
      target="$(readlink "$dest")"
      if [[ "$target" == "$src" ]]; then
        echo "ok link $dest -> $src"
        continue
      fi
      echo "remove existing symlink $dest -> $target"
      rm "$dest"
    elif [[ -e "$dest" ]]; then
      backup_existing "$dest" "${dest_rel//\//-}-$base"
    fi
    ln -s "$src" "$dest"
    echo "link $dest -> $src"
  done
  shopt -u nullglob
}

# Whole-path assets managed by this package.
link_path "agent/AGENTS.md" "AGENTS.md"
link_path "agent/settings.json" "settings.json"
link_path "agents" "agents"
link_path "extensions.disabled" "extensions.disabled"
link_path "themes" "themes"
link_path "skills" "skills"
link_path "skills-synced" "skills-synced"
link_path "skills-lock.json" "skills-lock.json"
link_path "npm" "npm"

# Overlay directories: other packages may add their own extension/script symlinks here.
link_overlay_dir_files "extensions" "extensions"
link_overlay_dir_files "scripts" "scripts"

# Check optional native CLIs used by extensions. ketch-web.ts registers web_search
# and web_scrape, but the ketch binary is installed outside this repo.
if command -v ketch >/dev/null 2>&1; then
  echo "ok ketch $(ketch --version 2>/dev/null || true)"
else
  echo "WARN: ketch CLI is not on PATH; web_search and web_scrape will fail" >&2
  echo "  install: brew install 1broseidon/tap/ketch" >&2
  echo "  or:      go install github.com/1broseidon/ketch@latest" >&2
fi

# Install npm dependencies into package-owned npm dir, if npm is available.
NPM_DIR="$ROOT/npm"
if command -v npm >/dev/null 2>&1; then
  if [[ -f "$NPM_DIR/package.json" ]]; then
    echo "install npm dependencies in $NPM_DIR"
    (cd "$NPM_DIR" && npm install)
  else
    echo "skip npm install for $NPM_DIR (package.json missing)"
  fi
else
  echo "skip npm install (npm unavailable)"
fi

# Verify synced skills match the committed lock (no network; catches local
# corruption / accidental edits to skills-synced/). Run the syncer with
# --update over the network to detect upstream drift or bump a skill.
if command -v python3 >/dev/null 2>&1 && [[ -f "$ROOT/skills-lock.json" ]]; then
  echo "verify synced skills against lock"
  (cd "$ROOT" && python3 scripts/sync-skills.py --from-disk) || {
    echo "WARN: skills-synced/ does not match skills-lock.json" >&2
    echo "  run: python3 $ROOT/scripts/sync-skills.py --update   # to re-fetch + repin" >&2
  }
fi

cat <<MSG

pi-essentials installed.

Managed links now point from:
  $DEST/{AGENTS.md,agents,extensions.disabled,themes,skills,skills-synced,skills-lock.json,settings.json,npm}

Overlay links are installed into:
  $DEST/{extensions,scripts}

to package files under:
  $ROOT/{agent,agents,extensions,extensions.disabled,themes,skills,skills-synced,skills-lock.json,npm,scripts}

Runtime/secrets intentionally not managed:
  auth.json, mcp-oauth/, mcp-cache.json, mcp-onboarding.json, sessions/, run-history.jsonl

MongoDB/Grove-specific provider config and sandbox helpers are managed by mongo-pi-extensions.

Backups, if any, are under:
  $BACKUP_ROOT/$STAMP
MSG

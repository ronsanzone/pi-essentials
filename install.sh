#!/usr/bin/env bash
# Install pi-essentials into ~/.pi/agent using symlinks.
# Non-secret, user-authored config is owned by this repo. Runtime state/secrets remain local.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/.pi/agent"
DEST="$HOME/.pi/agent"
BACKUP_ROOT="$HOME/.pi/agent.backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: package config not found at $SRC" >&2
  exit 1
fi

mkdir -p "$DEST" "$BACKUP_ROOT"

backup_existing() {
  local dest="$1" name="$2"
  local backup_dir="$BACKUP_ROOT/$STAMP"
  mkdir -p "$backup_dir"
  echo "backup $dest -> $backup_dir/$name"
  mv "$dest" "$backup_dir/$name"
}

link_item() {
  local name="$1"
  local src="$SRC/$name"
  local dest="$DEST/$name"

  if [[ ! -e "$src" && ! -L "$src" ]]; then
    echo "skip missing $name"
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
    backup_existing "$dest" "$name"
  fi

  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "link $dest -> $src"
}

link_overlay_dir_files() {
  local name="$1"
  local src_dir="$SRC/$name"
  local dest_dir="$DEST/$name"

  [[ -d "$src_dir" ]] || return 0

  if [[ -L "$dest_dir" ]]; then
    echo "remove existing $name directory symlink $dest_dir -> $(readlink "$dest_dir")"
    rm "$dest_dir"
  elif [[ -e "$dest_dir" && ! -d "$dest_dir" ]]; then
    backup_existing "$dest_dir" "$name"
  fi
  mkdir -p "$dest_dir"

  for src in "$src_dir"/*; do
    [[ -e "$src" ]] || continue
    local dest="$dest_dir/$(basename "$src")"
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
      backup_existing "$dest" "$name-$(basename "$src")"
    fi
    ln -s "$src" "$dest"
    echo "link $dest -> $src"
  done
}

# Whole-path assets managed by this package.
for item in AGENTS.md agents extensions.disabled themes skills settings.json npm packages; do
  link_item "$item"
done

# Overlay directories: other packages may add their own extension/script symlinks here.
link_overlay_dir_files extensions
link_overlay_dir_files scripts

# Install npm dependencies into package-owned npm dirs, if npm is available.
if command -v npm >/dev/null 2>&1; then
  if [[ -f "$SRC/npm/package.json" ]]; then
    echo "install npm dependencies in $SRC/npm"
    (cd "$SRC/npm" && npm install)
  else
    echo "skip npm install for $SRC/npm (package.json missing)"
  fi

  if [[ -d "$SRC/packages" ]]; then
    for package_json in "$SRC"/packages/*/package.json; do
      [[ -f "$package_json" ]] || continue
      package_dir="$(dirname "$package_json")"
      echo "install npm dependencies in $package_dir"
      (cd "$package_dir" && npm install)
    done
  fi
else
  echo "skip npm install (npm unavailable)"
fi

cat <<MSG

pi-essentials installed.

Managed links now point from:
  $DEST/{AGENTS.md,agents,extensions.disabled,themes,skills,settings.json,npm,packages}

Overlay links are installed into:
  $DEST/{extensions,scripts}

to package files under:
  $SRC

Runtime/secrets intentionally not managed:
  auth.json, mcp-oauth/, mcp-cache.json, mcp-onboarding.json, sessions/, run-history.jsonl

MongoDB/Grove-specific provider config and sandbox helpers are managed by mongo-pi-extensions.

Backups, if any, are under:
  $BACKUP_ROOT/$STAMP
MSG

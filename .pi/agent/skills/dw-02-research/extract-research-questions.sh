#!/usr/bin/env bash
# Bias firewall: extracts ONLY the "## Research Questions" section from a
# Phase 1 artifact, never exposing the original prompt above it.
#
# Usage: extract-research-questions.sh <repo> <topic-slug>
# Exit codes: 0 = success, 1 = missing args/file/section

set -euo pipefail

repo="${1:?Usage: extract-research-questions.sh <repo> <topic-slug>}"
slug="${2:?Usage: extract-research-questions.sh <repo> <topic-slug>}"

artifact="$HOME/notes/context-engineering/${repo}/${slug}/01-research-questions.md"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: Phase 1 artifact not found at ${artifact}" >&2
  exit 1
fi

questions=$(sed -n '/^## Research Questions$/,$ p' "$artifact")

if [[ -z "$questions" ]]; then
  echo "ERROR: No '## Research Questions' section found in artifact" >&2
  exit 1
fi

echo "$questions"

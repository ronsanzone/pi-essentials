#!/usr/bin/env bash
# dw-setup.sh — Resolve the standard deep-work skill setup variables.
#
# Usage: dw-setup.sh <topic-slug>
#
# On success (exit 0), prints three KEY=VALUE lines to stdout:
#   REPO=<derived from `git remote get-url origin`, falls back to basename of pwd>
#   TOPIC_SLUG=<the slug passed in>
#   ARTIFACT_DIR=<$HOME/notes/context-engineering/<repo>/<slug>, mkdir -p applied>
#
# On missing slug (exit 2), prints "MISSING_SLUG" to stderr.

args="${*:-}"
slug=""
for arg in $args; do
    case "$arg" in
        --*) ;;  # skip flags
        *) [ -z "$slug" ] && slug="$arg" ;;
    esac
done
if [ -z "$slug" ]; then
    echo "MISSING_SLUG" >&2
    exit 2
fi

# Accept either a topic slug or a path to a deep-work artifact/plan. Some
# implementation entrypoints pass the full plan path; normalize that to the
# containing topic directory so ARTIFACT_DIR never nests an absolute path under
# ~/notes/context-engineering/<repo>.
case "$slug" in
    */plan.md|*/00-ticket.md|*/01-research-questions.md|*/02-research.md|*/03-design-discussion.md|*/04-structure-outline.md|*/05-plan.md)
        slug=$(basename "$(dirname "$slug")")
        ;;
    */)
        slug=$(basename "${slug%/}")
        ;;
    */*)
        if [ -d "$slug" ]; then
            slug=$(basename "$slug")
        fi
        ;;
esac

repo=$(basename "$(git remote get-url origin 2>/dev/null | sed 's/.git$//')" 2>/dev/null)
if [ -z "$repo" ]; then
    repo=$(basename "$(pwd)")
fi
if [ -z "$repo" ]; then
    echo "MISSING_REPO" >&2
    exit 3
fi
artifact_dir="$HOME/notes/context-engineering/$repo/$slug"

mkdir -p "$artifact_dir"

printf 'REPO=%s\n' "$repo"
printf 'TOPIC_SLUG=%s\n' "$slug"
printf 'ARTIFACT_DIR=%s\n' "$artifact_dir"

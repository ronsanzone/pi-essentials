#!/usr/bin/env python3
"""sync-skills.py — generic, hash-pinned agent-skill syncer.

Reads a lock file describing github-backed skills, fetches each at a pinned ref,
verifies a SHA-256 hash, and writes them to an output directory. Designed to be
source-agnostic and self-contained so it can be extracted into a standalone
skills package without pi-essentials-specific changes.

Lock file schema (v1):

  {
    "version": 1,
    "skills": {
      "<name>": {
        "source": "<owner>/<repo>",      # github owner/repo
        "sourceType": "github",          # only "github" supported currently;
                                          #  dispatch is by sourceType so adding
                                          #  "gitlab"/"local" later is a clean
                                          #  extension point
        "skillPath": "<path>",           # directory  -> fetch all blobs under it
                                          #  *.md file -> fetch just that file
        "ref": "<sha|branch|HEAD>",      # optional, default "HEAD"
        "computedHash": "<sha256>"       # empty/missing on first run; --update
                                          #  populates it; verify mode fails on
                                          #  mismatch
      }
    }
  }

Hash algorithm (deterministic, reproducible without re-fetching):

  computedHash = sha256( concat over each synced file sorted by relative path:
                          relpath + "\\n" + raw_file_bytes )

  - Single-file skills: relpath is the output filename (e.g. "SKILL.md").
  - Directory skills:   relpath is the path relative to the skill directory.

Usage:
  python3 sync-skills.py                    # verify: fetch + check hashes; fail on mismatch
  python3 sync-skills.py --update           # fetch + write computedHash back to lock file
  python3 sync-skills.py --lock PATH --out DIR   # override default locations
  python3 sync-skills.py --skill NAME       # sync only one skill
  python3 sync-skills.py --dry-run          # fetch + report, write nothing

Defaults:
  --lock  $SYNC_LOCK or ./skills-lock.json
  --out   $SYNC_OUT  or ./skills-synced

Exit codes: 0 success, 1 hash mismatch / fetch error, 2 bad usage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
import urllib.error
from pathlib import Path

GITHUB_API = "https://api.github.com"
GITHUB_RAW = "https://raw.githubusercontent.com"


# --------------------------------------------------------------------------- #
# HTTP helpers
# --------------------------------------------------------------------------- #

def http_get(url: str, *, accept: str = "application/json", token_env: str = "GITHUB_TOKEN") -> bytes:
    """GET a URL. Sends a bearer token from $GITHUB_TOKEN if present (raises rate limit)."""
    headers = {"Accept": accept, "User-Agent": "sync-skills.py"}
    token = os.environ.get(token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"HTTP {e.code} for {url}: {body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"network error for {url}: {e}") from e


def fetch_json(url: str):
    return json.loads(http_get(url, accept="application/vnd.github+json").decode("utf-8"))


def fetch_bytes(url: str) -> bytes:
    return http_get(url, accept="application/octet-stream")


# --------------------------------------------------------------------------- #
# github source adapter
# --------------------------------------------------------------------------- #

def resolve_ref(source: str, ref: str) -> str:
    """Resolve a ref (sha / branch / 'HEAD') to a concrete commit sha.

    'HEAD' is resolved via the repo's default branch (robust against transient
    504s on the /commits/HEAD endpoint seen for some repos).
    """
    if len(ref) == 40 and all(c in "0123456789abcdef" for c in ref.lower()):
        return ref
    if ref == "HEAD" or ref.lower() == "head":
        # /commits/HEAD is the cheap path but intermittently 504s; fall back to
        # resolving the default branch via repo metadata.
        try:
            return fetch_json(f"{GITHUB_API}/repos/{source}/commits/HEAD")["sha"]
        except Exception:
            default_branch = fetch_json(f"{GITHUB_API}/repos/{source}")["default_branch"]
            return fetch_json(f"{GITHUB_API}/repos/{source}/commits/{default_branch}")["sha"]
    return fetch_json(f"{GITHUB_API}/repos/{source}/commits/{ref}")["sha"]


def list_blobs_under(source: str, sha: str, prefix: str) -> list[str]:
    """Return all blob paths under `prefix/` in the tree at `sha`, sorted."""
    url = f"{GITHUB_API}/repos/{source}/git/trees/{sha}?recursive=1"
    tree = fetch_json(url)
    if tree.get("truncated"):
        raise RuntimeError(f"tree truncated for {source}@{sha}; skill dir too large for recursive API")
    blobs = [
        e["path"] for e in tree.get("tree", [])
        if e.get("type") == "blob" and e["path"].startswith(prefix + "/")
    ]
    return sorted(blobs)


def fetch_file(source: str, sha: str, path: str) -> bytes:
    return fetch_bytes(f"{GITHUB_RAW}/{source}/{sha}/{path}")


# --------------------------------------------------------------------------- #
# sync core
# --------------------------------------------------------------------------- #

def plan_files(source: str, sha: str, skill_path: str) -> list[tuple[str, str]]:
    """Return [(upstream_path, relpath)] for a skill.

    - skill_path ending in .md (e.g. "SKILL.md"): single-file skill -> one file.
    - otherwise: directory skill -> all blobs under skill_path/.
    """
    if skill_path.endswith(".md") or "/" not in skill_path and Path(skill_path).suffix:
        # single-file skill (covers "SKILL.md" and any explicit *.md path)
        return [(skill_path, Path(skill_path).name)]
    return [(p, p[len(skill_path) + 1:]) for p in list_blobs_under(source, sha, skill_path)]


def compute_hash(files: list[tuple[bytes, str]]) -> str:
    """files: [(content, relpath)]. deterministic sha256 over sorted relpath+content."""
    h = hashlib.sha256()
    for content, relpath in sorted(files, key=lambda fc: fc[1]):
        h.update(relpath.encode("utf-8"))
        h.update(b"\n")
        h.update(content)
    return h.hexdigest()


def _read_disk_skill(out_dir: Path, name: str) -> list[tuple[bytes, str]]:
    """Read existing synced files for a skill from out_dir/name."""
    d = out_dir / name
    if not d.is_dir():
        raise RuntimeError(f"{name}: not synced yet (no {d}); cannot --from-disk")
    files = []
    for p in sorted(d.rglob("*")):
        if p.is_file():
            files.append((p.read_bytes(), str(p.relative_to(d))))
    if not files:
        raise RuntimeError(f"{name}: {d} is empty; cannot --from-disk")
    return files


def sync_skill(
    name: str, spec: dict, out_dir: Path, *, update: bool, dry_run: bool, from_disk: bool
) -> tuple[str, str, list[str]]:
    """Sync one skill. Returns (name, computed_hash, list_of_written_relpaths)."""
    expected = spec.get("computedHash", "")

    if from_disk:
        # Recompute from already-synced files; no network. Useful for recovering
        # from a partial --update (fetches succeeded but lock write was skipped)
        # and for surviving github API outages.
        files = _read_disk_skill(out_dir, name)
        actual = compute_hash(files)
        if expected and actual != expected:
            raise RuntimeError(
                f"{name}: on-disk hash mismatch\n  expected {expected}\n  actual   {actual}\n"
                f"  skills-synced/{name}/ differs from the lock. Run --update (network) to re-fetch."
            )
        return name, actual, [rel for _, rel in files]

    source_type = spec.get("sourceType", "github")
    if source_type != "github":
        raise RuntimeError(f"{name}: unsupported sourceType {source_type!r} (only 'github' currently)")

    source = spec["source"]
    skill_path = spec["skillPath"]
    ref = spec.get("ref", "HEAD")

    sha = resolve_ref(source, ref)
    plan = plan_files(source, sha, skill_path)
    if not plan:
        raise RuntimeError(f"{name}: no files found at {source}@{ref}:{skill_path}")

    fetched: list[tuple[bytes, str]] = []
    written: list[str] = []
    for upstream_path, relpath in plan:
        content = fetch_file(source, sha, upstream_path)
        fetched.append((content, relpath))
        written.append(relpath)

    actual = compute_hash(fetched)

    if expected and actual != expected:
        raise RuntimeError(
            f"{name}: hash mismatch\n  expected {expected}\n  actual   {actual}\n"
            f"  upstream moved at {source}@{ref}. Run with --update to accept the new content."
        )

    if dry_run:
        return name, actual, written

    skill_out = out_dir / name
    if skill_out.exists():
        shutil.rmtree(skill_out)
    skill_out.mkdir(parents=True)
    for content, relpath in fetched:
        dest = skill_out / relpath
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)

    return name, actual, written


# --------------------------------------------------------------------------- #
# lock file
# --------------------------------------------------------------------------- #

def load_lock(path: Path) -> dict:
    data = json.loads(path.read_text("utf-8"))
    if data.get("version") != 1:
        raise RuntimeError(f"{path}: unsupported lock version {data.get('version')!r}")
    if "skills" not in data or not isinstance(data["skills"], dict):
        raise RuntimeError(f"{path}: missing 'skills' object")
    return data


def save_lock(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", "utf-8")


# --------------------------------------------------------------------------- #
# cli
# --------------------------------------------------------------------------- #

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="generic hash-pinned skill syncer")
    ap.add_argument("--lock", default=os.environ.get("SYNC_LOCK", "./skills-lock.json"))
    ap.add_argument("--out", default=os.environ.get("SYNC_OUT", "./skills-synced"))
    ap.add_argument("--update", action="store_true", help="fetch and write computedHash back to lock file")
    ap.add_argument("--from-disk", action="store_true", help="recompute hashes from existing out dir; no network")
    ap.add_argument("--dry-run", action="store_true", help="fetch and report; write nothing")
    ap.add_argument("--skill", help="sync only this skill")
    args = ap.parse_args(argv)

    lock_path = Path(args.lock)
    out_dir = Path(args.out)
    if not lock_path.is_file():
        print(f"error: lock file not found: {lock_path}", file=sys.stderr)
        return 2

    data = load_lock(lock_path)
    skills = data["skills"]
    if args.skill:
        if args.skill not in skills:
            print(f"error: --skill {args.skill!r} not in lock file", file=sys.stderr)
            return 2
        skills = {args.skill: skills[args.skill]}

    out_dir.mkdir(parents=True, exist_ok=True)

    had_error = False
    wrote_any = False
    for name, spec in skills.items():
        try:
            res = sync_skill(
                name, spec, out_dir,
                update=args.update, dry_run=args.dry_run, from_disk=args.from_disk,
            )
            _, actual, written = res
            nfiles = len(written)
            print(f"  ok   {name:<30} {nfiles} file(s)  {actual[:12]}")
            # Write each successful hash back to the lock data immediately so a
            # sibling failure doesn't discard successful work. Saved once below.
            if args.update and not args.dry_run and data["skills"][name].get("computedHash") != actual:
                data["skills"][name]["computedHash"] = actual
                wrote_any = True
        except Exception as e:
            had_error = True
            print(f"  ERR  {name:<30} {e}", file=sys.stderr)

    # Persist whatever hashes we collected, even if some skills errored.
    if args.update and not args.dry_run and wrote_any:
        save_lock(lock_path, data)
        print(f"\nupdated {lock_path}")

    return 1 if had_error else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

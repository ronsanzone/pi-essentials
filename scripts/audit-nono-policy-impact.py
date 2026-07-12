#!/usr/bin/env python3
"""Scan Pi and Claude Code session logs for commands likely blocked by nono's default dangerous command groups.

This is heuristic: it extracts shell command strings from known Pi/Claude JSONL shapes,
then parses the first command word after common shell separators/control operators.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import shlex
from pathlib import Path
from typing import Any, Iterable

HOME = Path.home()

DENIED_COMMANDS = {
    # dangerous_commands
    "rm", "rmdir", "dd", "chmod", "chown", "chgrp", "mv", "cp", "truncate",
    "scp", "rsync", "sftp", "ftp", "xargs", "sudo", "su", "doas", "pip", "npm",
    "kill", "killall", "pkill", "shutdown", "reboot", "halt", "poweroff",
    # dangerous_commands_macos
    "srm", "brew", "launchctl",
    # dangerous_commands_linux
    "shred", "mkfs", "mkfs.ext4", "mkfs.xfs", "mkfs.btrfs", "mkswap", "fdisk",
    "parted", "gdisk", "wipefs", "chattr", "init", "systemctl", "apt", "apt-get",
    "dpkg", "yum", "dnf", "pacman", "pkexec",
}

ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=.*$")
WRAPPERS = {"command", "env", "time", "nice", "nohup", "arch"}


def shorten_path(path: str) -> str:
    s = str(path)
    h = str(HOME)
    return "~" + s[len(h):] if s.startswith(h) else s


def iter_jsonl(paths: Iterable[Path]) -> Iterable[tuple[Path, dict[str, Any]]]:
    for path in paths:
        try:
            with path.open("r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    yield path, obj
        except OSError:
            continue


def walk(obj: Any) -> Iterable[Any]:
    yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)


def extract_commands_from_obj(obj: dict[str, Any]) -> list[str]:
    out: list[str] = []

    # Pi tool calls: {type: toolCall, name: bash, arguments: {command: ...}}
    if obj.get("type") == "message":
        msg = obj.get("message", {})
        for item in msg.get("content", []) if isinstance(msg, dict) else []:
            if isinstance(item, dict) and item.get("type") == "toolCall" and item.get("name") == "bash":
                args = item.get("arguments") or {}
                if isinstance(args, dict) and isinstance(args.get("command"), str):
                    out.append(args["command"])

    # Claude Code tool_use: name Bash with input.command. Also catches nested sidechain shapes.
    for node in walk(obj):
        if not isinstance(node, dict):
            continue
        name = node.get("name")
        if isinstance(name, str) and name in {"Bash", "bash"}:
            inp = node.get("input") or node.get("arguments") or {}
            if isinstance(inp, dict) and isinstance(inp.get("command"), str):
                out.append(inp["command"])

    return out


def shell_tokens(shell: str) -> list[str]:
    lexer = shlex.shlex(shell, posix=True, punctuation_chars="|&;()")
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return list(lexer)
    except Exception:
        return shell.split()


def first_command_words(shell: str) -> list[str]:
    """Return likely command words after shell separators, respecting quoted strings."""
    toks = shell_tokens(shell)
    words: list[str] = []
    expect_cmd = True
    i = 0
    control = {"if", "then", "else", "elif", "do", "done", "while", "for"}
    while i < len(toks):
        tok = toks[i]
        if tok in {";", "|", "||", "&&", "&", "(", ")"} or set(tok) <= set("|&;()"):
            expect_cmd = True
            i += 1
            continue
        if not expect_cmd:
            i += 1
            continue
        if tok in control or ASSIGNMENT_RE.match(tok):
            i += 1
            continue
        while tok in WRAPPERS:
            i += 1
            if i >= len(toks):
                return words
            tok = toks[i]
            if toks[i-1] == "env":
                while i < len(toks) and (ASSIGNMENT_RE.match(toks[i]) or toks[i].startswith("-")):
                    i += 1
                if i >= len(toks):
                    return words
                tok = toks[i]
        words.append(os.path.basename(tok))
        expect_cmd = False
        i += 1
    return words


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pi", default=str(HOME / ".pi/agent/sessions"))
    ap.add_argument("--claude", default=str(HOME / ".claude/projects"))
    ap.add_argument("--examples", type=int, default=8)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    files = []
    for root in [Path(args.pi), Path(args.claude)]:
        if root.exists():
            files.extend(root.rglob("*.jsonl"))

    counts = collections.Counter()
    examples: dict[str, list[dict[str, str]]] = collections.defaultdict(list)
    total_commands = 0
    scanned_lines = 0

    for path, obj in iter_jsonl(files):
        scanned_lines += 1
        source = "pi" if "/.pi/agent/sessions/" in str(path) else "claude"
        for cmd in extract_commands_from_obj(obj):
            total_commands += 1
            hit_words = [w for w in first_command_words(cmd) if w in DENIED_COMMANDS]
            for word in sorted(set(hit_words)):
                counts[word] += 1
                if len(examples[word]) < args.examples:
                    examples[word].append({"source": source, "file": shorten_path(str(path)), "command": cmd[:500]})

    result = {
        "files_scanned": len(files),
        "jsonl_records_scanned": scanned_lines,
        "shell_commands_seen": total_commands,
        "denied_command_hits": sum(counts.values()),
        "counts": dict(counts.most_common()),
        "examples": examples,
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Files scanned: {len(files)}")
        print(f"JSONL records scanned: {scanned_lines}")
        print(f"Shell commands seen: {total_commands}")
        print(f"Denied-command hits: {sum(counts.values())}\n")
        for cmd, n in counts.most_common():
            print(f"## {cmd}: {n}")
            for ex in examples[cmd]:
                print(f"- [{ex['source']}] {ex['command'].replace(chr(10), ' ⏎ ')}")
                print(f"  {ex['file']}")
            print()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

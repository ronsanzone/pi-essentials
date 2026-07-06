import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// --- types ---
type ExecResult = { stdout?: string; stderr?: string; code?: number | null; killed?: boolean };
type StreamResult<T> = { items: T[]; stderr: string; code: number | null; killed: boolean; capped: boolean };

type SearchMatch = {
  text: string;
  file: string;
  lines: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  metaVariables?: unknown;
};

type SearchDetails = {
  mode: string;
  matchCount?: number;
  matchedFiles?: number;
  files?: string[];
  truncated?: boolean;
  outputTruncated?: boolean;
};

type OutlineMember = {
  name?: string;
  symbolType?: string;
  signature?: string;
  isPublic?: boolean;
  start?: { line: number; column: number };
  end?: { line: number; column: number };
  range?: { start?: { line: number; column: number }; end?: { line: number; column: number } };
};

type OutlineItem = OutlineMember & { members?: OutlineMember[] };
type OutlineFile = { path: string; items?: OutlineItem[] };

// --- constants ---
const SG_BIN = process.env.AST_GREP_BIN ?? "sg";
const OUTLINE_TIMEOUT_MS = 30_000;
const SEARCH_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESULTS = 50;
const MAX_SNIPPET_CHARS = 120;

// --- shared utilities ---

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function toolText(text: string): string {
  const truncation = truncateHead(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });

  if (!truncation.truncated) return text;

  return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Re-run with narrower inputs if more detail is needed.]`;
}

function assertSgSuccess(command: string, result: ExecResult): string {
  if (result.killed) throw new Error(`${command} timed out. Narrow paths/globs, set lang, or use a more specific pattern.`);
  if (result.code === 0) return result.stdout ?? "";
  // sg run exits 1 when no matches found — not an error
  if (result.code === 1 && !result.stderr?.trim()) return result.stdout ?? "";
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  throw new Error(`${command} failed with exit code ${result.code}:\n${output?.slice(0, 2000)}`);
}

function parseStreamJson(stdout: string, stderr?: string): SearchMatch[] {
  const lines = stdout.trim().split("\n").filter(Boolean);
  const results: SearchMatch[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as SearchMatch);
    } catch {
      const errContext = stderr?.slice(0, 500) ?? "";
      throw new Error(`Malformed JSON from sg. The search may be too broad or output may have been truncated.\n  line: ${line.slice(0, 200)}\n  stderr: ${errContext}`);
    }
  }
  return results;
}

async function runJsonStream<T>(
  args: string[],
  options: { signal?: AbortSignal; timeoutMs: number; maxItems?: number; commandLabel: string },
): Promise<StreamResult<T>> {
  return await new Promise((resolve, reject) => {
    const child = spawn(SG_BIN, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    const items: T[] = [];
    let stdoutBuffer = "";
    let stderr = "";
    let killed = false;
    let settled = false;
    let capped = false;

    const finish = (value: StreamResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      options.signal?.removeEventListener("abort", abort);
      reject(err);
    };
    const stop = () => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 500).unref();
    };
    const abort = () => {
      stop();
      fail(new Error(`${options.commandLabel} aborted`));
    };
    const timeoutHandle = setTimeout(() => {
      stop();
      fail(new Error(`${options.commandLabel} timed out after ${Math.round(options.timeoutMs / 1000)}s. Narrow paths/globs, set lang, or use a more specific pattern.`));
    }, options.timeoutMs);

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      let newline = stdoutBuffer.indexOf("\n");
      while (newline !== -1) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) {
          try {
            items.push(JSON.parse(line) as T);
          } catch {
            fail(new Error(`Malformed JSON from sg. The search may be too broad or output may have been truncated.\n  line: ${line.slice(0, 200)}\n  stderr: ${stderr.slice(0, 500)}`));
            return;
          }
          if (options.maxItems && items.length >= options.maxItems) {
            capped = true;
            stop();
            return;
          }
        }
        newline = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      const line = stdoutBuffer.trim();
      if (line && !capped && !killed) {
        try {
          items.push(JSON.parse(line) as T);
        } catch {
          fail(new Error(`Malformed JSON from sg. The search may be too broad or output may have been truncated.\n  line: ${line.slice(0, 200)}\n  stderr: ${stderr.slice(0, 500)}`));
          return;
        }
      }
      finish({ items, stderr, code, killed, capped });
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareArguments(args: unknown): any {
  if (!args || typeof args !== "object") return args;
  const input = args as { paths?: unknown; globs?: unknown };
  const out = { ...input };
  if (typeof out.paths === "string") out.paths = [out.paths];
  if (typeof out.globs === "string") out.globs = [out.globs];
  return out;
}

// --- search formatting ---

function formatSearchText(matches: SearchMatch[], maxResults: number, hasContext: boolean, truncated = false): string {
  if (matches.length === 0) return "Found 0 matches";

  const capped = matches.slice(0, maxResults);

  // Group by file
  const byFile = new Map<string, SearchMatch[]>();
  for (const m of capped) {
    const group = byFile.get(m.file) ?? [];
    group.push(m);
    byFile.set(m.file, group);
  }

  const multiFile = byFile.size > 1;
  const visibleCount = capped.length;
  const parts: string[] = [`Found at least ${visibleCount} match${visibleCount === 1 ? "" : "es"}${truncated ? " (search stopped after reaching maxResults)" : ""}:\n`];

  for (const [file, group] of byFile) {
    if (multiFile) parts.push(`${file}:`);

    for (const m of group) {
      const startLine = m.range.start.line + 1; // 0-based → 1-based
      const endLine = m.range.end.line + 1;
      const rangeStr = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

      if (hasContext) {
        // Print full lines (which include context) indented
        const contextLines = m.lines.split("\n");
        parts.push(`  ${rangeStr}:`);
        for (const ctxLine of contextLines) {
          parts.push(`    ${ctxLine}`);
        }
      } else {
        // Print first line of match, stripped and capped
        const firstLine = m.lines.split("\n")[0]?.trim() ?? "";
        const snippet = firstLine.length > MAX_SNIPPET_CHARS ? firstLine.slice(0, MAX_SNIPPET_CHARS) + "…" : firstLine;
        parts.push(`  ${rangeStr}: ${snippet}`);
      }
    }

    if (multiFile) parts.push(""); // blank line between files
  }

  if (truncated) {
    parts.push(`\n[More matches omitted. Narrow your pattern or paths, or raise maxResults, to see more.]`);
  }

  return parts.join("\n");
}

function formatOutlineMemberMatches(files: OutlineFile[], memberMatch: string): string {
  const regex = new RegExp(memberMatch);
  const parts: string[] = [];
  let count = 0;

  for (const file of files) {
    const fileParts: string[] = [];
    for (const item of file.items ?? []) {
      const matches = (item.members ?? []).filter((m) => regex.test(`${m.name ?? ""}\n${m.signature ?? ""}`));
      if (matches.length === 0) continue;
      fileParts.push(`  ${item.symbolType ?? "item"}: ${item.name ?? "<anonymous>"}`);
      for (const m of matches) {
        count++;
        const line = (m.start ?? m.range?.start) ? (m.start ?? m.range?.start)!.line + 1 : "?";
        const visibility = m.isPublic === true ? "public " : m.isPublic === false ? "non-public " : "";
        const sig = m.signature ? ` ${m.signature}` : "";
        fileParts.push(`    ${line}: ${visibility}${m.symbolType ?? "member"}: ${m.name ?? "<anonymous>"}${sig}`);
      }
    }
    if (fileParts.length > 0) {
      parts.push(file.path, ...fileParts, "");
    }
  }

  if (count === 0) return "Found 0 matching members";
  return `Found ${count} matching member${count === 1 ? "" : "s"}:\n\n${parts.join("\n").trimEnd()}`;
}

// --- main ---

export default function astGrepTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ast_grep_outline",
    label: "AST-Grep Outline",
    description:
      "Explore code structure for symbols, imports, exports, and members using ast-grep's outline command. Produces compact structural summaries with line numbers — use before reading unfamiliar or large files to navigate efficiently. Output is truncated to 50KB/2000 lines.",
    promptSnippet: "Structural code outline via ast-grep (symbols, imports, exports, members)",
    promptGuidelines: [
      "Use ast_grep_outline before reading unfamiliar or large source files/directories when you need symbols, imports, exports, or members.",
      "Skip outline and use read directly for small files, config files, or when you already know the exact line range.",
      "For directories, start with items=exports view=names; use view=signatures or view=digest when names are insufficient.",
      "Use read after outline for exact implementation details — outline gives you the shape, read gives you the code.",
      "Pass explicit paths in large repositories; avoid outlining repo root unless you intentionally want a broad index.",
      "Use match for top-level symbols/imports/exports. Use memberMatch to focus method/member names inside classes.",
    ],
    parameters: Type.Object({
      paths: Type.Optional(
        Type.Array(Type.String({ description: "File or directory paths to outline." }), {
          minItems: 1,
          description: "Files or directories to outline. Defaults to current directory.",
        }),
      ),
      items: Type.Optional(
        Type.Union(
          [
            Type.Literal("auto"),
            Type.Literal("structure"),
            Type.Literal("exports"),
            Type.Literal("imports"),
            Type.Literal("all"),
          ],
          { description: "Which top-level items to include. Defaults to auto." },
        ),
      ),
      view: Type.Optional(
        Type.Union(
          [
            Type.Literal("auto"),
            Type.Literal("names"),
            Type.Literal("signatures"),
            Type.Literal("digest"),
            Type.Literal("expanded"),
          ],
          { description: "Output detail level. Defaults to auto." },
        ),
      ),
      match: Type.Optional(Type.String({ description: "Regex to filter top-level symbol names/signatures (does not match members)." })),
      memberMatch: Type.Optional(Type.String({ description: "Regex to filter class/interface members such as Java methods in JSON post-processing." })),
      type: Type.Optional(Type.String({ description: "Comma-separated symbol types to keep (e.g. \"class,function\")." })),
      lang: Type.Optional(Type.String({ description: "Override language detection." })),
      pubMembers: Type.Optional(Type.Boolean({ description: "Only show public members. Defaults to false." })),
      globs: Type.Optional(
        Type.Array(Type.String({ description: "Include/exclude path glob." }), {
          minItems: 1,
          description: "Include/exclude path globs (gitignore-style). Precede with ! to exclude.",
        }),
      ),
    }),
    prepareArguments,
    async execute(_toolCallId, params, signal) {
      if (!params.paths?.length) {
        throw new Error(
          "ast_grep_outline requires explicit paths in large repositories. Try a package directory or specific file, for example server/src/main/com/xgen/cloud/nds/lifecyclemanagement.",
        );
      }

      const args = ["outline", "--color", "never"];

      if (params.items) args.push("--items", params.items);
      if (params.view) args.push("--view", params.view);
      if (params.match) args.push("--match", params.match);
      if (params.type) args.push("--type", params.type);
      if (params.lang) args.push("--lang", params.lang);
      if (params.pubMembers) args.push("--pub-members");
      if (params.globs) {
        for (const g of params.globs) {
          args.push("--globs", g);
        }
      }

      const paths = params.paths;

      if (params.memberMatch) {
        const jsonArgs = args.filter((arg) => arg !== "--color" && arg !== "never");
        jsonArgs.push("--json=stream", ...paths);
        const stream = await runJsonStream<OutlineFile>(jsonArgs, {
          signal,
          timeoutMs: OUTLINE_TIMEOUT_MS,
          commandLabel: "sg outline (memberMatch)",
        });
        if (!stream.capped && stream.code !== 0 && !(stream.code === 1 && !stream.stderr.trim())) {
          throw new Error(`sg outline (memberMatch) failed with exit code ${stream.code}:\n${stream.stderr.slice(0, 2000)}`);
        }
        const text = toolText(formatOutlineMemberMatches(stream.items, params.memberMatch));
        return {
          content: [{ type: "text", text }],
          details: { exitCode: stream.code, items: params.items, view: params.view, memberMatch: params.memberMatch },
        };
      }

      args.push(...paths);

      const result = (await pi.exec(SG_BIN, args, { signal, timeout: OUTLINE_TIMEOUT_MS })) as ExecResult;
      const stdout = assertSgSuccess(`sg outline`, result);

      const text = stdout.trim() ? toolText(stdout) : "(no outline entries found)";

      return {
        content: [{ type: "text", text }],
        details: { exitCode: result.code, items: params.items, view: params.view },
      };
    },
  });

  pi.registerTool({
    name: "ast_grep_search",
    label: "AST-Grep Search",
    description:
      "Syntax-aware structural search and rewrite using ast-grep. Find code patterns that grep cannot — async functions, catch blocks, method calls with specific shapes. Patterns are code-shaped snippets, not regex. Supports dry-run rewrite preview (default) and optional apply for codemods. Output is truncated to 50KB/2000 lines.",
    promptSnippet: "Syntax-aware AST pattern search and rewrite via ast-grep",
    promptGuidelines: [
      "Use ast_grep_search for syntax-aware pattern matching where AST structure matters (e.g. 'find all async functions', 'find all console.log calls inside class methods', 'find all catch blocks').",
      "Use grep/ripgrep for literal identifiers, strings, comments, and regex text search. Use ast_grep_search only when syntax structure is important.",
      "Patterns are code-shaped snippets, not regex. Examples: console.log($$$) matches any console.log call; async function $NAME($$$ARGS) { $$$BODY } matches async functions; import { $$$ } from \"$MOD\" matches imports from a module; try { $$$ } catch ($ERR) { $$$ } matches catch blocks.",
      "$$$ matches any number of nodes (zero or more). $NAME captures a single node for reference in rewrite.",
      "Use rewrite to perform structural code changes. Dry-run is the default — preview changes first. Only set apply=true when explicitly asked to modify files. After applying, inspect git diff.",
      "Set lang when searching directories with mixed languages or when language inference from file extensions fails.",
      "For Java examples, include modifiers present in code: try { $$$ } catch (final $E $N) { $$$ } and public $RET $METHOD($$$ARGS) { $$$BODY }.",
      "maxResults caps streamed search results for normal search mode; still narrow paths/globs for performance in large repositories.",
    ],
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to match. Code-shaped snippet, not regex. Use $$$ for multi-node wildcard, $NAME for single-node capture." }),
      lang: Type.Optional(
        Type.String({
          description: "Language: typescript, javascript, python, rust, go, java, c, cpp, csharp, etc. Set when searching directories with mixed languages or when inference fails.",
        }),
      ),
      paths: Type.Optional(
        Type.Array(Type.String({ description: "File or directory path to search." }), {
          minItems: 1,
          description: "Search paths. Defaults to current directory.",
        }),
      ),
      rewrite: Type.Optional(Type.String({ description: "Replacement string. Enables rewrite mode. Dry-run by default; set apply=true to write changes." })),
      apply: Type.Optional(Type.Boolean({ description: "When true with rewrite, applies changes to files (-U). When false (default), shows a preview diff without modifying files." })),
      strictness: Type.Optional(
        Type.Union(
          [
            Type.Literal("cst"),
            Type.Literal("smart"),
            Type.Literal("ast"),
            Type.Literal("relaxed"),
            Type.Literal("signature"),
            Type.Literal("template"),
          ],
          { description: "Pattern matching strictness level." },
        ),
      ),
      globs: Type.Optional(
        Type.Array(Type.String({ description: "Include/exclude path glob." }), {
          minItems: 1,
          description: "Include/exclude path globs (gitignore-style). Precede with ! to exclude.",
        }),
      ),
      context: Type.Optional(Type.Number({ description: "Lines of context around each match (-C). Clamped to 0-10. Defaults to 0." })),
      maxResults: Type.Optional(Type.Number({ description: "Maximum matches to return in formatted output. Clamped to 1-200. Defaults to 50." })),
    }),
    prepareArguments,
    async execute(_toolCallId, params, signal) {
      const context = clampInt(params.context, 0, 0, 10);
      const maxResults = clampInt(params.maxResults, DEFAULT_MAX_RESULTS, 1, 200);
      const paths = params.paths ?? ["."];
      const hasContext = context > 0;

      // Build common args
      const commonArgs = ["run", "-p", params.pattern];
      if (params.lang) commonArgs.push("--lang", params.lang);
      if (params.strictness) commonArgs.push("--strictness", params.strictness);
      if (params.globs) {
        for (const g of params.globs) {
          commonArgs.push("--globs", g);
        }
      }

      // --- Rewrite mode ---
      if (params.rewrite !== undefined) {
        if (params.apply) {
          // Pre-pass: find files that will be changed (--files-with-matches conflicts with -U and --json)
          const prePassArgs = [...commonArgs, "--files-with-matches", ...paths];
          const prePassResult = (await pi.exec(SG_BIN, prePassArgs, {
            signal,
            timeout: SEARCH_TIMEOUT_MS,
          })) as ExecResult;
          const prePassOutput = assertSgSuccess(`sg run (files-with-matches)`, prePassResult);

          const changedFiles = prePassOutput
            .trim()
            .split("\n")
            .filter(Boolean);

          if (changedFiles.length === 0) {
            return {
              content: [{ type: "text", text: "No files matched the pattern." }],
              details: { mode: "apply", matchedFiles: 0 } as SearchDetails,
            };
          }

          // Apply rewrites with -U
          const applyArgs = [...commonArgs, "-r", params.rewrite, "-U", ...paths];
          const applyResult = (await pi.exec(SG_BIN, applyArgs, {
            signal,
            timeout: SEARCH_TIMEOUT_MS,
          })) as ExecResult;
          assertSgSuccess(`sg run (apply)`, applyResult);

          const text = `Rewrote ${changedFiles.length} file(s):\n${changedFiles.map((f) => `  ${f}`).join("\n")}\n\nCheck \`git diff\` to review changes.`;

          return {
            content: [{ type: "text", text }],
            details: { mode: "apply", matchedFiles: changedFiles.length, files: changedFiles } as SearchDetails,
          };
        } else {
          // Dry-run: preview without -U
          const dryRunArgs = [...commonArgs, "-r", params.rewrite, "--color", "never", ...paths];
          const dryRunResult = (await pi.exec(SG_BIN, dryRunArgs, {
            signal,
            timeout: SEARCH_TIMEOUT_MS,
          })) as ExecResult;
          const stdout = assertSgSuccess(`sg run (dry-run)`, dryRunResult);

          const preview = stdout.trim()
            ? `Preview of rewrite (no files modified):\n\n${toolText(stdout)}`
            : "No files matched the pattern.";

          return {
            content: [{ type: "text", text: preview }],
            details: { mode: "dry-run" } as SearchDetails,
          };
        }
      }

      // --- Search mode (no rewrite) ---
      const searchArgs = [...commonArgs, "--json=stream"];
      if (hasContext) searchArgs.push("-C", String(context));
      searchArgs.push(...paths);

      const stream = await runJsonStream<SearchMatch>(searchArgs, {
        signal,
        timeoutMs: SEARCH_TIMEOUT_MS,
        maxItems: maxResults + 1,
        commandLabel: "sg run (search)",
      });

      if (!stream.capped && stream.code !== 0 && !(stream.code === 1 && !stream.stderr.trim())) {
        throw new Error(`sg run (search) failed with exit code ${stream.code}:\n${stream.stderr.slice(0, 2000)}`);
      }

      if (stream.items.length === 0) {
        return {
          content: [{ type: "text", text: "Found 0 matches" }],
          details: { mode: "search", matchCount: 0, matchedFiles: 0 } as SearchDetails,
        };
      }

      const resultTruncated = stream.items.length > maxResults || stream.capped;
      const matches = stream.items.slice(0, maxResults);
      const text = toolText(formatSearchText(matches, maxResults, hasContext, resultTruncated));
      const matchedFiles = new Set(matches.map((m) => m.file)).size;

      return {
        content: [{ type: "text", text }],
        details: { mode: "search", matchCount: matches.length, matchedFiles, truncated: resultTruncated } as SearchDetails,
      };
    },
  });
}

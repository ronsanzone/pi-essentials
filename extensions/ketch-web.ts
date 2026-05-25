import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type ExecResult = {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  killed?: boolean;
};

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const DEFAULT_SCRAPE_MAX_CHARS = 30_000;
const MAX_SCRAPE_MAX_CHARS = 100_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const SEARCH_TIMEOUT_MS = 45_000;
const SCRAPE_TIMEOUT_MS = 90_000;

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function toolText(text: string) {
  const truncation = truncateHead(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });

  if (!truncation.truncated) return text;

  return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Re-run with narrower inputs if more detail is needed.]`;
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ketch returned non-JSON output: ${message}\n\n${stdout.slice(0, 2000)}`);
  }
}

function resultOutput(result: ExecResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function assertSuccess(command: string, result: ExecResult): string {
  if (result.code === 0 && !result.killed) return result.stdout ?? "";
  const output = resultOutput(result) || "no output";
  throw new Error(`${command} failed${result.killed ? " (timed out)" : ""} with exit code ${result.code ?? "unknown"}:\n${output}`);
}

function formatSearchResults(data: unknown, backend: string, fallbackUsed: boolean): string {
  if (!Array.isArray(data)) {
    return toolText(`Search completed via ${backend}${fallbackUsed ? " (fallback)" : ""}.\n\n${JSON.stringify(data, null, 2)}`);
  }

  const lines = [`Search results via ${backend}${fallbackUsed ? " (fallback from brave)" : ""}:`];
  data.forEach((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = typeof record.title === "string" ? record.title : "Untitled";
    const url = typeof record.url === "string" ? record.url : "";
    const description =
      typeof record.description === "string"
        ? record.description
        : typeof record.snippet === "string"
          ? record.snippet
          : "";
    lines.push(`\n${index + 1}. ${title}`);
    if (url) lines.push(`   ${url}`);
    if (description) lines.push(`   ${description}`);
  });

  return toolText(lines.join("\n"));
}

function scrapeItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function formatScrapeResults(data: unknown): string {
  const items = scrapeItems(data);
  if (items.length === 0) return toolText(JSON.stringify(data, null, 2));

  const sections = items.map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const url = typeof record.url === "string" ? record.url : "";
    const title = typeof record.title === "string" ? record.title : url || `Result ${index + 1}`;
    const markdown = typeof record.markdown === "string" ? record.markdown : JSON.stringify(item, null, 2);
    const words = typeof record.words === "number" ? ` (${record.words} words)` : "";
    return `# ${title}${words}\n${url ? `${url}\n\n` : ""}${markdown}`;
  });

  return toolText(sections.join("\n\n---\n\n"));
}

async function runKetch(pi: ExtensionAPI, args: string[], signal: AbortSignal | undefined, timeout = DEFAULT_TIMEOUT_MS) {
  const result = (await pi.exec("ketch", args, { signal, timeout })) as ExecResult;
  return result;
}

export default function ketchWebTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web. Returns JSON-backed compact search results. Output is truncated to 50KB/2000 lines.",
    promptSnippet: "Search the web for current external information using ketch with Brave-to-DuckDuckGo fallback",
    promptGuidelines: [
      "Use web_search for external/current information discovery.",
      "Use web_search first, then web_scrape only for the most relevant authoritative pages.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      limit: Type.Optional(Type.Number({ description: "Maximum results to return. Defaults to 5, max 10." })),
      scrape: Type.Optional(Type.Boolean({ description: "If true, ask ketch to scrape full content for each result. Defaults to false." })),
      maxChars: Type.Optional(
        Type.Number({ description: "Maximum markdown characters per scraped search result when scrape=true." }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const limit = clampInt(params.limit, DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
      const baseArgs = ["search", params.query, "--json", "--limit", String(limit)];
      if (params.scrape) baseArgs.push("--scrape");
      if (params.scrape && params.maxChars !== undefined) {
        baseArgs.push("--max-chars", String(clampInt(params.maxChars, DEFAULT_SCRAPE_MAX_CHARS, 1, MAX_SCRAPE_MAX_CHARS)));
      }

      const braveArgs = [...baseArgs, "--backend", "brave"];
      const brave = await runKetch(pi, braveArgs, signal, SEARCH_TIMEOUT_MS);

      let finalResult = brave;
      let backend = "brave";
      let fallbackUsed = false;
      let braveFailure: string | undefined;

      if (brave.code !== 0 || brave.killed) {
        braveFailure = resultOutput(brave) || `exit code ${brave.code ?? "unknown"}`;
        const ddgArgs = [...baseArgs, "--backend", "ddg"];
        finalResult = await runKetch(pi, ddgArgs, signal, SEARCH_TIMEOUT_MS);
        backend = "ddg";
        fallbackUsed = true;
      }

      const stdout = assertSuccess(`ketch search (${backend})`, finalResult);
      const data = parseJson(stdout);
      return {
        content: [{ type: "text", text: formatSearchResults(data, backend, fallbackUsed) }],
        details: { backend, fallbackUsed, braveFailure, results: data },
      };
    },
  });

  pi.registerTool({
    name: "web_scrape",
    label: "Web Scrape",
    description:
      "Fetch one or more URLs with ketch and return clean markdown. Handles JS-rendered pages browser support is configured. Defaults to maxChars=30000 per ketch invocation. Output is truncated to 50KB/2000 lines.",
    promptSnippet: "Scrape URLs to clean markdown",
    promptGuidelines: [
      "Use web_scrape to fetch full content only from URLs that look relevant and authoritative.",
      "Prefer web_scrape over calling tools over bash.",
    ],
    parameters: Type.Object({
      urls: Type.Array(Type.String({ description: "URL to scrape." }), { minItems: 1, description: "One or more URLs to scrape." }),
      maxChars: Type.Optional(Type.Number({ description: "Maximum markdown characters returned by ketch. Defaults to 30000, max 100000." })),
      trim: Type.Optional(Type.Boolean({ description: "Strip markdown formatting and keep content text only. Defaults to false." })),
      raw: Type.Optional(Type.Boolean({ description: "Return raw HTML instead of markdown. Defaults to false." })),
      noCache: Type.Optional(Type.Boolean({ description: "Bypass ketch page cache. Defaults to false." })),
      selector: Type.Optional(Type.String({ description: "CSS selector to extract specific elements, skipping readability." })),
      concurrency: Type.Optional(Type.Number({ description: "Maximum concurrent requests for multi-URL scraping." })),
    }),
    prepareArguments(args) {
      if (!args || typeof args !== "object") return args;
      const input = args as { urls?: unknown; url?: unknown };
      if (typeof input.urls === "string") return { ...input, urls: [input.urls] };
      if (input.urls === undefined && typeof input.url === "string") return { ...input, urls: [input.url] };
      return args;
    },
    async execute(_toolCallId, params, signal) {
      const maxChars = clampInt(params.maxChars, DEFAULT_SCRAPE_MAX_CHARS, 1, MAX_SCRAPE_MAX_CHARS);
      const args = ["scrape", ...params.urls, "--json", "--max-chars", String(maxChars)];
      if (params.trim) args.push("--trim");
      if (params.raw) args.push("--raw");
      if (params.noCache) args.push("--no-cache");
      if (params.selector) args.push("--select", params.selector);
      if (params.concurrency !== undefined) args.push("--concurrency", String(clampInt(params.concurrency, 5, 1, 20)));

      const result = await runKetch(pi, args, signal, SCRAPE_TIMEOUT_MS);
      const stdout = assertSuccess("ketch scrape", result);
      const data = parseJson(stdout);
      return {
        content: [{ type: "text", text: formatScrapeResults(data) }],
        details: { results: data, maxChars },
      };
    },
  });
}

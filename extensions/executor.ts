import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type McpServerConfig = {
	url?: string;
	headers?: Record<string, string>;
};

type McpConfig = {
	mcpServers?: Record<string, McpServerConfig>;
};

type JsonRpcResponse = {
	jsonrpc: "2.0";
	id?: number;
	result?: unknown;
	error?: { code: number; message: string };
};

type McpContent = { type: "text"; text: string } | { type: string; [k: string]: unknown };
type McpCallResult = {
	content?: McpContent[];
	structuredContent?: unknown;
	isError?: boolean;
};

const SERVER_NAME = "executor";
const HEALTH_PATH = "/api/health";
const HEALTH_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MCP_PROTOCOL_VERSION = "2025-03-26";
const NOTIFY_MAX = 8_000;

const MCP_PATHS = [
	join(homedir(), ".pi", "agent", "mcp.json"),
	join(homedir(), ".config", "mcp", "mcp.json"),
];

function loadExecutorConfig(): { url: string; headers: Record<string, string> } | null {
	for (const path of MCP_PATHS) {
		if (!existsSync(path)) continue;
		try {
			const raw = readFileSync(path, "utf8");
			const config = JSON.parse(raw) as McpConfig;
			const server = config.mcpServers?.[SERVER_NAME];
			if (server?.url) {
				return { url: server.url, headers: server.headers ?? {} };
			}
		} catch {
			// ignore parse errors, try next path
		}
	}
	return null;
}

function baseUrlFrom(mcpUrl: string): string {
	return mcpUrl.replace(/\/mcp\/?$/, "");
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}\n\n[truncated, ${s.length - max} more chars]`;
}

function extractText(result: unknown): string {
	if (!result || typeof result !== "object") return JSON.stringify(result, null, 2);
	const r = result as McpCallResult;
	if (Array.isArray(r.content)) {
		const text = r.content
			.filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
			.map((b) => b.text)
			.join("\n");
		if (text) return text;
	}
	if (r.structuredContent !== undefined) return JSON.stringify(r.structuredContent, null, 2);
	return JSON.stringify(result, null, 2);
}

class ExecutorClient {
	private sessionId: string | undefined;
	private nextId = 1;

	constructor(
		private readonly mcpUrl: string,
		private readonly headers: Record<string, string>,
	) {}

	async ping(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
			try {
				const r = await fetch(`${baseUrlFrom(this.mcpUrl)}${HEALTH_PATH}`, {
					signal: controller.signal,
				});
				return r.ok;
			} finally {
				clearTimeout(timer);
			}
		} catch {
			return false;
		}
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		await this.ensureSession();
		const id = this.nextId++;
		const body: JsonRpcResponse = await this.request({
			jsonrpc: "2.0",
			id,
			method: "tools/call",
			params: { name, arguments: args },
		});
		if (body.error) throw new Error(body.error.message);
		return body.result;
	}

	async close(): Promise<void> {
		const sid = this.sessionId;
		this.sessionId = undefined;
		if (!sid) return;
		try {
			await fetch(this.mcpUrl, {
				method: "DELETE",
				headers: { ...this.headers, "mcp-session-id": sid },
			});
		} catch {
			// best-effort cleanup
		}
	}

	private async ensureSession(): Promise<void> {
		if (this.sessionId) return;

		const init = await this.rawRequest({
			jsonrpc: "2.0",
			id: 0,
			method: "initialize",
			params: {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: { name: "pi-executor-extension", version: "0.0.1" },
			},
		});
		if (init.body.error) throw new Error(`MCP initialize failed: ${init.body.error.message}`);
		if (!this.sessionId) {
			throw new Error("MCP server did not return a session id");
		}

		// notifications/initialized has no response body per spec
		await this.rawRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
	}

	private async request(body: object): Promise<JsonRpcResponse> {
		const { body: response } = await this.rawRequest(body);
		return response;
	}

	private async rawRequest(body: object): Promise<{ body: JsonRpcResponse; sessionId?: string }> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(this.mcpUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					...this.headers,
					...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`MCP HTTP ${response.status} from ${this.mcpUrl}`);
			}
			const sid = response.headers.get("mcp-session-id") ?? this.sessionId;
			if (sid) this.sessionId = sid;
			const text = await response.text();
			if (!text) return { body: { jsonrpc: "2.0" } };
			try {
				return { body: JSON.parse(text) as JsonRpcResponse };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`MCP returned invalid JSON: ${message}`);
			}
		} finally {
			clearTimeout(timer);
		}
	}
}

const SOURCES_CODE = "return await tools.executor.sources.list({ limit: 20 });";

const buildSearchCode = (query: string): string =>
	`return await tools.search({ query: ${JSON.stringify(query)}, limit: 10 });`;

const buildDescribeCode = (path: string): string =>
	`const r = await tools.describe.tool({ path: ${JSON.stringify(path)} }); return { inputTypeScript: r.inputTypeScript, outputTypeScript: r.outputTypeScript };`;

async function runExecutorCode(client: ExecutorClient, code: string): Promise<string> {
	const result = await client.callTool("execute", { code });
	return extractText(result);
}

type Status = "ready" | "error" | "offline";

function statusDot(theme: Theme, status: Status): string {
	switch (status) {
		case "ready":
			return theme.fg("success", "●");
		case "error":
			return theme.fg("error", "●");
		case "offline":
			return theme.fg("dim", "○");
	}
}

export default function (pi: ExtensionAPI): void {
	const config = loadExecutorConfig();
	if (!config) {
		// Executor not configured; extension is a no-op rather than a hard failure.
		return;
	}

	let client: ExecutorClient | undefined;
	const getClient = (): ExecutorClient => {
		if (!client) client = new ExecutorClient(config.url, config.headers);
		return client;
	};

	pi.on("session_start", async (_event, ctx) => {
		const c = new ExecutorClient(config.url, config.headers);
		const online = await c.ping();
		if (online) {
			client = c;
			ctx.ui.setStatus("executor", statusDot(ctx.ui.theme, "ready"));
		} else {
			await c.close();
			ctx.ui.setStatus("executor", statusDot(ctx.ui.theme, "offline"));
		}
	});

	pi.on("session_shutdown", async () => {
		if (client) await client.close();
		client = undefined;
	});

	const notifyFailure = (ctx: Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1], label: string, error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`${label} failed: ${message}`, "error");
	};

	pi.registerCommand("executor-status", {
		description: "Check the Executor connection and list configured sources",
		handler: async (_args, ctx) => {
			try {
				const text = await runExecutorCode(getClient(), SOURCES_CODE);
				ctx.ui.notify(`Executor connected:\n\n${truncate(text, NOTIFY_MAX)}`, "info");
			} catch (error) {
				notifyFailure(ctx, "Executor status", error);
			}
		},
	});

	pi.registerCommand("executor-search", {
		description: "Search Executor tools by natural-language query (no model turn)",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /executor-search <query>   e.g. /executor-search github issues", "warning");
				return;
			}
			try {
				const text = await runExecutorCode(getClient(), buildSearchCode(query));
				ctx.ui.notify(`Executor search for "${query}":\n\n${truncate(text, NOTIFY_MAX)}`, "info");
			} catch (error) {
				notifyFailure(ctx, "Executor search", error);
			}
		},
	});

	pi.registerCommand("executor-describe", {
		description: "Describe an Executor tool by path (no model turn)",
		handler: async (args, ctx) => {
			const path = args.trim();
			if (!path) {
				ctx.ui.notify("Usage: /executor-describe <tool.path>   e.g. /executor-describe github.issues.create", "warning");
				return;
			}
			try {
				const text = await runExecutorCode(getClient(), buildDescribeCode(path));
				ctx.ui.notify(`Executor tool ${path}:\n\n${truncate(text, NOTIFY_MAX)}`, "info");
			} catch (error) {
				notifyFailure(ctx, "Executor describe", error);
			}
		},
	});

	pi.registerCommand("executor-restart", {
		description: "Reset the Executor MCP session (use if commands error with stale session)",
		handler: async (_args, ctx) => {
			if (client) await client.close();
			client = undefined;
			const fresh = new ExecutorClient(config.url, config.headers);
			const online = await fresh.ping();
			if (online) {
				client = fresh;
				ctx.ui.notify("Executor MCP session reset.", "info");
				ctx.ui.setStatus("executor", statusDot(ctx.ui.theme, "ready"));
			} else {
				await fresh.close();
				ctx.ui.notify("Executor reset failed (daemon unreachable). Is `executor web` running?", "error");
				ctx.ui.setStatus("executor", statusDot(ctx.ui.theme, "offline"));
			}
		},
	});
}

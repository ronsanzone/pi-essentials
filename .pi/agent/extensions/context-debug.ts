import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Config = {
	enabled: boolean;
	captureProviderPayload: boolean;
	captureContextMessages: boolean;
	captureSystemPromptText: boolean;
	outputDir?: string;
};

type Snapshot = {
	timestamp: string;
	cwd: string;
	event: string;
	prompt?: string;
	systemPrompt?: TextStats & { text?: string };
	systemPromptOptions?: Record<string, unknown>;
	contextMessages?: MessageStats;
	providerPayload?: TextStats & { jsonPath?: string; redacted?: boolean };
	session?: Record<string, unknown>;
	model?: Record<string, unknown>;
};

type TextStats = {
	chars: number;
	lines: number;
	approxTokens: number;
};

type MessageStats = {
	count: number;
	byRole: Record<string, number>;
	chars: number;
	approxTokens: number;
	messages: Array<{
		index: number;
		role?: string;
		chars: number;
		approxTokens: number;
		preview: string;
	}>;
};

const DEFAULT_CONFIG: Config = {
	enabled: false,
	captureProviderPayload: true,
	captureContextMessages: true,
	captureSystemPromptText: true,
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "context-debug", "config.json");
const DEFAULT_OUTPUT_ROOT = join(homedir(), ".pi", "agent", "context-debug", "runs");

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	let latest: Snapshot = newSnapshot("startup", "");
	let turnSequence = 0;
	let captureOnce = false;

	pi.registerCommand("context-debug", {
		description: "Inspect/log Pi system prompt, context messages, and provider payload. Args: on|off|once|status|report|open|config",
		handler: async (args: string = "", ctx: any) => {
			const [command, ...rest] = args.trim().split(/\s+/).filter(Boolean);
			switch (command ?? "status") {
				case "on":
					config.enabled = true;
					saveConfig(config);
					ctx.ui.notify(`context-debug enabled. Output: ${getOutputDir(config, ctx.cwd)}`, "info");
					return;
				case "off":
					config.enabled = false;
					saveConfig(config);
					ctx.ui.notify("context-debug disabled", "info");
					return;
				case "once":
					captureOnce = true;
					pi.sendUserMessage("Produce a minimal response so context-debug can capture one provider request.");
					ctx.ui.notify("Queued a one-shot capture prompt", "info");
					return;
				case "status":
					ctx.ui.notify(formatStatus(config, ctx.cwd), "info");
					return;
				case "report": {
					const path = writeReport(latest, config, ctx.cwd);
					ctx.ui.notify(`context-debug report written: ${path}`, "info");
					return;
				}
				case "open":
					ctx.ui.notify(`context-debug output dir: ${getOutputDir(config, ctx.cwd)}`, "info");
					return;
				case "config":
					applyConfigPatch(config, rest.join(" "));
					saveConfig(config);
					ctx.ui.notify(formatStatus(config, ctx.cwd), "info");
					return;
				default:
					ctx.ui.notify("Usage: /context-debug on|off|once|status|report|open|config key=value", "warning");
			}
		},
	});

	pi.on("before_agent_start", async (event: any, ctx: any) => {
		if (!shouldCapture(config, captureOnce)) return;
		turnSequence++;
		latest = newSnapshot("before_agent_start", ctx.cwd);
		latest.prompt = event.prompt;
		latest.systemPrompt = withTextStats(event.systemPrompt ?? "");
		if (config.captureSystemPromptText) latest.systemPrompt.text = event.systemPrompt ?? "";
		latest.systemPromptOptions = summarizeSystemPromptOptions(event.systemPromptOptions);
		latest.session = summarizeSession(ctx);
		latest.model = summarizeModel(ctx);
		writeSnapshot(latest, config, ctx.cwd, turnSequence, "before-agent-start");
	});

	pi.on("context", async (event: any, ctx: any) => {
		if (!shouldCapture(config, captureOnce) || !config.captureContextMessages) return;
		latest.event = "context";
		latest.contextMessages = summarizeMessages(event.messages ?? []);
		latest.session = summarizeSession(ctx);
		writeSnapshot(latest, config, ctx.cwd, turnSequence, "context");
	});

	pi.on("before_provider_request", async (event: any, ctx: any) => {
		if (!shouldCapture(config, captureOnce)) return;
		latest.event = "before_provider_request";
		const serialized = safeJson(event.payload);
		latest.providerPayload = withTextStats(serialized);
		if (config.captureProviderPayload) {
			const outDir = getOutputDir(config, ctx.cwd);
			const jsonPath = join(outDir, `provider-payload-${pad(turnSequence)}.json`);
			writeFile(jsonPath, serialized);
			latest.providerPayload.jsonPath = jsonPath;
			latest.providerPayload.redacted = false;
		}
		writeSnapshot(latest, config, ctx.cwd, turnSequence, "provider-request");
		writeReport(latest, config, ctx.cwd);
		captureOnce = false;
	});
}

function shouldCapture(config: Config, captureOnce: boolean): boolean {
	return config.enabled || captureOnce;
}

function loadConfig(): Config {
	try {
		return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveConfig(config: Config): void {
	writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function applyConfigPatch(config: Config, patch: string): void {
	for (const part of patch.split(/\s+/).filter(Boolean)) {
		const [key, rawValue] = part.split("=", 2);
		const value = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
		if (key === "outputDir" && typeof value === "string") config.outputDir = expandHome(value);
		if (key === "captureProviderPayload" && typeof value === "boolean") config.captureProviderPayload = value;
		if (key === "captureContextMessages" && typeof value === "boolean") config.captureContextMessages = value;
		if (key === "captureSystemPromptText" && typeof value === "boolean") config.captureSystemPromptText = value;
	}
}

function getOutputDir(config: Config, cwd: string): string {
	const slug = cwd.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown-cwd";
	return join(expandHome(config.outputDir ?? DEFAULT_OUTPUT_ROOT), slug);
}

function newSnapshot(event: string, cwd: string): Snapshot {
	return { timestamp: new Date().toISOString(), cwd, event };
}

function summarizeSystemPromptOptions(options: any): Record<string, unknown> {
	if (!options) return {};
	return {
		cwd: options.cwd,
		customPrompt: options.customPrompt ? withTextStats(options.customPrompt) : undefined,
		appendSystemPrompt: Array.isArray(options.appendSystemPrompt) ? options.appendSystemPrompt.map(withTextStats) : undefined,
		selectedTools: options.selectedTools,
		toolSnippets: options.toolSnippets ? Object.keys(options.toolSnippets).sort() : undefined,
		promptGuidelines: options.promptGuidelines,
		contextFiles: Array.isArray(options.contextFiles)
			? options.contextFiles.map((file: any) => ({ path: file.path, ...withTextStats(file.content ?? "") }))
			: undefined,
		skills: Array.isArray(options.skills)
			? options.skills.map((skill: any) => ({
					name: skill.name,
					descriptionChars: (skill.description ?? "").length,
					approxDescriptionTokens: approxTokens(skill.description ?? ""),
					filePath: skill.filePath,
					sourceInfo: skill.sourceInfo,
				}))
			: undefined,
	};
}

function summarizeSession(ctx: any): Record<string, unknown> {
	try {
		const entries = ctx.sessionManager?.getEntries?.() ?? [];
		const byType: Record<string, number> = {};
		const byRole: Record<string, number> = {};
		for (const entry of entries) {
			byType[entry.type] = (byType[entry.type] ?? 0) + 1;
			const role = entry.message?.role;
			if (role) byRole[role] = (byRole[role] ?? 0) + 1;
		}
		return {
			sessionFile: ctx.sessionManager?.getSessionFile?.(),
			sessionId: ctx.sessionManager?.getSessionId?.(),
			leafId: ctx.sessionManager?.getLeafId?.(),
			entries: entries.length,
			byType,
			byRole,
			contextUsage: ctx.getContextUsage?.(),
		};
	} catch (error) {
		return { error: String(error) };
	}
}

function summarizeModel(ctx: any): Record<string, unknown> {
	try {
		return ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, name: ctx.model.name, contextWindow: ctx.model.contextWindow } : {};
	} catch (error) {
		return { error: String(error) };
	}
}

function summarizeMessages(messages: any[]): MessageStats {
	const byRole: Record<string, number> = {};
	const rows = messages.map((message, index) => {
		const text = safeJson(message);
		const role = message?.role;
		if (role) byRole[role] = (byRole[role] ?? 0) + 1;
		return { index, role, chars: text.length, approxTokens: approxTokens(text), preview: preview(text) };
	});
	const chars = rows.reduce((sum, row) => sum + row.chars, 0);
	return { count: messages.length, byRole, chars, approxTokens: approxTokens("x".repeat(chars)), messages: rows };
}

function withTextStats(text: string): TextStats {
	return { chars: text.length, lines: text.length === 0 ? 0 : text.split("\n").length, approxTokens: approxTokens(text) };
}

function approxTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function preview(text: string): string {
	return text.replace(/\s+/g, " ").slice(0, 240);
}

function safeJson(value: unknown): string {
	const seen = new WeakSet<object>();
	return JSON.stringify(
		value,
		(_key, val) => {
			if (typeof val === "bigint") return val.toString();
			if (typeof val === "function") return `[Function ${val.name || "anonymous"}]`;
			if (val && typeof val === "object") {
				if (seen.has(val)) return "[Circular]";
				seen.add(val);
			}
			return val;
		},
		2,
	);
}

function writeSnapshot(snapshot: Snapshot, config: Config, cwd: string, sequence: number, label: string): string {
	const path = join(getOutputDir(config, cwd), `snapshot-${pad(sequence)}-${label}.json`);
	writeFile(path, safeJson(snapshot));
	return path;
}

function writeReport(snapshot: Snapshot, config: Config, cwd: string): string {
	const path = join(getOutputDir(config, cwd), "latest-context-report.md");
	writeFile(path, renderReport(snapshot, config));
	return path;
}

function renderReport(snapshot: Snapshot, config: Config): string {
	const lines: string[] = [];
	lines.push("# Pi Context Debug Report", "");
	lines.push(`Generated: ${snapshot.timestamp}`);
	lines.push(`CWD: ${snapshot.cwd}`);
	lines.push(`Event: ${snapshot.event}`, "");
	lines.push("## Config", "", "```json", JSON.stringify(config, null, 2), "```", "");
	if (snapshot.model) lines.push("## Model", "", "```json", JSON.stringify(snapshot.model, null, 2), "```", "");
	if (snapshot.session) lines.push("## Session", "", "```json", JSON.stringify(snapshot.session, null, 2), "```", "");
	if (snapshot.systemPrompt) {
		const { text: _text, ...stats } = snapshot.systemPrompt as any;
		lines.push("## System Prompt", "", "```json", JSON.stringify(stats, null, 2), "```", "");
		if (snapshot.systemPrompt.text) lines.push("<details><summary>System prompt text</summary>", "", "```text", snapshot.systemPrompt.text, "```", "", "</details>", "");
	}
	if (snapshot.systemPromptOptions) lines.push("## System Prompt Options Summary", "", "```json", JSON.stringify(snapshot.systemPromptOptions, null, 2), "```", "");
	if (snapshot.contextMessages) lines.push("## Context Messages", "", "```json", JSON.stringify(snapshot.contextMessages, null, 2), "```", "");
	if (snapshot.providerPayload) lines.push("## Provider Payload", "", "```json", JSON.stringify(snapshot.providerPayload, null, 2), "```", "");
	return lines.join("\n");
}

function formatStatus(config: Config, cwd: string): string {
	return `context-debug ${config.enabled ? "enabled" : "disabled"}. Output: ${getOutputDir(config, cwd)}. Config: ${CONFIG_PATH}`;
}

function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf8");
}

function expandHome(path: string): string {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function pad(value: number): string {
	return String(value).padStart(4, "0");
}

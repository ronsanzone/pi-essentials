import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

type JsonObject = Record<string, any>;

type Candidate = {
  name: string;
  source: string;
  config: JsonObject;
};

const home = homedir();
const targetPath = join(home, ".config", "mcp", "mcp.json");

function readJson(path: string): JsonObject | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path: string, data: JsonObject) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function normalizeServer(server: JsonObject): JsonObject | null {
  if (!server || typeof server !== "object") return null;

  const normalized: JsonObject = {};

  // Pi MCP adapter uses command/args for stdio and url for HTTP. Claude often
  // includes a `type` discriminator; omit it in the shared config.
  if (typeof server.command === "string") normalized.command = server.command;
  if (Array.isArray(server.args)) normalized.args = server.args;
  if (server.env && typeof server.env === "object") normalized.env = server.env;
  if (typeof server.cwd === "string") normalized.cwd = server.cwd;

  if (typeof server.url === "string") normalized.url = server.url;
  if (server.headers !== undefined) normalized.headers = server.headers;
  if (server.auth !== undefined) normalized.auth = server.auth;
  if (server.oauth !== undefined) normalized.oauth = server.oauth;
  if (server.bearerToken !== undefined) normalized.bearerToken = server.bearerToken;
  if (server.bearerTokenEnv !== undefined) normalized.bearerTokenEnv = server.bearerTokenEnv;

  // Preserve adapter-specific fields if an imported source already has them.
  for (const key of [
    "lifecycle",
    "idleTimeout",
    "exposeResources",
    "directTools",
    "excludeTools",
    "debug",
  ]) {
    if (server[key] !== undefined) normalized[key] = server[key];
  }

  if (!normalized.command && !normalized.url) return null;
  return normalized;
}

function addServers(candidates: Candidate[], source: string, servers: JsonObject | undefined) {
  if (!servers || typeof servers !== "object") return;
  for (const [name, config] of Object.entries(servers)) {
    const normalized = normalizeServer(config);
    if (normalized) candidates.push({ name, source, config: normalized });
  }
}

function discoverCandidates(): Candidate[] {
  const candidates: Candidate[] = [];

  const claudePath = join(home, ".claude.json");
  const claude = readJson(claudePath);
  if (claude) {
    addServers(candidates, "Claude global ~/.claude.json", claude.mcpServers);
    if (claude.projects && typeof claude.projects === "object") {
      for (const [projectPath, project] of Object.entries<JsonObject>(claude.projects)) {
        addServers(candidates, `Claude project ${projectPath}`, project?.mcpServers);
      }
    }
  }

  // Common shared/host-specific MCP files used by other agents/editors.
  for (const path of [
    join(home, ".cursor", "mcp.json"),
    join(home, ".codeium", "windsurf", "mcp_config.json"),
    join(home, ".config", "codex", "mcp.json"),
    join(home, ".config", "mcp", "mcp.json"),
  ]) {
    if (path === targetPath) continue;
    const json = readJson(path);
    addServers(candidates, path.replace(home, "~"), json?.mcpServers);
  }

  // De-dupe exact source/name pairs.
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.source}\u0000${candidate.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelFor(candidate: Candidate, installed: JsonObject): string {
  const status = installed[ candidate.name ] ? "installed/overwrite" : "new";
  const kind = candidate.config.url ? `http ${candidate.config.url}` : `stdio ${candidate.config.command}`;
  return `${candidate.name} — ${status} — ${candidate.source} — ${kind}`;
}

export default function syncMcpExtension(pi: ExtensionAPI) {
  pi.registerCommand("sync-mcp", {
    description: "Import MCP servers from Claude/Cursor/Codex-style configs into ~/.config/mcp/mcp.json",
    handler: async (_args, ctx) => {
      const target = readJson(targetPath) ?? { mcpServers: {} };
      target.mcpServers ??= {};

      let candidates = discoverCandidates();
      candidates = candidates.filter((c) => !(c.source === targetPath.replace(home, "~")));

      if (candidates.length === 0) {
        ctx.ui.notify("No MCP servers found in known agent configs.", "info");
        return;
      }

      const selected: Candidate[] = [];
      while (true) {
        const remaining = candidates.filter((c) => !selected.includes(c));
        const choices = [
          "Done: import selected MCP servers",
          "Cancel",
          ...remaining.map((candidate) => labelFor(candidate, target.mcpServers)),
        ];
        const choice = await ctx.ui.select(
          `Select MCP servers to import (${selected.length} selected)`,
          choices,
        );
        if (!choice || choice === "Cancel") return;
        if (choice.startsWith("Done:")) break;

        const idx = choices.indexOf(choice) - 2;
        if (idx >= 0 && remaining[idx]) selected.push(remaining[idx]);
      }

      if (selected.length === 0) {
        ctx.ui.notify("No MCP servers selected.", "info");
        return;
      }

      const summary = selected
        .map((c) => `- ${c.name} from ${c.source}${target.mcpServers[c.name] ? " (overwrite)" : ""}`)
        .join("\n");
      const ok = await ctx.ui.confirm(
        "Import MCP servers?",
        `Write to ${targetPath}:\n\n${summary}`,
      );
      if (!ok) return;

      for (const candidate of selected) {
        target.mcpServers[candidate.name] = candidate.config;
      }
      writeJson(targetPath, target);
      ctx.ui.notify(`Imported ${selected.length} MCP server(s) to ${targetPath}. Restart or /reload Pi if needed.`, "info");
    },
  });
}

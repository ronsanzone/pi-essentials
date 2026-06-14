import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function compactPath(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function fmtTps(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 TPS";
  if (n < 10) return `${n.toFixed(1)} TPS`;
  return `${Math.round(n)} TPS`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function messageTimeMs(timestamp: string | number | undefined): number | undefined {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function centeredFooterLine(left: string, center: string, right: string, width: number): string {
  const centerWidth = visibleWidth(center);
  const rightWidth = visibleWidth(right);
  const dimSepWidth = 3;

  let availableForLeft = width - rightWidth - centerWidth - dimSepWidth * 2;
  if (availableForLeft < 12) availableForLeft = Math.max(0, width - rightWidth - dimSepWidth);

  left = truncateToWidth(left, availableForLeft, "…");

  const leftWidth = visibleWidth(left);
  const targetCenterStart = Math.max(leftWidth + dimSepWidth, Math.floor((width - centerWidth) / 2));
  const leftPad = Math.max(dimSepWidth, targetCenterStart - leftWidth);
  const usedBeforeRight = leftWidth + leftPad + centerWidth;
  const rightPad = Math.max(dimSepWidth, width - usedBeforeRight - rightWidth);

  return truncateToWidth(left + " ".repeat(leftPad) + center + " ".repeat(rightPad) + right, width, "…");
}

export default function promptStatusFooter(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsubscribeBranch,
        invalidate() {},
        render(width: number): string[] {
          let cost = 0;
          let latestTps: number | undefined;
          let previousMessageTime: number | undefined;

          for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type !== "message") continue;

            const msgTime = messageTimeMs(entry.message.timestamp) ?? messageTimeMs(entry.timestamp);
            if (entry.message.role === "assistant") {
              const msg = entry.message as AssistantMessage;
              cost += msg.usage?.cost?.total ?? 0;

              const output = msg.usage?.output ?? 0;
              if (output > 0 && msgTime !== undefined && previousMessageTime !== undefined) {
                const elapsedSeconds = (msgTime - previousMessageTime) / 1_000;
                if (elapsedSeconds > 0) latestTps = output / elapsedSeconds;
              }
            }

            previousMessageTime = msgTime ?? previousMessageTime;
          }

          const cwd = compactPath(ctx.cwd);
          const branch = footerData.getGitBranch();
          const modelName = ctx.model?.name || ctx.model?.id || "no model";
          const provider = ctx.model?.provider;
          const thinking = ctx.model?.reasoning ? pi.getThinkingLevel() : undefined;
          const contextUsage = ctx.getContextUsage();
          const contextTokens = contextUsage?.tokens ?? 0;
          const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const contextPercent = contextUsage?.percent ?? (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : undefined);
          const contextPct = contextPercent === null || contextPercent === undefined ? "?" : contextPercent.toFixed(0);

          const dimSep = theme.fg("dim", "  │  ");
          const dotSep = theme.fg("dim", " · ");
          const pathSep = theme.fg("dim", " › ");

          const leftParts = [theme.fg("accent", "π"), theme.fg("success", cwd)];
          if (branch) leftParts.push(theme.fg("accent", " ") + theme.fg("success", branch));

          const rightParts = [theme.fg("customMessageLabel", `◉ ${modelName}`)];
          if (provider) rightParts.push(theme.fg("dim", provider));
          if (thinking) rightParts.push(theme.fg("warning", `‹ ${thinking} ›`));
          rightParts.push(theme.fg("dim", `⌘ ${fmtTokens(contextTokens)}/${fmtTokens(contextWindow)} (${contextPct}%)`));
          if (cost) rightParts.push(theme.fg("dim", `$${cost.toFixed(3)}`));
          if (latestTps !== undefined) rightParts.push(theme.fg("dim", fmtTps(latestTps)));

          const extensionStatuses = footerData.getExtensionStatuses();
          const primaryAlert = extensionStatuses.get("primary-alert");

          let left = leftParts.join(pathSep);
          const right = rightParts.join(dotSep);
          let primary: string;
          if (primaryAlert && stripAnsi(primaryAlert).trim()) {
            primary = centeredFooterLine(left, primaryAlert, right, width);
          } else {
            let availableForLeft = width - visibleWidth(right) - visibleWidth(dimSep);
            if (availableForLeft < 12) availableForLeft = Math.max(0, width - 2);
            left = truncateToWidth(left, availableForLeft, theme.fg("dim", "…"));

            const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
            primary = truncateToWidth(left + pad + right, width, theme.fg("dim", "…"));
          }

          const statuses = Array.from(extensionStatuses.entries())
            .filter(([key]) => key !== "primary-alert")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
              const clean = stripAnsi(value).trim();
              if (!clean) return undefined;
              return theme.fg("dim", `${key}: `) + value;
            })
            .filter((x): x is string => Boolean(x));

          if (statuses.length === 0) return [primary];

          const statusLine = truncateToWidth(
            statuses.join(dotSep),
            width,
            theme.fg("dim", "…"),
          );
          return [primary, statusLine];
        },
      };
    });
  });

  pi.registerCommand("default-footer", {
    description: "Restore Pi's default footer for this session",
    handler: async (_args, ctx) => {
      ctx.ui.setFooter(undefined);
      ctx.ui.notify("Default Pi footer restored for this session", "info");
    },
  });
}

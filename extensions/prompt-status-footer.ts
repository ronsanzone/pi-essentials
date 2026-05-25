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
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
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
          let input = 0;
          let output = 0;
          let cacheRead = 0;
          let cacheWrite = 0;
          let cost = 0;

          for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "message" && entry.message.role === "assistant") {
              const msg = entry.message as AssistantMessage;
              input += msg.usage?.input ?? 0;
              output += msg.usage?.output ?? 0;
              cacheRead += msg.usage?.cacheRead ?? 0;
              cacheWrite += msg.usage?.cacheWrite ?? 0;
              cost += msg.usage?.cost?.total ?? 0;
            }
          }

          const cwd = compactPath(ctx.cwd);
          const branch = footerData.getGitBranch();
          const modelName = ctx.model?.name || ctx.model?.id || "no model";
          const provider = ctx.model?.provider;
          const thinking = ctx.model?.reasoning ? pi.getThinkingLevel() : undefined;
          const contextUsage = ctx.getContextUsage();
          const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const contextPercent = contextUsage?.percent;
          const contextPct = contextPercent === null || contextPercent === undefined ? "?" : contextPercent.toFixed(1);

          const dimSep = theme.fg("dim", "  │  ");
          const dotSep = theme.fg("dim", " · ");
          const pathSep = theme.fg("dim", " › ");

          const leftParts = [theme.fg("accent", "π"), theme.fg("success", cwd)];
          if (branch) leftParts.push(theme.fg("accent", " ") + theme.fg("success", branch));

          const rightParts = [theme.fg("customMessageLabel", `◉ ${modelName}`)];
          if (provider) rightParts.push(theme.fg("dim", provider));
          if (thinking) rightParts.push(theme.fg("warning", `‹ ${thinking} ›`));
          rightParts.push(theme.fg("dim", `⌘ ${contextPct}%/${fmtTokens(contextWindow)}`));
          if (input || output) rightParts.push(theme.fg("dim", `↑${fmtTokens(input)} ↓${fmtTokens(output)}`));
          if (cacheRead || cacheWrite) rightParts.push(theme.fg("dim", `R${fmtTokens(cacheRead)} W${fmtTokens(cacheWrite)}`));
          if (cost) rightParts.push(theme.fg("dim", `$${cost.toFixed(3)}`));

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

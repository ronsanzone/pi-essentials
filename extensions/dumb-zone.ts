import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "primary-alert";
const TOKEN_THRESHOLD = 200_000;
const FRAME_MS = 120;
const PHRASE_FRAMES = 80;

// Threshold-gated by default. Set PI_DUMB_ZONE_ALWAYS=1 while developing to force
// the banner to appear below the real token limit.
const ALWAYS_SHOW_FOR_TESTING = process.env.PI_DUMB_ZONE_ALWAYS === "1";

const MESSAGES = [
  "welcome to the dumb zone",
  "now entering: the dumb zone",
  "certified dumb zone moment",
  "abandon wisdom, all ye who enter the dumb zone",
];

function ansi256(color: number, text: string): string {
  return `\x1b[38;5;${color}m${text}\x1b[0m`;
}

function dumbZoneGradient(text: string, frame: number): string {
  // A compact neon rainbow that reads well on dark terminals.
  const palette = [201, 207, 213, 219, 225, 219, 213, 207, 201, 165, 129, 93, 99, 135, 171];
  return Array.from(text)
    .map((ch, i) => (ch === " " ? ch : ansi256(palette[(i + frame) % palette.length], ch)))
    .join("");
}

function shouldShow(ctx: ExtensionContext): boolean {
  if (ALWAYS_SHOW_FOR_TESTING) return true;
  const usage = ctx.getContextUsage();
  return (usage?.tokens ?? 0) >= TOKEN_THRESHOLD;
}

function usageSuffix(ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  if (!usage?.tokens) return "";
  return ` (${Math.round(usage.tokens / 1000)}k)`;
}

export default function dumbZoneExtension(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let frame = 0;
  let messageIndex = 0;

  function render(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    if (!shouldShow(ctx)) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    if (frame % PHRASE_FRAMES === 0) messageIndex = (messageIndex + 1) % MESSAGES.length;

    const theme = ctx.ui.theme;
    const prefix = theme.fg("warning", "⚠ ");
    const body = dumbZoneGradient(MESSAGES[messageIndex], frame);
    const suffix = theme.fg("dim", usageSuffix(ctx));

    // prompt-status-footer centers this generic status key on the primary footer
    // line. If that extension is disabled, Pi's default footer will still show
    // this as a normal extension status line.
    ctx.ui.setStatus(STATUS_KEY, `${prefix}${body}${suffix}`);
    frame++;
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    render(ctx);
    timer = setInterval(() => render(ctx), FRAME_MS);
    // Do not keep print/RPC processes alive just because the toy banner exists.
    (timer as { unref?: () => void }).unref?.();
  });

  pi.on("turn_start", async (_event, ctx) => render(ctx));
  pi.on("turn_end", async (_event, ctx) => render(ctx));
  pi.on("message_end", async (_event, ctx) => render(ctx));

  pi.on("session_shutdown", async (_event, ctx) => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}

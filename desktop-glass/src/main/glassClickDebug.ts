/**
 * Optional click-blocking diagnostics — set IIVO_GLASS_CLICK_DEBUG=1 to enable.
 */

import type { BrowserWindow } from "electron";

const TAG = "[glass-click-debug]";
const CLICK_DEBUG_ENABLED = process.env.IIVO_GLASS_CLICK_DEBUG === "1";

function shortStack(skipFrames = 2): string {
  return (new Error().stack ?? "")
    .split("\n")
    .slice(skipFrames, skipFrames + 5)
    .map((line) => line.trim())
    .join(" | ");
}

export function logGlassClickDebug(event: string, detail?: Record<string, unknown>): void {
  if (!CLICK_DEBUG_ENABLED) return;
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`${TAG} ${event}${suffix}`);
  console.log(`${TAG} stack: ${shortStack(3)}`);
}

export function debugSetIgnoreMouseEvents(
  win: BrowserWindow,
  windowName: string,
  ignore: boolean,
  forward = false,
): void {
  logGlassClickDebug("setIgnoreMouseEvents", {
    window: windowName,
    ignore,
    forward,
  });
  if (ignore && forward) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else if (ignore) {
    win.setIgnoreMouseEvents(true);
  } else {
    win.setIgnoreMouseEvents(false);
  }
}

export function attachGlassWindowFocusDebug(win: BrowserWindow, windowName: string): void {
  win.on("focus", () => {
    logGlassClickDebug("window focus", { window: windowName });
  });
}

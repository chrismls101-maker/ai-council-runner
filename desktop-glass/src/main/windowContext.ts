/**
 * Optional active app/window context via safe macOS AppleScript (permission-gated).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
  type WindowContext,
} from "../shared/windowContextTypes.ts";

const execFileAsync = promisify(execFile);

let cachedContext: WindowContext | null = null;

async function queryMacOSFrontmost(): Promise<WindowContext> {
  try {
    const { stdout: appStdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    let windowTitle: string | undefined;
    let windowBounds: import("../shared/windowContextTypes.ts").WindowBounds | undefined;
    try {
      const { stdout: winStdout } = await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
      ]);
      windowTitle = winStdout.trim() || undefined;
    } catch {
      windowTitle = undefined;
    }
    try {
      const { stdout: boundsStdout } = await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to tell (first application process whose frontmost is true)\n' +
          "if (count of windows) > 0 then\n" +
          "set p to position of front window\n" +
          "set s to size of front window\n" +
          'return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)\n' +
          "end if\n" +
          "end tell",
      ]);
      const parts = boundsStdout.trim().split(",").map((n) => Number(n.trim()));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
        windowBounds = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
      }
    } catch {
      windowBounds = undefined;
    }
    const appName = appStdout.trim();
    if (!appName) {
      return { status: "unavailable", reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE };
    }
    return {
      status: "available",
      appName,
      windowTitle,
      windowBounds,
      displayName: windowTitle ? `${appName} — ${windowTitle}` : appName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed assistive|assistive access|1002|Accessibility/i.test(msg)) {
      return {
        status: "permission_required",
        reason: WINDOW_CONTEXT_PERMISSION_MESSAGE,
      };
    }
    return { status: "error", reason: msg };
  }
}

export async function getCurrentWindowContext(): Promise<WindowContext> {
  if (process.platform === "darwin") {
    cachedContext = await queryMacOSFrontmost();
    return cachedContext;
  }
  cachedContext = {
    status: "unavailable",
    reason: "Active app detection is only attempted on macOS in this build.",
  };
  return cachedContext;
}

export function getCachedWindowContext(): WindowContext {
  return (
    cachedContext ?? {
      status: "unavailable",
      reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
    }
  );
}

export async function refreshWindowContext(): Promise<WindowContext> {
  return getCurrentWindowContext();
}

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
    try {
      const { stdout: winStdout } = await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
      ]);
      windowTitle = winStdout.trim() || undefined;
    } catch {
      windowTitle = undefined;
    }
    const appName = appStdout.trim();
    if (!appName) {
      return { status: "unavailable", reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE };
    }
    return {
      status: "available",
      appName,
      windowTitle,
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

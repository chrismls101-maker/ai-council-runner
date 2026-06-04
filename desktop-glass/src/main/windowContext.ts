/**
 * Optional active app/window context (macOS).
 * App/title via System Events when permitted; window bounds also via workspace API (no Accessibility).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  WINDOW_CONTEXT_PERMISSION_MESSAGE,
  WINDOW_CONTEXT_UNAVAILABLE_MESSAGE,
  type WindowContext,
  type WindowBounds,
} from "../shared/windowContextTypes.ts";
import { queryFrontWindowBoundsViaWorkspace } from "./macosWindowBounds.ts";

const execFileAsync = promisify(execFile);

let cachedContext: WindowContext | null = null;

async function queryViaSystemEvents(): Promise<WindowContext> {
  const { stdout: appStdout } = await execFileAsync("osascript", [
    "-e",
    'tell application "System Events" to get name of first application process whose frontmost is true',
  ]);
  let windowTitle: string | undefined;
  let windowBounds: WindowBounds | undefined;
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
    boundsSource: windowBounds ? "system_events" : undefined,
    displayName: windowTitle ? `${appName} — ${windowTitle}` : appName,
  };
}

async function mergeWorkspaceBounds(ctx: WindowContext): Promise<WindowContext> {
  const workspace = await queryFrontWindowBoundsViaWorkspace();
  if (!workspace) return ctx;

  const next: WindowContext = { ...ctx };

  if (!next.appName && workspace.appName) {
    next.appName = workspace.appName;
    next.displayName = workspace.appName;
  }

  if (!next.windowBounds && workspace.bounds) {
    next.windowBounds = workspace.bounds;
    next.boundsSource = "workspace";
  }

  if (next.status === "permission_required" && next.windowBounds) {
    return {
      ...next,
      status: "available",
      reason:
        "Window title needs Accessibility permission; focused crop uses workspace window bounds.",
    };
  }

  if (next.status === "unavailable" && workspace.appName && workspace.bounds) {
    return {
      status: "available",
      appName: workspace.appName,
      windowBounds: workspace.bounds,
      boundsSource: "workspace",
      displayName: workspace.appName,
    };
  }

  return next;
}

async function queryMacOSFrontmost(): Promise<WindowContext> {
  try {
    const ctx = await queryViaSystemEvents();
    return mergeWorkspaceBounds(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed assistive|assistive access|1002|Accessibility/i.test(msg)) {
      const withWorkspace = await mergeWorkspaceBounds({
        status: "permission_required",
        reason: WINDOW_CONTEXT_PERMISSION_MESSAGE,
      });
      if (withWorkspace.windowBounds) {
        return withWorkspace;
      }
      return withWorkspace;
    }
    const fallback = await mergeWorkspaceBounds({
      status: "error",
      reason: msg,
    });
    return fallback.windowBounds
      ? { ...fallback, status: "available", reason: msg }
      : fallback;
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

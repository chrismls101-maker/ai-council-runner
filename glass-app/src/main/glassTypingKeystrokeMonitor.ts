/**
 * Optional CGEventTap keystroke + click monitor — supports multiple subscribers.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

let child: ChildProcess | null = null;
const subscribers = new Map<string, () => void>();
const clickSubscribers = new Map<string, (x: number, y: number) => void>();
const exitListeners = new Set<() => void>();
let legacyTypingHandler: (() => void) | null = null;
let lastKeystrokeAt = 0;

function resolveMonitorCommand(): { bin: string; args: string[] } | null {
  if (process.platform !== "darwin") return null;

  const bundled = app.isPackaged
    ? join(process.resourcesPath, "bin", "glass-typing-keystroke-monitor")
    : join(app.getAppPath(), "..", "..", "resources", "bin", "glass-typing-keystroke-monitor");

  if (existsSync(bundled)) {
    return { bin: bundled, args: [] };
  }

  const swiftScript = join(app.getAppPath(), "..", "..", "scripts", "glass-typing-keystroke-monitor.swift");
  if (existsSync(swiftScript)) {
    return { bin: "swift", args: [swiftScript] };
  }

  return null;
}

function notifyKeystroke(): void {
  lastKeystrokeAt = Date.now();
  for (const handler of subscribers.values()) {
    try {
      handler();
    } catch {
      /* subscriber error — continue */
    }
  }
  legacyTypingHandler?.();
}

function notifyClick(x: number, y: number): void {
  for (const handler of clickSubscribers.values()) {
    try {
      handler(x, y);
    } catch {
      /* subscriber error — continue */
    }
  }
}

function handleMonitorLine(line: string): void {
  if (line === "key") {
    notifyKeystroke();
    return;
  }
  if (line.startsWith("click ")) {
    const parts = line.split(/\s+/);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      notifyClick(x, y);
    }
  }
}

function startMonitorProcess(): boolean {
  if (child) return true;
  const cmd = resolveMonitorCommand();
  if (!cmd) return false;

  try {
    const proc = spawn(cmd.bin, cmd.args, { stdio: ["ignore", "pipe", "pipe"] });
    child = proc;
  } catch {
    child = null;
    return false;
  }

  let buffer = "";
  const proc = child;
  proc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleMonitorLine(line);
      idx = buffer.indexOf("\n");
    }
  });

  proc.stderr?.on("data", () => {
    /* tap permission may be missing */
  });

  proc.on("exit", () => {
    child = null;
    for (const listener of exitListeners) {
      try {
        listener();
      } catch {
        /* listener error */
      }
    }
  });

  return true;
}

function stopMonitorProcess(): void {
  if (!child) return;
  child.kill("SIGTERM");
  child = null;
}

function monitorNeeded(): boolean {
  return subscribers.size > 0 || clickSubscribers.size > 0 || legacyTypingHandler != null;
}

function ensureMonitor(): boolean {
  if (!monitorNeeded()) {
    stopMonitorProcess();
    return false;
  }
  return startMonitorProcess();
}

/** Subscribe to global keystrokes. Returns unsubscribe function. */
export function subscribeKeystrokeMonitor(id: string, handler: () => void): () => void {
  subscribers.set(id, handler);
  ensureMonitor();
  return () => {
    subscribers.delete(id);
    ensureMonitor();
  };
}

/** Subscribe to global left clicks (CGEventTap). Returns unsubscribe function. */
export function subscribeClickMonitor(
  id: string,
  handler: (x: number, y: number) => void,
): () => void {
  clickSubscribers.set(id, handler);
  ensureMonitor();
  return () => {
    clickSubscribers.delete(id);
    ensureMonitor();
  };
}

/** @deprecated Prefer subscribeKeystrokeMonitor — typing intelligence legacy API. */
export function startTypingKeystrokeMonitor(handler: () => void): boolean {
  legacyTypingHandler = handler;
  return ensureMonitor();
}

/** @deprecated Prefer unsubscribe via subscribeKeystrokeMonitor return value. */
export function stopTypingKeystrokeMonitor(): void {
  legacyTypingHandler = null;
  ensureMonitor();
}

export function typingKeystrokeMonitorActive(): boolean {
  return child != null;
}

export function keystrokeSubscriberCount(): number {
  return subscribers.size + clickSubscribers.size + (legacyTypingHandler ? 1 : 0);
}

/** Unix ms of the last global keystroke, or 0 if none observed yet. */
export function getLastKeystrokeAt(): number {
  return lastKeystrokeAt;
}

/** True when the CGEventTap helper binary or swift script is available. */
export function clickMonitorAvailable(): boolean {
  return resolveMonitorCommand() != null;
}

/** Called when the monitor subprocess exits (permission denied, crash, etc.). */
export function onTypingKeystrokeMonitorExit(listener: () => void): () => void {
  exitListeners.add(listener);
  return () => exitListeners.delete(listener);
}

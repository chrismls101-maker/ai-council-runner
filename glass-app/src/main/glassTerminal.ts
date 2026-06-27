/**
 * IIVO Glass built-in terminal — PTY session manager.
 *
 * Uses node-pty to allocate a real pseudo-terminal on macOS. Each session
 * has a unique ID. Data is streamed out via a callback; input + resize are
 * sent in via methods. Supports a single active session (expandable to tabs).
 *
 * Main process only — never imported by renderer.
 */

import * as pty from "node-pty";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { shellLaunchConfig } from "./glassShellIntegration.ts";

const execAsync = promisify(exec);

const nodeRequire = createRequire(import.meta.url);

export interface PtySession {
  id: string;
  term: pty.IPty;
  createdAt: number;
  cols: number;
  rows: number;
}

/** Context passed to onExit so the caller can build an error fix prompt. */
export interface GlassTerminalExitContext {
  lastCommand: string | null;
  outputLines: string[];
}

export interface GlassTerminalCallbacks {
  /** Called whenever the PTY produces output data. */
  onData: (termId: string, data: string) => void;
  /** Called when the PTY process exits. Includes output context for auto-fix. */
  onExit: (termId: string, exitCode: number, context: GlassTerminalExitContext) => void;
}

// ─── ANSI stripping ───────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]/g;

function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, "").replace(/\r/g, "");
}

// ─── Per-session buffers ──────────────────────────────────────────────────────

const MAX_OUTPUT_LINES = 100;

/** Stripped output lines (no ANSI) — for error context sent to AI. */
const sessionOutputBuffers = new Map<string, string[]>();
/** Partial keystroke buffer — accumulates typed chars between Enter presses. */
const sessionInputBuffers = new Map<string, string>();
/** Last fully-submitted command (what was running when exit fired). */
const sessionLastCommands = new Map<string, string>();
/** Raw PTY output for replay when the renderer (re)attaches. */
const sessionReplayBuffers = new Map<string, string>();

const MAX_REPLAY_CHARS = 512_000;

function appendPtyReplay(termId: string, data: string): void {
  const prev = sessionReplayBuffers.get(termId) ?? "";
  const next = prev + data;
  sessionReplayBuffers.set(
    termId,
    next.length > MAX_REPLAY_CHARS ? next.slice(-MAX_REPLAY_CHARS) : next,
  );
}

export function getPtyReplayBuffer(termId: string): string {
  return sessionReplayBuffers.get(termId) ?? "";
}

export function getPtyReplayBufferLength(termId: string): number {
  return (sessionReplayBuffers.get(termId) ?? "").length;
}

/** Replay PTY output from a byte offset (used after resize so the shell prompt is not duplicated). */
export function getPtyReplayBufferFrom(termId: string, fromByte: number): string {
  const full = sessionReplayBuffers.get(termId) ?? "";
  if (fromByte <= 0) return full;
  if (fromByte >= full.length) return "";
  return full.slice(fromByte);
}

// ─── Session registry ─────────────────────────────────────────────────────────

const sessions = new Map<string, PtySession>();
let nextId = 1;

function makeId(): string {
  return `pty-${Date.now()}-${nextId++}`;
}

/** node-pty's spawn-helper must be executable or macOS returns posix_spawnp failed. */
export function ensurePtySpawnHelperExecutable(): void {
  if (process.platform === "win32") return;
  try {
    const ptyRoot = path.dirname(nodeRequire.resolve("node-pty/package.json"));
    const candidates = [
      path.join(ptyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
      path.join(ptyRoot, "build", "Release", "spawn-helper"),
    ];
    for (const helper of candidates) {
      if (!fs.existsSync(helper)) continue;
      const mode = fs.statSync(helper).mode;
      if ((mode & 0o111) === 0) {
        fs.chmodSync(helper, mode | 0o755);
      }
    }
  } catch {
    /* best-effort — createPtySession will surface spawn errors */
  }
}

ensurePtySpawnHelperExecutable();

// ─── Shell resolution ─────────────────────────────────────────────────────────

/**
 * Pick the best available interactive shell.
 * Respects $SHELL env var, falls back to zsh → bash.
 */
function resolveShell(): string {
  const envShell = process.env.SHELL;
  if (envShell && !envShell.includes("false") && !envShell.includes("nologin")) {
    return envShell;
  }
  // macOS default
  return "/bin/zsh";
}

/**
 * Sensible initial environment for the PTY.
 * Inherits process.env but ensures TERM + HOME are set.
 */
function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.HOME = env.HOME ?? os.homedir();
  // Make sure PATH includes common locations.
  if (!env.PATH?.includes("/usr/local/bin")) {
    env.PATH = `/usr/local/bin:/opt/homebrew/bin:${env.PATH ?? "/usr/bin:/bin"}`;
  }
  return env;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new PTY session. Returns the session id.
 */
export function createPtySession(
  callbacks: GlassTerminalCallbacks,
  opts: { cols?: number; rows?: number } = {},
): string {
  const id = makeId();
  const cols = opts.cols ?? 120;
  const rows = opts.rows ?? 30;
  const shell = resolveShell();
  const cwd = os.homedir();
  const launch = shellLaunchConfig(shell);
  const env = { ...buildEnv(), ...launch.env };

  let term: pty.IPty;
  try {
    term = pty.spawn(shell, launch.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      detail.includes("posix_spawnp")
        ? "Glass terminal could not start the shell. Try restarting the app; if it persists, run: npm run postinstall --prefix desktop-glass"
        : `Glass terminal failed to start: ${detail}`,
    );
  }

  const session: PtySession = { id, term, createdAt: Date.now(), cols, rows };
  sessions.set(id, session);
  sessionOutputBuffers.set(id, []);
  sessionInputBuffers.set(id, "");

  term.onData((data: string) => {
    appendPtyReplay(id, data);
    // Buffer stripped output for auto-fix context
    const buf = sessionOutputBuffers.get(id);
    if (buf) {
      const stripped = stripAnsi(data);
      const lines = stripped.split("\n");
      buf.push(...lines);
      if (buf.length > MAX_OUTPUT_LINES) {
        buf.splice(0, buf.length - MAX_OUTPUT_LINES);
      }
    }
    callbacks.onData(id, data);
  });

  term.onExit(({ exitCode }: { exitCode: number }) => {
    // Snapshot buffers BEFORE deleting session — callback needs them
    const outputLines = sessionOutputBuffers.get(id) ?? [];
    const lastCommand = sessionLastCommands.get(id) ?? null;

    sessions.delete(id);
    sessionReplayBuffers.delete(id);
    // Clean up buffers with a small delay so caller can read them if needed
    setTimeout(() => {
      sessionOutputBuffers.delete(id);
      sessionInputBuffers.delete(id);
      sessionLastCommands.delete(id);
    }, 10_000);

    callbacks.onExit(id, exitCode ?? 0, {
      lastCommand,
      outputLines: [...outputLines],
    });
  });

  return id;
}

/**
 * Write input data (keystrokes) to a PTY session.
 * Also tracks the last submitted command for error context.
 */
export function writePtyInput(termId: string, data: string): void {
  const session = sessions.get(termId);
  if (!session) return;

  // Track typed command for auto-fix context.
  // \r = Enter in terminal. Backspace = \x7f.
  const partial = sessionInputBuffers.get(termId) ?? "";
  if (data.includes("\r") || data.includes("\n")) {
    const cmd = (partial + data).replace(/\r|\n/g, "").trim();
    if (cmd) sessionLastCommands.set(termId, cmd);
    sessionInputBuffers.set(termId, "");
  } else if (data === "\x7f") {
    sessionInputBuffers.set(termId, partial.slice(0, -1));
  } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
    // Printable char
    sessionInputBuffers.set(termId, partial + data);
  }

  session.term.write(data);
}

/**
 * Resize a PTY session to new dimensions.
 */
export function resizePty(termId: string, cols: number, rows: number): void {
  const session = sessions.get(termId);
  if (!session) return;
  try {
    session.term.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
  } catch {
    // ignore — PTY may already be exiting
  }
}

/**
 * Kill a PTY session.
 */
export function killPtySession(termId: string): void {
  const session = sessions.get(termId);
  if (!session) return;
  try {
    session.term.kill();
  } catch {
    // ignore
  }
  sessions.delete(termId);
  sessionReplayBuffers.delete(termId);
}

/**
 * Kill all active PTY sessions — called on app quit.
 */
export function killAllPtySessions(): void {
  for (const [id] of sessions) {
    killPtySession(id);
  }
}

/**
 * Returns active session IDs.
 */
export function getActivePtySessionIds(): string[] {
  return [...sessions.keys()];
}

/**
 * Returns the name of the foreground process running in the PTY session,
 * or null if the shell itself is in the foreground (no child processes).
 * macOS/zsh compatible.
 */
export async function getForegroundProcessName(termId: string): Promise<string | null> {
  const session = sessions.get(termId);
  if (!session) return null;
  const shellPid = session.term.pid;
  try {
    // Get direct child PIDs of the shell
    const { stdout: childPids } = await execAsync(`pgrep -P ${shellPid} 2>/dev/null || true`);
    const firstChild = childPids.trim().split("\n").filter(Boolean)[0];
    if (!firstChild) return null; // shell is foreground, no title to show
    // Get the process name
    const { stdout: name } = await execAsync(`ps -o comm= -p ${firstChild} 2>/dev/null || true`);
    const processName = name.trim();
    // Filter out shell sub-processes we don't want to show (pgrep, ps itself)
    if (!processName || processName === "pgrep" || processName === "ps") return null;
    return processName;
  } catch {
    return null;
  }
}

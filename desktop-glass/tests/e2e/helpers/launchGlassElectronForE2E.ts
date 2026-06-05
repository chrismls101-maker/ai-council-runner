/**
 * IIVO Glass Electron E2E launcher (intentional compatibility layer).
 *
 * Playwright's `_electron.launch()` passes `--remote-debugging-port=0`, which
 * Electron 31 rejects ("bad option: --remote-debugging-port=0"). We spawn the
 * Electron binary directly and connect over CDP on a fixed port configured in
 * main when IIVO_GLASS_E2E=1 (see index.ts remote-debugging-port 19222).
 */

import { execSync } from "node:child_process";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import { startStubServer, type StubServerHandle } from "./stubServer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GLASS_ROOT = path.resolve(__dirname, "../../..");
export const GLASS_MAIN = path.join(GLASS_ROOT, "out/main/index.js");
export const GLASS_ELECTRON_BIN = path.join(
  GLASS_ROOT,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
export const GLASS_CDP_PORT = 19222;
export const GLASS_CDP_URL = `http://127.0.0.1:${GLASS_CDP_PORT}`;
const CDP_STARTUP_TIMEOUT_MS = 45_000;
const CDP_CONNECT_RETRIES = 3;
const STDERR_TAIL_CHARS = 2_000;

export interface LaunchedGlassElectron {
  browser: Browser;
  electronProcess: ChildProcess;
  stub: StubServerHandle;
  getStderrTail: () => string;
}

function stderrTail(stderr: string): string {
  if (stderr.length <= STDERR_TAIL_CHARS) return stderr;
  return stderr.slice(-STDERR_TAIL_CHARS);
}

/** Best-effort: report whether the fixed CDP port is already bound. */
export function isCdpPortInUse(port = GLASS_CDP_PORT): boolean {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Kill stale processes holding the CDP port (leftover from a prior failed run). */
export function killStaleProcessesOnCdpPort(port = GLASS_CDP_PORT): void {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!out) return;
    for (const pid of out.split("\n")) {
      const n = Number(pid);
      if (Number.isFinite(n) && n > 0) {
        try {
          process.kill(n, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* port free */
  }
}

function formatLaunchFailure(opts: {
  message: string;
  electronProcess: ChildProcess;
  stderr: string;
  portInUse: boolean;
}): string {
  const lines = [
    opts.message,
    `  electron pid: ${opts.electronProcess.pid ?? "unknown"}`,
    `  app path: ${GLASS_ELECTRON_BIN}`,
    `  main bundle: ${GLASS_MAIN}`,
    `  launch args: [${GLASS_MAIN}]`,
    `  CDP port: ${GLASS_CDP_PORT} (${opts.portInUse ? "in use before launch" : "was free at failure"})`,
    `  CDP url: ${GLASS_CDP_URL}`,
    `  stderr tail:\n${stderrTail(opts.stderr) || "(empty)"}`,
  ];
  return lines.join("\n");
}

async function waitForCdp(
  url: string,
  electronProcess: ChildProcess,
  stderr: string,
  timeoutMs = CDP_STARTUP_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";

  while (Date.now() < deadline) {
    if (electronProcess.exitCode != null) {
      throw new Error(
        formatLaunchFailure({
          message: `Electron process exited before CDP was ready (code ${electronProcess.exitCode}).`,
          electronProcess,
          stderr,
          portInUse: isCdpPortInUse(),
        }),
      );
    }
    try {
      const res = await fetch(`${url}/json/version`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(
    formatLaunchFailure({
      message: `Electron CDP not ready at ${url} within ${timeoutMs}ms (last error: ${lastError}).`,
      electronProcess,
      stderr,
      portInUse: isCdpPortInUse(),
    }),
  );
}

async function connectOverCdpWithRetry(url: string, electronProcess: ChildProcess, stderr: string): Promise<Browser> {
  let lastError: unknown = new Error("CDP connect failed");
  for (let attempt = 1; attempt <= CDP_CONNECT_RETRIES; attempt += 1) {
    try {
      return await chromium.connectOverCDP(url);
    } catch (err) {
      lastError = err;
      if (attempt < CDP_CONNECT_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    formatLaunchFailure({
      message: `browserType.connectOverCDP failed after ${CDP_CONNECT_RETRIES} attempts: ${detail}`,
      electronProcess,
      stderr,
      portInUse: isCdpPortInUse(),
    }),
  );
}

export async function launchGlassElectronForE2E(): Promise<LaunchedGlassElectron> {
  killStaleProcessesOnCdpPort();
  const portInUseBefore = isCdpPortInUse();
  if (portInUseBefore) {
    process.stderr.write(
      `[glass-e2e] warning: CDP port ${GLASS_CDP_PORT} still in use after stale cleanup; retrying kill\n`,
    );
    killStaleProcessesOnCdpPort();
  }

  const stub = await startStubServer();

  const env: Record<string, string | undefined> = {
    ...process.env,
    IIVO_GLASS_E2E: "1",
    IIVO_API_URL: stub.baseUrl,
    IIVO_WEB_URL: stub.baseUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronProcess = spawn(GLASS_ELECTRON_BIN, [GLASS_MAIN], {
    cwd: GLASS_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  electronProcess.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    if (/error/i.test(text)) {
      process.stderr.write(`[glass-e2e pid=${electronProcess.pid}] ${text}`);
    }
  });

  electronProcess.on("exit", (code) => {
    if (code != null && code !== 0) {
      process.stderr.write(
        `[glass-e2e] Electron exited with code ${code} (pid=${electronProcess.pid})\n${stderrTail(stderr)}\n`,
      );
    }
  });

  try {
    await waitForCdp(GLASS_CDP_URL, electronProcess, stderr);
    const browser = await connectOverCdpWithRetry(GLASS_CDP_URL, electronProcess, stderr);
    return {
      browser,
      electronProcess,
      stub,
      getStderrTail: () => stderrTail(stderr),
    };
  } catch (err) {
    electronProcess.kill("SIGKILL");
    await stub.close().catch(() => undefined);
    killStaleProcessesOnCdpPort();
    throw err;
  }
}

export async function closeGlassElectronForE2E(app: LaunchedGlassElectron): Promise<void> {
  try {
    await app.browser.close();
  } catch {
    /* best-effort */
  }
  try {
    app.electronProcess.kill("SIGTERM");
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && app.electronProcess.exitCode == null) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (app.electronProcess.exitCode == null) {
      app.electronProcess.kill("SIGKILL");
    }
  } catch {
    /* best-effort */
  }
  killStaleProcessesOnCdpPort();
  await app.stub.close().catch(() => undefined);
}

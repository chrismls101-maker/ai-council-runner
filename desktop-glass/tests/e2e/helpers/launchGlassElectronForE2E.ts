/**
 * IIVO Glass Electron E2E launcher (intentional compatibility layer).
 *
 * Playwright's `_electron.launch()` passes `--remote-debugging-port=0`, which
 * Electron 31 rejects ("bad option: --remote-debugging-port=0"). We spawn the
 * Electron binary directly and connect over CDP on a fixed port configured in
 * main when IIVO_GLASS_E2E=1 (see index.ts remote-debugging-port 19222).
 *
 * This is supported infrastructure — not a workaround limitation.
 */

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

export interface LaunchedGlassElectron {
  browser: Browser;
  electronProcess: ChildProcess;
  stub: StubServerHandle;
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
        `Electron process exited before CDP was ready (code ${electronProcess.exitCode}).\n${stderr}`,
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
    `Electron CDP not ready at ${url} within ${timeoutMs}ms (last error: ${lastError}). ` +
      "Ensure IIVO_GLASS_E2E=1 sets remote-debugging-port and the app built successfully.",
  );
}

export async function launchGlassElectronForE2E(): Promise<LaunchedGlassElectron> {
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
      process.stderr.write(`[glass-e2e] ${text}`);
    }
  });

  electronProcess.on("exit", (code) => {
    if (code != null && code !== 0) {
      process.stderr.write(`[glass-e2e] Electron exited with code ${code}\n${stderr}`);
    }
  });

  await waitForCdp(GLASS_CDP_URL, electronProcess, stderr);
  const browser = await chromium.connectOverCDP(GLASS_CDP_URL);

  return { browser, electronProcess, stub };
}

export async function closeGlassElectronForE2E(app: LaunchedGlassElectron): Promise<void> {
  await app.browser.close().catch(() => undefined);
  app.electronProcess.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!app.electronProcess.killed) {
    app.electronProcess.kill("SIGKILL");
  }
  await app.stub.close().catch(() => undefined);
}

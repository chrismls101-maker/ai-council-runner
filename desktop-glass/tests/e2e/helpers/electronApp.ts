import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { startStubServer, type StubServerHandle } from "./stubServer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GLASS_ROOT = path.resolve(__dirname, "../../..");
export const GLASS_MAIN = path.join(GLASS_ROOT, "out/main/index.js");
export const GLASS_ELECTRON_BIN = path.join(
  GLASS_ROOT,
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
export const GLASS_CDP_PORT = 19222;

export interface LaunchedGlass {
  browser: Browser;
  electronProcess: ChildProcess;
  stub: StubServerHandle;
}

async function waitForCdp(port: number, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Electron CDP not ready on port ${port} within ${timeoutMs}ms`);
}

export async function launchGlassApp(): Promise<LaunchedGlass> {
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

  electronProcess.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes("Error") || text.includes("error")) {
      process.stderr.write(`[glass-e2e] ${text}`);
    }
  });

  await waitForCdp(GLASS_CDP_PORT);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${GLASS_CDP_PORT}`);

  return { browser, electronProcess, stub };
}

export async function closeGlassApp(app: LaunchedGlass): Promise<void> {
  await app.browser.close().catch(() => undefined);
  app.electronProcess.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!app.electronProcess.killed) {
    app.electronProcess.kill("SIGKILL");
  }
  await app.stub.close().catch(() => undefined);
}

function allPages(browser: Browser): Page[] {
  return browser.contexts().flatMap((ctx) => ctx.pages());
}

export async function waitForWindowPage(browser: Browser, htmlFile: string, timeoutMs = 25_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of allPages(browser)) {
      if (page.url().includes(htmlFile)) {
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        return page;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const urls = allPages(browser).map((p) => p.url());
  throw new Error(`Window ${htmlFile} not found. Open pages: ${urls.join(", ") || "none"}`);
}

export async function getGlassWindows(browser: Browser): Promise<{
  command: Page;
  overlay: Page;
  dock: Page;
  panel: Page;
}> {
  const [command, overlay, dock, panel] = await Promise.all([
    waitForWindowPage(browser, "command.html"),
    waitForWindowPage(browser, "overlay.html"),
    waitForWindowPage(browser, "index.html"),
    waitForWindowPage(browser, "panel.html"),
  ]);
  return { command, overlay, dock, panel };
}

export async function resetE2eExternalUrls(page: Page): Promise<void> {
  await page.evaluate(() => window.glass.resetE2eExternalUrls());
}

export async function getE2eExternalUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => window.glass.getE2eExternalUrls());
}

export async function readGlassState(page: Page) {
  return page.evaluate(async () => window.glass.getState());
}

export function shouldSkipElectronE2e(): string | null {
  if (process.env.GLASS_E2E_FORCE === "1") return null;
  if (process.env.CI === "true" || process.env.CI === "1") {
    return "Electron E2E skipped in CI (set GLASS_E2E_FORCE=1 to override). Run locally on macOS.";
  }
  if (process.platform === "linux" && !process.env.DISPLAY) {
    return "Electron E2E requires a display (set GLASS_E2E_FORCE=1 to override).";
  }
  return null;
}

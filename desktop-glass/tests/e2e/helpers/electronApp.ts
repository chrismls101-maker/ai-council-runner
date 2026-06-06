import type { Browser, Page } from "@playwright/test";
import {
  closeGlassElectronForE2E,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassElectronForE2E,
  type LaunchedGlassElectron,
} from "./launchGlassElectronForE2E.ts";
import { getElectronE2eSkipReason, shouldSkipElectronE2e } from "./e2eEnvironment.ts";
import type { StubServerHandle } from "./stubServer.ts";

export {
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  GLASS_CDP_PORT,
  GLASS_ROOT,
} from "./launchGlassElectronForE2E.ts";
export { getElectronE2eSkipReason, shouldSkipElectronE2e } from "./e2eEnvironment.ts";
export {
  closeGlassElectronForE2E,
  launchGlassElectronForE2E,
  type LaunchedGlassElectron,
} from "./launchGlassElectronForE2E.ts";

export type LaunchedGlass = LaunchedGlassElectron;

export async function launchGlassApp(): Promise<LaunchedGlass> {
  return launchGlassElectronForE2E();
}

export async function closeGlassApp(app: LaunchedGlass): Promise<void> {
  return closeGlassElectronForE2E(app);
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

export async function getE2eWindowMetadata(page: Page) {
  return page.evaluate(() => window.glass.getE2eWindowMetadata());
}

export function getStubHandoffFromApp(app: LaunchedGlass): StubServerHandle {
  return app.stub;
}

export async function verifyHandoffUrlReachable(
  app: LaunchedGlass,
  handoffUrl: string,
): Promise<{ ok: boolean; status: number }> {
  const parsed = new URL(handoffUrl);
  const target = `${app.stub.baseUrl}${parsed.pathname}${parsed.search}`;
  const res = await fetch(target);
  return { ok: res.ok, status: res.status };
}

export async function getE2eCaptureTarget(page: Page): Promise<{ id: number; label: string }> {
  return page.evaluate(() => window.glass.getE2eCaptureTarget());
}

export async function readGlassState(page: Page) {
  return page.evaluate(async () => window.glass.getState());
}

export async function openPanelTab(
  panel: Page,
  tab: "summary" | "setup" | "session" | "insights" | "context" | "hypotheses" | "actions" | "diagnostics",
): Promise<void> {
  await panel.locator(`[data-testid="glass-panel-tab-${tab}"]`).click();
}

import type { Page } from "@playwright/test";
import type { Browser } from "@playwright/test";
import {
  getE2eWindowMetadata,
  readGlassState,
  type LaunchedGlass,
} from "./electronApp.ts";

function allPageUrls(browser: Browser): string[] {
  return browser.contexts().flatMap((ctx) => ctx.pages().map((p) => p.url()));
}

/** Log structured context when an E2E test fails (stderr tail, windows, glass state). */
export async function logE2eFailureDiagnostics(
  app: LaunchedGlass | undefined,
  commandPage: Page | undefined,
  testTitle: string,
): Promise<void> {
  const lines = [`\n[e2e-failure] test: ${testTitle}`];

  if (!app) {
    lines.push("  app: not launched");
    console.error(lines.join("\n"));
    return;
  }

  lines.push(`  electron pid: ${app.electronProcess.pid ?? "unknown"}`);
  lines.push(`  electron exitCode: ${String(app.electronProcess.exitCode)}`);
  const stderrTail = app.getStderrTail?.();
  if (stderrTail) {
    lines.push(`  stderr tail:\n${stderrTail}`);
  }

  lines.push(`  open pages: ${allPageUrls(app.browser).join(", ") || "none"}`);

  const page = commandPage ?? app.browser.contexts()[0]?.pages()[0];
  if (page) {
    try {
      const meta = await getE2eWindowMetadata(page);
      lines.push(`  window metadata: ${JSON.stringify(meta)}`);
    } catch (err) {
      lines.push(`  window metadata: unavailable (${err instanceof Error ? err.message : String(err)})`);
    }
    try {
      const state = await readGlassState(page);
      lines.push(`  glass state snapshot: ${JSON.stringify(state, null, 0).slice(0, 4000)}`);
    } catch (err) {
      lines.push(`  glass state: unavailable (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  console.error(lines.join("\n"));
}

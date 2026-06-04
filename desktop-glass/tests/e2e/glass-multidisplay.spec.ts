import { test, expect } from "@playwright/test";
import fs from "node:fs";
import type { ConnectedDisplaySnapshot } from "../../src/shared/displayInfo.ts";
import {
  findExternalDisplay,
  findPrimaryDisplay,
  formatDisplayReport,
  overlayBoundsOnDisplay,
  rectInsideWorkArea,
} from "./helpers/displayTestHelpers.ts";
import {
  closeGlassApp,
  getE2eCaptureTarget,
  getE2eWindowMetadata,
  getElectronE2eSkipReason,
  getGlassWindows,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";

let app: LaunchedGlass;
let displays: ConnectedDisplaySnapshot[] = [];
let primary: ConnectedDisplaySnapshot | undefined;
let external: ConnectedDisplaySnapshot | undefined;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Glass main bundle missing. Run `npm run glass:build` before E2E.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing. Run `npm install --prefix desktop-glass`.");
  }

  app = await launchGlassApp();
  await getGlassWindows(app.browser);

  const { command } = await getGlassWindows(app.browser);
  const state = await readGlassState(command);
  displays = state.connectedDisplays;
  primary = findPrimaryDisplay(displays);
  external = findExternalDisplay(displays);

  // eslint-disable-next-line no-console
  console.log(
    `[glass-multidisplay] detected ${displays.length} display(s): ${formatDisplayReport(displays)}`,
  );
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

function requireMultiDisplay(): void {
  test.skip(
    displays.length < 2 || !external || !primary,
    "Multi-display test skipped: only one display detected.",
  );
}

test.describe("IIVO Glass multi-display E2E", () => {
  test("connected displays diagnostic", async () => {
    expect(displays.length).toBeGreaterThan(0);
    expect(primary).toBeDefined();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          displayCount: displays.length,
          primary: primary
            ? { id: primary.id, bounds: primary.bounds, label: primary.label }
            : null,
          external: external
            ? { id: external.id, bounds: external.bounds, label: external.label }
            : null,
          all: displays.map((d) => ({
            id: d.id,
            label: d.label,
            isPrimary: d.isPrimary,
            bounds: d.bounds,
            cursorInside: d.cursorInside,
          })),
        },
        null,
        2,
      ),
    );
  });

  test("select external display moves overlay, command bar, dock, and panel", async () => {
    requireMultiDisplay();
    const { command, dock, panel } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await expect(panel.locator('[data-testid="glass-panel"]')).toBeVisible();

    await panel.locator('[data-testid="glass-display-select"]').selectOption(String(external!.id));

    await expect
      .poll(async () => (await readGlassState(command)).glassSettings.displayTarget)
      .toBe(external!.id);

    const stateAfterSelect = await readGlassState(command);
    const externalLive =
      findExternalDisplay(stateAfterSelect.connectedDisplays) ?? external!;

    await expect
      .poll(async () => {
        const metadata = await getE2eWindowMetadata(command);
        const overlay = metadata.find((m) => m.name === "overlay");
        return (
          overlay?.bounds != null &&
          overlay.displayId === externalLive.id &&
          overlayBoundsOnDisplay(overlay.bounds, externalLive)
        );
      })
      .toBe(true);

    const metadata = await getE2eWindowMetadata(command);
    const overlay = metadata.find((m) => m.name === "overlay")!;
    const commandBar = metadata.find((m) => m.name === "commandBar")!;
    const dockMeta = metadata.find((m) => m.name === "dock")!;
    const panelMeta = metadata.find((m) => m.name === "panel")!;

    expect(overlay.displayId).toBe(externalLive.id);
    expect(commandBar.displayId).toBe(externalLive.id);
    expect(overlayBoundsOnDisplay(overlay.bounds!, externalLive)).toBe(true);
    expect(rectInsideWorkArea(commandBar.bounds!, externalLive.workArea)).toBe(true);
    expect(rectInsideWorkArea(dockMeta.bounds!, externalLive.workArea)).toBe(true);
    expect(rectInsideWorkArea(panelMeta.bounds!, externalLive.workArea)).toBe(true);

    const state = stateAfterSelect;
    expect(state.operationDiagnostics.displayInfo ?? "").toMatch(
      new RegExp(`id${externalLive.id}`),
    );

    // Windows should no longer match primary display bounds when external is selected.
    expect(overlayBoundsOnDisplay(overlay.bounds!, primary!)).toBe(false);
  });

  test("capture target follows selected external display", async () => {
    requireMultiDisplay();
    const { command, dock, panel } = await getGlassWindows(app.browser);

    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
    await panel.locator('[data-testid="glass-display-select"]').selectOption(String(external!.id));

    await expect
      .poll(async () => (await readGlassState(command)).glassSettings.displayTarget)
      .toBe(external!.id);

    const captureTarget = await getE2eCaptureTarget(command);
    expect(captureTarget.id).toBe(external!.id);
    expect(captureTarget.label.length).toBeGreaterThan(0);

    await command.evaluate(() => {
      window.glass.send({ type: "capture-screen-only" });
    });

    await expect
      .poll(async () => (await readGlassState(command)).operationDiagnostics.captureStatus ?? "")
      .toMatch(/Capturing|Captured|failed/i);
  });
});

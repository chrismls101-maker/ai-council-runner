import { test, expect } from "@playwright/test";
import fs from "node:fs";
import {
  closeGlassApp,
  getGlassWindows,
  getElectronE2eSkipReason,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error(
      "Glass main bundle missing. Run `npm run build --prefix desktop-glass` before `npm run glass:e2e`.",
    );
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error(
      "Electron binary missing. Run `npm install --prefix desktop-glass` before `npm run glass:e2e`.",
    );
  }

  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test("Session Copilot is off on launch", async () => {
  const state = await readGlassState(commandPage);
  expect(state.copilot.mode).toBe("off");
  expect(state.copilot.active).toBe(false);
});

test("Copilot only becomes active inside a live session", async () => {
  // No session yet → setting a mode must not make it active.
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
  let state = await readGlassState(commandPage);
  expect(state.copilot.active).toBe(false);

  // Start a session → now active.
  await commandPage.evaluate(() => window.glass.send({ type: "session-start" }));
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
  state = await readGlassState(commandPage);
  expect(state.copilot.mode).toBe("passive");
  expect(state.copilot.active).toBe(true);

  // Clean up.
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await commandPage.evaluate(() => window.glass.send({ type: "session-end" }));
});

test('"I\'m done" generates a session debrief saved to the session', async () => {
  await commandPage.evaluate(() => window.glass.send({ type: "session-start" }));
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "passive" }));
  await commandPage.evaluate(() =>
    window.glass.send({ type: "add-transcript-chunk", text: "We must fix the broken deploy script now.", tags: ["microphone"] }),
  );
  await commandPage.evaluate(() => window.glass.send({ type: "submit-command", text: "I'm done" }));

  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.debrief?.sessionId ?? null, { timeout: 15_000 })
    .not.toBeNull();

  const state = await readGlassState(commandPage);
  expect(state.copilot.debrief?.markdown).toContain("Session Debrief");

  await commandPage.evaluate(() => window.glass.send({ type: "copilot-dismiss-debrief" }));
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await commandPage.evaluate(() => window.glass.send({ type: "session-end" }));
});

test("Stop Everything stops listening (copilot loop halts with it)", async () => {
  await commandPage.evaluate(() => window.glass.send({ type: "session-start" }));
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "coaching" }));
  await commandPage.evaluate(() => window.glass.send({ type: "stop-everything" }));

  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);

  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await commandPage.evaluate(() => window.glass.send({ type: "session-end" }));
});

test("max listening duration shows overlay card and Stop Listening halts streams", async () => {
  await commandPage.evaluate(() => window.glass.send({ type: "session-start" }));
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-config", patch: { maxListeningMin: 5 } }),
  );
  await commandPage.evaluate(() => window.glass.send({ type: "start-listening" }));
  await commandPage.evaluate(() =>
    window.glass.send({ type: "stt-listening-timer", elapsedMs: 5 * 60 * 1000 }),
  );

  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.listeningLimitReached, { timeout: 5_000 })
    .toBe(true);

  let state = await readGlassState(commandPage);
  expect(state.session?.status).toBe("active");
  expect(state.privacy.listening).toBe(true);

  await commandPage.evaluate(() => window.glass.send({ type: "copilot-listening-limit-stop" }));
  state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
  expect(state.copilot.listeningLimitReached).toBe(false);
  expect(state.session?.status).toBe("active");

  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await commandPage.evaluate(() => window.glass.send({ type: "session-end" }));
});

test("Continue 15 min extends listening limit and clears the card", async () => {
  await commandPage.evaluate(() => window.glass.send({ type: "session-start" }));
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-config", patch: { maxListeningMin: 5 } }),
  );
  await commandPage.evaluate(() => window.glass.send({ type: "start-listening" }));
  await commandPage.evaluate(() =>
    window.glass.send({ type: "stt-listening-timer", elapsedMs: 5 * 60 * 1000 }),
  );

  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.listeningLimitReached, { timeout: 5_000 })
    .toBe(true);

  await commandPage.evaluate(() => window.glass.send({ type: "copilot-listening-limit-continue" }));
  const state = await readGlassState(commandPage);
  expect(state.copilot.listeningLimitReached).toBe(false);
  expect(state.privacy.listening).toBe(true);
  expect(state.session?.status).toBe("active");

  await commandPage.evaluate(() => window.glass.send({ type: "stop-everything" }));
  await commandPage.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await commandPage.evaluate(() => window.glass.send({ type: "session-end" }));
});

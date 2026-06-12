/**
 * IIVO Glass — Wingman Mode E2E spec
 *
 * §20 contract coverage:
 *   - Wingman panel renders in copilot tab when mode is wingman
 *   - wingman-start creates a session and activates the mode
 *   - WingmanPanel inactive state: goal input + Start button visible
 *   - WingmanPanel active state: task, inspect button, add note, end session
 *   - wingman-add-note appends note to session
 *   - wingman-end transitions to report state
 *   - Report panel renders with session data
 *   - No audio starts during Wingman session
 *   - Work mode card is absent from the UI
 *   - Privacy indicator visible during active session
 */

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
import { resetE2eSetupState } from "./helpers/e2eSetupReset.ts";

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;
let panelPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Glass main bundle missing. Run `npm run build --prefix desktop-glass`.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing. Run `npm install --prefix desktop-glass`.");
  }

  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;
  panelPage = windows.panel;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

test.beforeEach(async () => {
  const { command, dock } = await getGlassWindows(app.browser);
  await resetE2eSetupState(command);
  // Terminate any running Wingman session and stop all audio
  await command.evaluate(() => window.glass.send({ type: "wingman-end" }));
  await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
  await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await command.evaluate(() => window.glass.send({ type: "session-end" }));
  // Open panel → copilot tab
  await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  await expect(panelPage.locator('[data-testid="glass-panel"]')).toBeVisible();
  await panelPage.locator('[data-testid="glass-panel-tab-copilot"]').click();
  await expect(panelPage.locator('[data-testid="glass-panel-copilot-tab"]')).toBeVisible();
});

// ─── Mode grid ────────────────────────────────────────────────────────────────

test("Wingman mode card is visible; Work mode card is absent", async () => {
  await expect(panelPage.locator('[data-testid="glass-mode-card-wingman"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="glass-mode-card-work"]')).toHaveCount(0);
});

// ─── Default state ────────────────────────────────────────────────────────────

test("WingmanState defaults to inactive with no session", async () => {
  const state = await readGlassState(commandPage);
  expect(state.wingman.active).toBe(false);
  expect(state.wingman.session).toBeNull();
  expect(state.wingman.inspecting).toBe(false);
  expect(state.wingman.report).toBeNull();
});

// ─── Activating Wingman via mode card ────────────────────────────────────────

test("clicking Wingman mode card activates diagnostic copilot mode", async () => {
  await panelPage.locator('[data-testid="glass-mode-card-wingman"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.mode)
    .toBe("diagnostic");
  const state = await readGlassState(commandPage);
  expect(state.copilot.active).toBe(true);
  expect(state.privacy.listening).toBe(false);
});

// ─── WingmanPanel inactive state ─────────────────────────────────────────────

test("WingmanPanel inactive state renders goal input and Start button", async () => {
  // Activate wingman mode first (so CopilotPanel renders WingmanPanel)
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await expect(panelPage.locator('[data-testid="wingman-panel-inactive"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-goal-input"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-start-btn"]')).toBeVisible();
  // Start button disabled until goal is entered
  await expect(panelPage.locator('[data-testid="wingman-start-btn"]')).toBeDisabled();
  // Privacy footer visible
  await expect(panelPage.locator('[data-testid="wingman-privacy-footer"]')).toBeVisible();
});

test("WingmanPanel Start button enables when goal is typed", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await expect(panelPage.locator('[data-testid="wingman-panel-inactive"]')).toBeVisible();
  await panelPage.locator('[data-testid="wingman-goal-input"]').fill("debug the failing auth test");
  await expect(panelPage.locator('[data-testid="wingman-start-btn"]')).toBeEnabled();
});

// ─── wingman-start ────────────────────────────────────────────────────────────

test("wingman-start creates a session with the given goal", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "fix the broken payment webhook" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);
  const state = await readGlassState(commandPage);
  expect(state.wingman.session).not.toBeNull();
  expect(state.wingman.session?.goal).toBe("fix the broken payment webhook");
  expect(state.wingman.session?.inspections).toHaveLength(0);
  expect(state.wingman.session?.notes).toHaveLength(0);
  expect(state.wingman.session?.loopWarning).toBe(false);
  // No audio should start
  expect(state.privacy.listening).toBe(false);
});

// ─── WingmanPanel active state ────────────────────────────────────────────────

test("WingmanPanel active state shows task, inspect button, note button, and end session", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "refactor the auth module" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);

  await expect(panelPage.locator('[data-testid="wingman-panel-active"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-active-header"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-task-goal"]')).toContainText("refactor the auth module");
  await expect(panelPage.locator('[data-testid="wingman-inspect-btn"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-add-note-btn"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-end-session-btn"]')).toBeVisible();
  // Privacy indicator
  await expect(panelPage.locator('[data-testid="wingman-privacy-note"]')).toBeVisible();
});

test("WingmanPanel active state shows no-inspection placeholder before first inspect", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "deploy the release" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);
  await expect(panelPage.locator('[data-testid="wingman-no-inspection"]')).toBeVisible();
});

// ─── wingman-add-note ─────────────────────────────────────────────────────────

test("wingman-add-note appends a note to the active session", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "audit the API rate limiting" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);

  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-add-note", content: "rate limit is 100 req/min per IP" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.session?.notes.length)
    .toBe(1);

  const state = await readGlassState(commandPage);
  expect(state.wingman.session?.notes[0].content).toBe("rate limit is 100 req/min per IP");
  expect(state.wingman.session?.notes[0].source).toBe("user");
});

test("adding a note via panel UI sends wingman-add-note command", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "investigate memory leak" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);

  // Click Add Note, type, press Enter
  await panelPage.locator('[data-testid="wingman-add-note-btn"]').click();
  await expect(panelPage.locator('[data-testid="wingman-note-input"]')).toBeVisible();
  await panelPage.locator('[data-testid="wingman-note-input"]').fill("heap dump shows 400MB retained");
  await panelPage.locator('[data-testid="wingman-note-save-btn"]').click();

  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.session?.notes.length)
    .toBeGreaterThanOrEqual(1);
});

// ─── wingman-end ──────────────────────────────────────────────────────────────

test("wingman-end sets session endedAt and marks session inactive", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "test end session flow" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);

  const startedAt = (await readGlassState(commandPage)).wingman.session?.startedAt ?? 0;

  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-end" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(false);

  const state = await readGlassState(commandPage);
  expect(state.wingman.session?.endedAt).toBeDefined();
  expect((state.wingman.session?.endedAt ?? 0)).toBeGreaterThanOrEqual(startedAt);
});

test("wingman-end triggers report generation (report becomes non-null)", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "verify the CI pipeline" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-end" }),
  );
  // Report is generated async via AI — wait up to 15s
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.report !== null, { timeout: 15_000 })
    .toBe(true);

  const state = await readGlassState(commandPage);
  expect(state.wingman.report?.goal).toBe("verify the CI pipeline");
  expect(typeof state.wingman.report?.summary).toBe("string");
  expect(Array.isArray(state.wingman.report?.notVerified)).toBe(true);
  expect((state.wingman.report?.notVerified?.length ?? 0)).toBeGreaterThanOrEqual(1);
});

// ─── No audio during Wingman ──────────────────────────────────────────────────

test("Wingman session never starts audio capture", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "watch Cursor fix the test" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);

  const state = await readGlassState(commandPage);
  expect(state.privacy.listening).toBe(false);
  expect(state.privacy.capturing).toBe(false);
});

// ─── Report panel ─────────────────────────────────────────────────────────────

test("WingmanPanel shows report state after session ends", async () => {
  await commandPage.evaluate(() =>
    window.glass.send({ type: "copilot-set-mode", mode: "diagnostic" }),
  );
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-start", goal: "check build output" }),
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-end" }),
  );
  // Wait for report to appear
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.report !== null, { timeout: 15_000 })
    .toBe(true);

  await expect(panelPage.locator('[data-testid="wingman-report"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-report-title"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-report-goal"]')).toContainText("check build output");
  await expect(panelPage.locator('[data-testid="wingman-report-not-verified"]')).toBeVisible();
  await expect(panelPage.locator('[data-testid="wingman-new-session-btn"]')).toBeVisible();
});

// ─── wingman-start ignored when no session ────────────────────────────────────

test("wingman-end is a no-op when no session is active", async () => {
  // Ensure no session
  const before = await readGlassState(commandPage);
  expect(before.wingman.active).toBe(false);

  // Should not throw
  await commandPage.evaluate(() =>
    window.glass.send({ type: "wingman-end" }),
  );

  const after = await readGlassState(commandPage);
  expect(after.wingman.active).toBe(false);
  expect(after.wingman.session).toBeNull();
});

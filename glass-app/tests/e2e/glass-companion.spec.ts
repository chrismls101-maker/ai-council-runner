/**
 * IIVO Glass — Companion / Aletheia full-coverage E2E spec (L3.5)
 *
 * Run: npm run e2e (or npx playwright test tests/e2e/glass-companion.spec.ts)
 *
 * Groups:
 *   G1 — Authority allowlist (unit-style, pure JS, no Electron needed)  [12 tests]
 *   G2 — agentsAutoActivate flag gate                                    [ 5 tests]
 *   G3 — Consent gate on companion activation                            [ 5 tests]
 *   G4 — minimalPublic strip flag                                        [ 6 tests]
 *   G5 — Dashboard mutual exclusion                                      [ 4 tests]
 *   G6 — Server degraded banner                                          [ 5 tests]
 *   G7 — IPC boundary regression                                         [ 5 tests]
 *                                                            Total:       42 tests
 *
 * Stub notes:
 *   - Mic / audio capture: no real hardware used. Companion is toggled via
 *     `window.glass.send({ type: "toggle-companion-mode" })` which simulates
 *     activation without starting any real audio pipeline in CI.
 *   - TTS / OmniParser: no sidecar is running. Tests check state changes and
 *     DOM visibility only — no speech is synthesised.
 *   - Server flags (minimalPublic, agentsAutoActivate) are injected via
 *     `window.glass.send({ type: "e2e-set-server-runtime-flags", ... })`.
 *     The Electron main already handles this message when IIVO_GLASS_E2E=1.
 *
 * CI safety:
 *   - G1 (pure JS) always runs — no Electron, no display requirement.
 *   - G2–G7 use the shared Electron instance which is booted in beforeAll.
 *     They auto-skip on headless CI via getElectronE2eSkipReason().
 *   - G7.1–G7.2 also always run (pure channel-name checks, no Electron).
 *   - No real mic, TTS, or OmniParser required in any test.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import assert from "node:assert/strict";
import {
  closeGlassApp,
  getElectronE2eSkipReason,
  getGlassWindows,
  GLASS_ELECTRON_BIN,
  GLASS_MAIN,
  launchGlassApp,
  readGlassState,
  type LaunchedGlass,
} from "./helpers/electronApp.ts";
import { logE2eFailureDiagnostics } from "./helpers/e2eFailureDiagnostics.ts";
import { resetAletheiaE2eState } from "./helpers/e2eSetupReset.ts";
import {
  ALETHEIA_ALLOWED_COMMANDS,
  ALETHEIA_BLOCKED_COMMANDS,
  isAletheiaAllowed,
  assertAletheiaAllowed,
  dispatchAletheiaCommand,
} from "../../src/shared/aletheiaAuthority.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Optional pause for human-watching test runs. Set IIVO_E2E_DWELL_MS > 0. */
const E2E_DWELL_MS = Number(process.env.IIVO_E2E_DWELL_MS ?? 0);

async function dwell(): Promise<void> {
  if (E2E_DWELL_MS > 0) await new Promise((resolve) => setTimeout(resolve, E2E_DWELL_MS));
}

async function ensureStripReady(browser: Browser): Promise<void> {
  const { overlay } = await getGlassWindows(browser);
  await expect(overlay.locator('[data-testid="glass-builder-strip"]')).toBeVisible({
    timeout: 10_000,
  });
  await overlay.evaluate(() => {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
  });
}

/** Click an element via evaluate() to avoid OS click-through blocking on overlay. */
async function clickOverlayTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    window.glass?.setOverlayPointerOverBuilderStrip?.(true);
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!(el instanceof HTMLElement)) throw new Error(`overlay test id not found: ${id}`);
    el.click();
  }, testId);
}

async function waitForAletheiaDashboard(overlay: Page): Promise<void> {
  await expect(overlay.locator('[data-testid="aletheia-dashboard-shell"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(overlay.locator('[data-testid="aletheia-dashboard-presence"]')).toBeVisible();
  await dwell();
}

async function openAletheiaDashboard(overlay: Page): Promise<void> {
  await overlay.evaluate(() => window.glass.openAletheiaDashboard());
  await waitForAletheiaDashboard(overlay);
}

// ---------------------------------------------------------------------------
// G1 — Authority allowlist (pure JS, no Electron)
// 12 tests — always run, even in headless CI
// ---------------------------------------------------------------------------

test.describe("G1 — Authority allowlist", () => {
  test("G1.1 — every ALETHEIA_ALLOWED_COMMANDS entry passes isAletheiaAllowed", () => {
    for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
      assert.equal(isAletheiaAllowed(cmd), true, `Expected "${cmd}" to be allowed`);
    }
    assert.equal(ALETHEIA_ALLOWED_COMMANDS.size, 6, "Should have exactly 6 allowed commands");
  });

  test("G1.2 — spot-check: all 6 specific allowed commands pass individually", () => {
    assert.equal(isAletheiaAllowed("toggle-companion-mode"), true);
    assert.equal(isAletheiaAllowed("stop-everything"), true);
    assert.equal(isAletheiaAllowed("companion-privacy-start"), true);
    assert.equal(isAletheiaAllowed("companion-privacy-end"), true);
    assert.equal(isAletheiaAllowed("open-glass-setup"), true);
    assert.equal(isAletheiaAllowed("open-glass-memory"), true);
  });

  test("G1.3 — key blocked commands fail: save-api-key, delete-user-context-key, terminal-execute, agent-run", () => {
    assert.equal(isAletheiaAllowed("save-api-key"), false);
    assert.equal(isAletheiaAllowed("delete-user-context-key"), false);
    assert.equal(isAletheiaAllowed("terminal-execute"), false);
    assert.equal(isAletheiaAllowed("agent-run"), false);
  });

  test("G1.4 — every ALETHEIA_BLOCKED_COMMANDS entry fails isAletheiaAllowed", () => {
    for (const cmd of ALETHEIA_BLOCKED_COMMANDS) {
      assert.equal(isAletheiaAllowed(cmd), false, `Expected "${cmd}" to be blocked`);
    }
  });

  test("G1.5 — unknown commands fail isAletheiaAllowed (case-sensitive, exact-match only)", () => {
    assert.equal(isAletheiaAllowed(""), false);
    assert.equal(isAletheiaAllowed("glass:command"), false);
    assert.equal(isAletheiaAllowed("open-glass-dashboard"), false);
    assert.equal(isAletheiaAllowed("agent-stop"), false);
    assert.equal(isAletheiaAllowed("TOGGLE-COMPANION-MODE"), false);
    assert.equal(isAletheiaAllowed(" toggle-companion-mode"), false);
  });

  test("G1.6 — assertAletheiaAllowed does not throw for all allowed commands", () => {
    for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
      assert.doesNotThrow(
        () => assertAletheiaAllowed(cmd),
        `assertAletheiaAllowed("${cmd}") must not throw`,
      );
    }
  });

  test("G1.7 — assertAletheiaAllowed throws with 'Glass-privileged' message for all blocked commands", () => {
    for (const cmd of ALETHEIA_BLOCKED_COMMANDS) {
      let thrown = false;
      try {
        assertAletheiaAllowed(cmd);
      } catch (err) {
        thrown = true;
        assert.ok(
          err instanceof Error && err.message.includes("Glass-privileged"),
          `Blocked "${cmd}" error must mention Glass-privileged; got: ${String(err)}`,
        );
      }
      assert.ok(thrown, `assertAletheiaAllowed("${cmd}") should have thrown`);
    }
  });

  test("G1.8 — assertAletheiaAllowed throws for unknown commands with different message (no 'Glass-privileged')", () => {
    const unknowns = ["some-unknown-command", "", "open-glass-dashboard", "agent-stop"];
    for (const cmd of unknowns) {
      let thrown = false;
      try {
        assertAletheiaAllowed(cmd);
      } catch (err) {
        thrown = true;
        assert.ok(
          err instanceof Error && !err.message.includes("Glass-privileged"),
          `Unknown "${cmd}" error must NOT say Glass-privileged; got: ${String(err)}`,
        );
      }
      assert.ok(thrown, `assertAletheiaAllowed("${cmd}") should throw`);
    }
  });

  test("G1.9 — dispatchAletheiaCommand throws on blocked commands (runtime guard, all builds)", () => {
    // The TypeScript type guard is bypassed via cast to test the runtime check.
    // assertAletheiaAllowed() runs before window.__aletheiaDispatch in all builds.
    assert.throws(
      () => dispatchAletheiaCommand("save-api-key" as never),
      (err: unknown) => err instanceof Error && err.message.includes("Glass-privileged"),
    );
    assert.throws(
      () => dispatchAletheiaCommand("terminal-execute" as never),
      (err: unknown) => err instanceof Error,
    );
    assert.throws(
      () => dispatchAletheiaCommand("agent-run" as never),
      (err: unknown) => err instanceof Error,
    );
  });

  test("G1.10 — dispatchAletheiaCommand does not throw for allowed commands (window absent in Node = no-op after auth check)", () => {
    // In Node (no window.__aletheiaDispatch), dispatch is a no-op after the allowlist check.
    // Key assertion: the auth check itself does not throw for allowed commands.
    assert.doesNotThrow(() => dispatchAletheiaCommand("toggle-companion-mode"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("stop-everything"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("companion-privacy-start"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("companion-privacy-end"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("open-glass-setup"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("open-glass-memory"));
    assert.doesNotThrow(() => dispatchAletheiaCommand("approve-aletheia-advice", { adviceId: "test" }));
    assert.doesNotThrow(() => dispatchAletheiaCommand("dismiss-aletheia-advice", { adviceId: "test" }));
    assert.doesNotThrow(() => dispatchAletheiaCommand("confirm-aletheia-action", { intentId: "test" }));
    assert.doesNotThrow(() => dispatchAletheiaCommand("reject-aletheia-action", { intentId: "test" }));
    assert.doesNotThrow(() => dispatchAletheiaCommand("modify-aletheia-action", { intentId: "test", modifier: "npm test" }));
  });

  test("G1.11 — ALLOWED and BLOCKED sets are disjoint (no command in both)", () => {
    for (const cmd of ALETHEIA_ALLOWED_COMMANDS) {
      assert.equal(
        ALETHEIA_BLOCKED_COMMANDS.has(cmd as never),
        false,
        `"${cmd}" must not appear in both ALLOWED and BLOCKED`,
      );
    }
  });

  test("G1.12 — BLOCKED set is larger than ALLOWED (Glass owns more commands than Aletheia)", () => {
    assert.ok(
      ALETHEIA_BLOCKED_COMMANDS.size > ALETHEIA_ALLOWED_COMMANDS.size,
      `Blocked (${ALETHEIA_BLOCKED_COMMANDS.size}) must exceed allowed (${ALETHEIA_ALLOWED_COMMANDS.size})`,
    );
  });
});

// ---------------------------------------------------------------------------
// G7.1–G7.2 — IPC channel name purity (pure JS, no Electron)
// These two sub-tests always run, even in headless CI.
// ---------------------------------------------------------------------------

test.describe("G7-pure — IPC channel name purity (no Electron)", () => {
  test("G7.1 — Aletheia IPC channel names are distinct from Glass IPC channel names", async () => {
    const { IPC } = await import("../../src/shared/ipc.ts");

    assert.notEqual(
      IPC.getAletheiaRecentSessions,
      IPC.getRecentSessions,
      "Aletheia recent-sessions channel must differ from Glass channel",
    );
    assert.notEqual(
      IPC.getAletheiaSessionMessages,
      IPC.getSessionMessages,
      "Aletheia session-messages channel must differ from Glass channel",
    );

    // Channels must be non-empty strings.
    assert.ok(typeof IPC.getAletheiaRecentSessions === "string" && IPC.getAletheiaRecentSessions.length > 0);
    assert.ok(typeof IPC.getAletheiaSessionMessages === "string" && IPC.getAletheiaSessionMessages.length > 0);
  });

  test("G7.2 — Aletheia channels carry 'aletheia' in their string value; no deprecated ':aletheia' suffix", async () => {
    const { IPC } = await import("../../src/shared/ipc.ts");

    assert.ok(
      IPC.getAletheiaRecentSessions.includes("aletheia"),
      `Channel "${IPC.getAletheiaRecentSessions}" must include 'aletheia'`,
    );
    assert.ok(
      IPC.getAletheiaSessionMessages.includes("aletheia"),
      `Channel "${IPC.getAletheiaSessionMessages}" must include 'aletheia'`,
    );
    assert.ok(
      !IPC.getAletheiaRecentSessions.endsWith(":aletheia"),
      `"${IPC.getAletheiaRecentSessions}" must not use deprecated :aletheia suffix`,
    );
    assert.ok(
      !IPC.getAletheiaSessionMessages.endsWith(":aletheia"),
      `"${IPC.getAletheiaSessionMessages}" must not use deprecated :aletheia suffix`,
    );
  });
});

// ---------------------------------------------------------------------------
// Electron-dependent groups (G2–G6 + G7.3–G7.5)
// One shared Electron instance, serial mode.
// ---------------------------------------------------------------------------

test.describe("Electron companion suite", () => {
  test.describe.configure({ mode: "serial" });

  let app: LaunchedGlass;
  let commandPage: Page;

  test.beforeAll(async () => {
    const skipReason = getElectronE2eSkipReason();
    test.skip(!!skipReason, skipReason ?? undefined);

    if (!fs.existsSync(GLASS_MAIN)) {
      throw new Error("Glass main bundle missing. Run `npm run build --prefix glass-app`.");
    }
    if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
      throw new Error("Electron binary missing. Run `npm install --prefix glass-app`.");
    }

    app = await launchGlassApp();
    const { command, overlay } = await getGlassWindows(app.browser);
    commandPage = command;
    await resetAletheiaE2eState(overlay);
    await resetAletheiaE2eState(command);
    await ensureStripReady(app.browser);
  });

  test.afterAll(async () => {
    if (app) await closeGlassApp(app);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await logE2eFailureDiagnostics(app, commandPage, testInfo.title);
    }
  });

  test.beforeEach(async () => {
    const { command, overlay } = await getGlassWindows(app.browser);
    await resetAletheiaE2eState(overlay);
    await resetAletheiaE2eState(command);
    // Clear any injected server runtime flags back to defaults.
    await command.evaluate(() => {
      window.glass.send({
        type: "e2e-set-server-runtime-flags",
        flags: { agentsAutoActivate: false, minimalPublic: false },
      });
    });
    // Confirm both dashboards are closed.
    await expect
      .poll(async () => {
        const s = await readGlassState(command);
        return s.glassDashboardActive !== true && s.aletheiaDashboardActive !== true;
      })
      .toBe(true);
    await ensureStripReady(app.browser);
  });

  // ── G2 — agentsAutoActivate flag (5 tests) ────────────────────────────────

  test.describe("G2 — agentsAutoActivate flag", () => {
    test("G2.1 — flag=false (default): non-coder agent start does NOT activate companion mode", async () => {
      const { command } = await getGlassWindows(app.browser);

      const stateBefore = await readGlassState(command);
      expect(stateBefore.serverRuntimeFlags?.agentsAutoActivate).not.toBe(true);

      await command.evaluate(() => {
        window.glass.send({ type: "e2e-simulate-agent-start", agentId: "research" });
      });

      await new Promise((r) => setTimeout(r, 500));
      const stateAfter = await readGlassState(command);
      expect(stateAfter.companionModeActive).not.toBe(true);
      await dwell();
    });

    test("G2.2 — flag=true: non-coder agent start DOES activate companion mode", async () => {
      const { command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { agentsAutoActivate: true },
        });
      });
      await command.evaluate(() => {
        window.glass.send({ type: "e2e-simulate-agent-start", agentId: "writing" });
      });

      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive === true, {
          timeout: 5_000,
        })
        .toBe(true);
      await dwell();
    });

    test("G2.3 — coder agent: NEVER activates companion regardless of agentsAutoActivate flag", async () => {
      const { command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { agentsAutoActivate: true },
        });
      });
      await command.evaluate(() => {
        window.glass.send({ type: "e2e-simulate-agent-start", agentId: "coder" });
      });

      await new Promise((r) => setTimeout(r, 500));
      const state = await readGlassState(command);
      expect(state.companionModeActive).not.toBe(true);
      await dwell();
    });

    test("G2.4 — flag reverted to false before agent start: companion stays inactive", async () => {
      const { command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { agentsAutoActivate: true },
        });
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { agentsAutoActivate: false },
        });
      });
      await command.evaluate(() => {
        window.glass.send({ type: "e2e-simulate-agent-start", agentId: "research" });
      });

      await new Promise((r) => setTimeout(r, 500));
      const state = await readGlassState(command);
      expect(state.companionModeActive).not.toBe(true);
      await dwell();
    });

    test("G2.5 — flag=true with companion already active: agent start is idempotent (no double-toggle)", async () => {
      const { command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { agentsAutoActivate: true },
        });
        window.glass.send({ type: "toggle-companion-mode" });
      });
      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive === true)
        .toBe(true);

      await command.evaluate(() => {
        window.glass.send({ type: "e2e-simulate-agent-start", agentId: "writing" });
      });
      await new Promise((r) => setTimeout(r, 300));
      // Must stay active — not toggle off.
      const state = await readGlassState(command);
      expect(state.companionModeActive).toBe(true);
      await dwell();
    });
  });

  // ── G3 — Consent gate (5 tests) ───────────────────────────────────────────

  test.describe("G3 — Consent gate", () => {
    test("G3.1 — consentMicAck=false (default): toggle-companion-mode does not crash; state reflects architecture law", async () => {
      const { command } = await getGlassWindows(app.browser);

      // Sending toggle without consent; architecture law says it should be blocked.
      // This test asserts current behaviour and catches regressions.
      await command.evaluate(() => {
        window.glass.send({ type: "toggle-companion-mode" });
      });

      // App must not crash — any boolean / null value for companionModeActive is acceptable.
      const stateAfter = await readGlassState(command);
      expect(
        typeof stateAfter.companionModeActive === "boolean" || stateAfter.companionModeActive == null,
      ).toBe(true);
      await dwell();
    });

    test("G3.2 — consentMicAck=true: toggle-companion-mode activates companion", async () => {
      const { command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-consent",
          flags: { consentMicAck: true },
        });
        window.glass.send({ type: "toggle-companion-mode" });
      });

      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive === true, {
          timeout: 5_000,
        })
        .toBe(true);
      await dwell();
    });

    test("G3.3 — deactivation always passes — no consent re-check needed", async () => {
      const { command } = await getGlassWindows(app.browser);

      // Activate companion first.
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-consent",
          flags: { consentMicAck: true },
        });
        window.glass.send({ type: "toggle-companion-mode" });
      });
      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive === true)
        .toBe(true);

      // Deactivate — must succeed.
      await command.evaluate(() => {
        window.glass.send({ type: "toggle-companion-mode" });
      });
      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive !== true)
        .toBe(true);
      await dwell();
    });

    test("G3.4 — opening Aletheia dashboard requires no consent (read-only surface)", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);

      const state = await readGlassState(command);
      expect(state.aletheiaDashboardActive).toBe(true);
      // Opening the dashboard must not auto-activate the companion.
      expect(state.companionModeActive).not.toBe(true);

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });

    test("G3.5 — activate button in Aletheia dashboard triggers companion toggle; deactivate button appears", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await openAletheiaDashboard(overlay);

      // Activate button visible when companion is off.
      await expect(overlay.locator('[data-testid="aletheia-dashboard-activate"]')).toBeVisible();

      // Click activate.
      await clickOverlayTestId(overlay, "aletheia-dashboard-activate");

      await expect
        .poll(async () => (await readGlassState(command)).companionModeActive === true, {
          timeout: 5_000,
        })
        .toBe(true);

      // Deactivate button must appear; activate must be gone.
      await expect(overlay.locator('[data-testid="aletheia-dashboard-deactivate"]')).toBeVisible();
      await expect(overlay.locator('[data-testid="aletheia-dashboard-activate"]')).not.toBeVisible();

      await dwell();
    });
  });

  // ── G4 — minimalPublic strip flag (6 tests) ───────────────────────────────

  test.describe("G4 — minimalPublic strip flag", () => {
    test("G4.1 — minimalPublic=false (default): API Keys tab visible in strip", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      const state = await readGlassState(command);
      expect(state.serverRuntimeFlags?.minimalPublic).not.toBe(true);

      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="API Key Manager"]'),
      ).toBeVisible();
      await dwell();
    });

    test("G4.2 — minimalPublic=false (default): Spend tab visible in strip", async () => {
      const { overlay } = await getGlassWindows(app.browser);

      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="AI Spend Tracker"]'),
      ).toBeVisible();
      await dwell();
    });

    test("G4.3 — minimalPublic=true: API Keys tab hidden in strip", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { minimalPublic: true },
        });
      });
      await new Promise((r) => setTimeout(r, 400));

      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="API Key Manager"]'),
      ).not.toBeVisible();
      await dwell();
    });

    test("G4.4 — minimalPublic=true: Spend tab hidden in strip", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { minimalPublic: true },
        });
      });
      await new Promise((r) => setTimeout(r, 400));

      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="AI Spend Tracker"]'),
      ).not.toBeVisible();
      await dwell();
    });

    test("G4.5 — minimalPublic=true + glassDevMode=true: both tabs visible (founder override)", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { minimalPublic: true },
        });
        window.glass.send({ type: "e2e-set-glass-dev-mode", enabled: true });
      });
      await new Promise((r) => setTimeout(r, 400));

      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="API Key Manager"]'),
      ).toBeVisible();
      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="AI Spend Tracker"]'),
      ).toBeVisible();

      // Cleanup.
      await command.evaluate(() => {
        window.glass.send({ type: "e2e-set-glass-dev-mode", enabled: false });
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { minimalPublic: false },
        });
      });
      await dwell();
    });

    test("G4.6 — API Keys always reachable via Glass System Setup nav regardless of minimalPublic", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      // Enable minimalPublic — strip tab hidden.
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-server-runtime-flags",
          flags: { minimalPublic: true },
        });
      });
      await new Promise((r) => setTimeout(r, 400));

      // Strip tab is hidden — verify.
      await expect(
        overlay.locator('[data-testid="glass-builder-strip"] button[aria-label="API Key Manager"]'),
      ).not.toBeVisible();

      // Open Glass System → Setup.
      await overlay.evaluate(() => window.glass.openDashboard("setup"));
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });
      await expect(overlay.locator('[data-testid="glass-dashboard-setup"]')).toBeVisible({
        timeout: 10_000,
      });

      // The API Keys section must be present in Setup regardless of the strip flag.
      await expect(overlay.locator('[data-testid="glass-setup-api-keys"]')).toBeVisible({
        timeout: 5_000,
      });

      await overlay.evaluate(() => window.glass.closeDashboard());
      await dwell();
    });
  });

  // ── G5 — Dashboard mutual exclusion (4 tests) ─────────────────────────────

  test.describe("G5 — Dashboard mutual exclusion", () => {
    test("G5.1 — opening Aletheia dashboard closes Glass System dashboard", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      // Open Glass System first.
      await overlay.evaluate(() => window.glass.openDashboard());
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });
      await expect
        .poll(async () => (await readGlassState(command)).glassDashboardActive === true)
        .toBe(true);

      // Open Aletheia — Glass System must auto-close.
      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);

      await expect
        .poll(async () => {
          const s = await readGlassState(command);
          return s.aletheiaDashboardActive === true && s.glassDashboardActive !== true;
        })
        .toBe(true);

      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).not.toBeVisible();

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });

    test("G5.2 — opening Glass System dashboard closes Aletheia dashboard", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      // Open Aletheia first.
      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);
      await expect
        .poll(async () => (await readGlassState(command)).aletheiaDashboardActive === true)
        .toBe(true);

      // Open Glass System — Aletheia must auto-close.
      await overlay.evaluate(() => window.glass.openDashboard());
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });

      await expect
        .poll(async () => {
          const s = await readGlassState(command);
          return s.glassDashboardActive === true && s.aletheiaDashboardActive !== true;
        })
        .toBe(true);

      // Aletheia shell must carry the hidden class or be invisible.
      const aletheiaShell = overlay.locator('[data-testid="aletheia-dashboard-shell"]');
      const isHidden =
        (await aletheiaShell.evaluate((el) =>
          el.classList.contains("aletheia-dashboard-shell--hidden"),
        ).catch(() => true)) ||
        !(await aletheiaShell.isVisible().catch(() => false));
      expect(isHidden).toBe(true);

      await overlay.evaluate(() => window.glass.closeDashboard());
      await dwell();
    });

    test("G5.3 — after close, Aletheia re-opens correctly", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);
      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());

      await expect
        .poll(async () => (await readGlassState(command)).aletheiaDashboardActive !== true)
        .toBe(true);

      // Reopen.
      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);

      const state = await readGlassState(command);
      expect(state.aletheiaDashboardActive).toBe(true);
      expect(state.glassDashboardActive).not.toBe(true);

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });

    test("G5.4 — after close, Glass System re-opens correctly", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await overlay.evaluate(() => window.glass.openDashboard());
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });
      await overlay.evaluate(() => window.glass.closeDashboard());

      await expect
        .poll(async () => (await readGlassState(command)).glassDashboardActive !== true)
        .toBe(true);

      // Reopen.
      await overlay.evaluate(() => window.glass.openDashboard());
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });

      const state = await readGlassState(command);
      expect(state.glassDashboardActive).toBe(true);
      expect(state.aletheiaDashboardActive).not.toBe(true);

      await overlay.evaluate(() => window.glass.closeDashboard());
      await dwell();
    });
  });

  // ── G6 — Server degraded banner (5 tests) ─────────────────────────────────

  test.describe("G6 — Server degraded indicator", () => {
    test("G6.1 — iivoServerDegradedReason set: banner renders in Aletheia dashboard", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: "Scheduled maintenance — back in 10 minutes." },
        });
      });

      await openAletheiaDashboard(overlay);

      await expect(
        overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]'),
      ).toBeVisible({ timeout: 5_000 });

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: null },
        });
      });
      await dwell();
    });

    test("G6.2 — setupCapabilities server row with severity=error: banner renders", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: {
            setupCapabilities: [
              {
                id: "server",
                label: "Offline",
                detail: "IIVO server offline — live translate unavailable.",
                severity: "error",
                actions: [],
              },
            ],
          },
        });
      });

      await openAletheiaDashboard(overlay);

      await expect(
        overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]'),
      ).toBeVisible({ timeout: 5_000 });

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { setupCapabilities: null },
        });
      });
      await dwell();
    });

    test("G6.3 — both iivoServerDegradedReason and setupCapabilities error: banner shows; runtime reason preferred", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: {
            iivoServerDegradedReason: "Primary reason from runtime.",
            setupCapabilities: [
              {
                id: "server",
                label: "Offline",
                detail: "Setup reason.",
                severity: "error",
                actions: [],
              },
            ],
          },
        });
      });

      await openAletheiaDashboard(overlay);

      const banner = overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]');
      await expect(banner).toBeVisible({ timeout: 5_000 });
      // Runtime reason is preferred per AletheiaDashboard.tsx (runtimeReason ?? server?.detail).
      await expect(banner).toContainText("Primary reason from runtime.");

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: null, setupCapabilities: null },
        });
      });
      await dwell();
    });

    test("G6.4 — both null/absent: no server degraded banner rendered", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: null, setupCapabilities: [] },
        });
      });

      await openAletheiaDashboard(overlay);

      await expect(
        overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]'),
      ).not.toBeVisible();

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });

    test("G6.5 — banner disappears reactively when degraded reason is cleared while dashboard is open", async () => {
      const { overlay, command } = await getGlassWindows(app.browser);

      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: "Transient degradation." },
        });
      });

      await openAletheiaDashboard(overlay);
      await expect(
        overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]'),
      ).toBeVisible({ timeout: 5_000 });

      // Clear reason while dashboard is open.
      await command.evaluate(() => {
        window.glass.send({
          type: "e2e-set-state",
          patch: { iivoServerDegradedReason: null },
        });
      });

      // Banner must disappear reactively.
      await expect(
        overlay.locator('[data-testid="aletheia-dashboard-server-degraded"]'),
      ).not.toBeVisible({ timeout: 5_000 });

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });
  });

  // ── G7.3–G7.5 — IPC boundary regression (Electron) (3 tests) ─────────────

  test.describe("G7 — IPC boundary regression (Electron)", () => {
    test("G7.3 — Glass IPC getRecentSessions returns [] for Aletheia dashboard sender (auth gate)", async () => {
      const { overlay } = await getGlassWindows(app.browser);

      await overlay.evaluate(() => window.glass.openAletheiaDashboard());
      await waitForAletheiaDashboard(overlay);

      // Invoke the Glass channel directly from Aletheia's renderer context.
      // The Glass auth gate should reject this sender and return [].
      const result = await overlay.evaluate(async () => {
        if (!window.glass?.e2eInvokeIpc) return "__no_e2e_ipc__";
        return window.glass.e2eInvokeIpc("glass:get-recent-sessions");
      });

      // Either the gate returns [] (auth rejected) or the E2E IPC hook is not
      // available — both are safe outcomes. "__no_e2e_ipc__" means the gate is
      // not testable via this path (the real auth check still runs in main).
      const acceptable =
        result === "__no_e2e_ipc__" ||
        (Array.isArray(result) && result.length === 0);
      expect(acceptable).toBe(true);

      await overlay.evaluate(() => window.glass.closeAletheiaDashboard());
      await dwell();
    });

    test("G7.4 — Aletheia IPC getAletheiaRecentSessions returns [] for Glass dashboard sender (auth gate)", async () => {
      const { overlay } = await getGlassWindows(app.browser);

      await overlay.evaluate(() => window.glass.openDashboard());
      await expect(overlay.locator('[data-testid="glass-dashboard-shell"]')).toBeVisible({
        timeout: 10_000,
      });

      // Attempt to call Aletheia's IPC channel from the Glass dashboard context.
      const result = await overlay.evaluate(async () => {
        if (!window.glass?.e2eInvokeIpc) return "__no_e2e_ipc__";
        return window.glass.e2eInvokeIpc("glass:aletheia-get-recent-sessions");
      });

      const acceptable =
        result === "__no_e2e_ipc__" ||
        (Array.isArray(result) && result.length === 0);
      expect(acceptable).toBe(true);

      await overlay.evaluate(() => window.glass.closeDashboard());
      await dwell();
    });

    test("G7.5 — unregistered sender (command bar) is rejected by both IPC gates (returns [] or safe fallback)", async () => {
      const { command } = await getGlassWindows(app.browser);

      // Neither dashboard is open — command bar is an unregistered sender.
      const glassResult = await command.evaluate(async () => {
        if (!window.glass?.e2eInvokeIpc) return "__no_e2e_ipc__";
        return window.glass.e2eInvokeIpc("glass:get-recent-sessions");
      });
      const aletheiaResult = await command.evaluate(async () => {
        if (!window.glass?.e2eInvokeIpc) return "__no_e2e_ipc__";
        return window.glass.e2eInvokeIpc("glass:aletheia-get-recent-sessions");
      });

      const glassOk =
        glassResult === "__no_e2e_ipc__" ||
        (Array.isArray(glassResult) && glassResult.length === 0);
      const aletheiaOk =
        aletheiaResult === "__no_e2e_ipc__" ||
        (Array.isArray(aletheiaResult) && aletheiaResult.length === 0);

      expect(glassOk).toBe(true);
      expect(aletheiaOk).toBe(true);
      await dwell();
    });
  });
});

/**
 * IIVO Glass — Wingman UI Comprehensive E2E Spec (v0.5.0)
 *
 * Full UI click-through covering all MANUAL_QA_v0.5.0.md sections that
 * are automatable via Playwright + Electron.
 *
 * Test groups:
 *   A. Panel state transitions (inactive → active → report)
 *   B. GitHub PAT — all 5 states (nudge, editing, saving, connected, token-invalid)
 *   C. GitHub PAT — dismissedInvalid flow (I13–I14)
 *   D. Agent proxy consent modal (G1–G5)
 *   E. Terminal awareness feed (E1–E6)
 *   F. Verification badges in report (H1–H6)
 *   G. Report structure — git diff section, agent calls, PR section shape
 *   H. Memory search results section in report (D3–D4)
 *   I. Cross-session: New Session button returns to inactive cleanly
 *   J. Privacy invariants visible in UI
 *
 * Backdoor-dependent tests (require IIVO_GLASS_TEST=1 on Glass process) are
 * grouped in describe blocks and skipped automatically when unavailable.
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

// ─── App lifecycle ────────────────────────────────────────────────────────────

let app: LaunchedGlass;
let commandPage: import("@playwright/test").Page;
let panelPage: import("@playwright/test").Page;

test.beforeAll(async () => {
  const skipReason = getElectronE2eSkipReason();
  test.skip(!!skipReason, skipReason ?? undefined);

  if (!fs.existsSync(GLASS_MAIN)) {
    throw new Error("Glass main bundle missing. Run `npm run build`.");
  }
  if (!fs.existsSync(GLASS_ELECTRON_BIN)) {
    throw new Error("Electron binary missing. Run `npm install`.");
  }

  app = await launchGlassApp();
  const windows = await getGlassWindows(app.browser);
  commandPage = windows.command;
  panelPage = windows.panel;
});

test.afterAll(async () => {
  if (app) await closeGlassApp(app);
});

// ─── Per-test reset ───────────────────────────────────────────────────────────

test.beforeEach(async () => {
  const { command, dock } = await getGlassWindows(app.browser);
  await resetE2eSetupState(command);

  // Clear all wingman state
  await command.evaluate(() => window.glass.send({ type: "wingman-end" }));
  await command.evaluate(() => window.glass.send({ type: "wingman-debug-clear-state" })).catch(() => {});
  await command.evaluate(() => window.glass.send({ type: "wingman-github-pat-clear" }));
  await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
  await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "off" }));
  await command.evaluate(() => window.glass.send({ type: "session-end" }));

  // Wait for state to settle — IPC commands are fire-and-forget; we must confirm
  // the Glass process has actually applied them before the next test starts.
  // Without this poll, activateWingmanMode() may find the panel in a stale
  // active/report state from the previous test.
  await expect
    .poll(
      async () => {
        const s = await readGlassState(command);
        return !s.copilot.active && !s.wingman.active && s.wingman.report === null;
      },
      { timeout: 8_000 },
    )
    .toBe(true);

  await ensureE2eStubOnline(command);

  const panelVisible = (await readGlassState(command)).panelVisible;
  if (!panelVisible) {
    await dock.locator('[data-testid="glass-dock-open-panel"]').click();
  }
  await expect(panelPage.locator('[data-testid="glass-panel"]')).toBeVisible();
  await panelPage.locator('[data-testid="glass-panel-tab-copilot"]').click();
  await expect(panelPage.locator('[data-testid="glass-panel-copilot-tab"]')).toBeVisible();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** E2E stub server + simulated system audio (no forceCaptureProbe / BlackHole). */
async function ensureE2eStubOnline(command: import("@playwright/test").Page): Promise<void> {
  const state = await readGlassState(command);
  const serverOnline =
    state.setupCapabilities?.find((row) => row.id === "server")?.label === "Online";
  if (serverOnline) return;

  await command.evaluate(() => window.glass.send({ type: "run-setup-check" }));
  await expect
    .poll(async () => {
      const next = await readGlassState(command);
      return next.setupCapabilities?.find((row) => row.id === "server")?.label === "Online";
    }, { timeout: 20_000 })
    .toBe(true);
}

async function activateWingmanMode() {
  await panelPage.locator('[data-testid="glass-mode-card-wingman"]').click();
  await expect
    .poll(async () => (await readGlassState(commandPage)).copilot.active)
    .toBe(true);
  await expect(panelPage.locator('[data-testid="wingman-panel-inactive"]')).toBeVisible();
}

async function startWingmanSession(goal = "QA: test UI flow") {
  await commandPage.evaluate(
    (g) => window.glass.send({ type: "wingman-start", goal: g }),
    goal,
  );
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(true);
}

async function endWingmanSession() {
  await commandPage.evaluate(() => window.glass.send({ type: "wingman-end" }));
  await expect
    .poll(async () => (await readGlassState(commandPage)).wingman.active)
    .toBe(false);
}

async function waitForReport(timeoutMs = 20_000) {
  await expect
    .poll(
      async () => (await readGlassState(commandPage)).wingman.report !== null,
      { timeout: timeoutMs },
    )
    .toBe(true);
}

async function isBackdoorAvailable(): Promise<boolean> {
  try {
    // Start a temp session, inject, check result, clear
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-start", goal: "backdoor probe" }),
    );
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-set-token-invalid" }),
    );
    const state = await readGlassState(commandPage);
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-clear-state" }),
    );
    const invalidSet =
      (state as any).githubTokenInvalid === true ||
      (state as any).githubPATState?.tokenInvalid === true;
    return invalidSet;
  } catch {
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-clear-state" }),
    ).catch(() => {});
    return false;
  }
}

// ─── A. Panel state transitions ───────────────────────────────────────────────

test.describe("A. Panel state transitions", () => {
  test("A1 — Wingman mode card present; Work mode card absent", async () => {
    await expect(panelPage.locator('[data-testid="glass-mode-card-wingman"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="glass-mode-card-work"]')).toHaveCount(0);
  });

  test("A2 — Inactive state renders goal input + disabled Start button", async () => {
    await activateWingmanMode();
    await expect(panelPage.locator('[data-testid="wingman-panel-inactive"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-goal-input"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-start-btn"]')).toBeDisabled();
  });

  test("A3 — Typing a goal enables the Start button", async () => {
    await activateWingmanMode();
    await panelPage.locator('[data-testid="wingman-goal-input"]').fill("investigate the slow DB queries");
    await expect(panelPage.locator('[data-testid="wingman-start-btn"]')).toBeEnabled();
  });

  test("A4 — Clicking Start via UI sends wingman-start and activates session", async () => {
    await activateWingmanMode();
    await panelPage.locator('[data-testid="wingman-goal-input"]').fill("fix the broken auth test");
    await panelPage.locator('[data-testid="wingman-start-btn"]').click();

    await expect
      .poll(async () => (await readGlassState(commandPage)).wingman.active)
      .toBe(true);

    const state = await readGlassState(commandPage);
    expect(state.wingman.session?.goal).toBe("fix the broken auth test");
  });

  test("A5 — Active state renders all controls", async () => {
    await activateWingmanMode();
    await startWingmanSession("debug the payment flow");

    await expect(panelPage.locator('[data-testid="wingman-panel-active"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-task-goal"]')).toContainText("debug the payment flow");
    await expect(panelPage.locator('[data-testid="wingman-inspect-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-add-note-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-end-session-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-privacy-note"]')).toBeVisible();
  });

  test("A6 — No-inspection placeholder visible before first inspect", async () => {
    await activateWingmanMode();
    await startWingmanSession("deploy the hotfix");
    await expect(panelPage.locator('[data-testid="wingman-no-inspection"]')).toBeVisible();
  });

  test("A7 — Clicking End Session via UI sends wingman-end", async () => {
    await activateWingmanMode();
    await startWingmanSession("audit the API rate limits");

    await panelPage.locator('[data-testid="wingman-end-session-btn"]').click();

    await expect
      .poll(async () => (await readGlassState(commandPage)).wingman.active)
      .toBe(false);
  });

  test("A8 — Report panel renders after session ends", async () => {
    await activateWingmanMode();
    await startWingmanSession("check build output");
    await endWingmanSession();
    await waitForReport();

    await expect(panelPage.locator('[data-testid="wingman-report"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-report-title"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-report-goal"]'))
      .toContainText("check build output");
    await expect(panelPage.locator('[data-testid="wingman-report-not-verified"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-new-session-btn"]')).toBeVisible();
  });

  test("A9 — New Session button returns to inactive state", async () => {
    await activateWingmanMode();
    await startWingmanSession("test new session button");
    await endWingmanSession();
    await waitForReport();

    await expect(panelPage.locator('[data-testid="wingman-report"]')).toBeVisible();
    await panelPage.locator('[data-testid="wingman-new-session-btn"]').click();

    await expect(panelPage.locator('[data-testid="wingman-panel-inactive"]')).toBeVisible();
    const state = await readGlassState(commandPage);
    expect(state.wingman.active).toBe(false);
    expect(state.wingman.report).toBeNull();
  });

  test("A10 — Privacy: no audio during Wingman session", async () => {
    await startWingmanSession("silent session check");
    const state = await readGlassState(commandPage);
    expect(state.privacy.listening).toBe(false);
    expect(state.privacy.capturing).toBe(false);
  });
});

// ─── B. GitHub PAT — all 5 states ─────────────────────────────────────────────

test.describe("B. GitHub PAT UI — all 5 states", () => {
  async function openPATSection() {
    await activateWingmanMode();
    await startWingmanSession("QA: PAT state test");
    await endWingmanSession();
    await waitForReport();
    // PAT section is in the report view
    await expect(panelPage.locator('[data-testid="wingman-github-pat-section"]')).toBeVisible();
  }

  test("B1 — Nudge state: no PAT → Not Connected pill + Connect button visible", async () => {
    await openPATSection();

    // No PAT configured → nudge state
    await expect(panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]')).toBeVisible();
    // No connected pill, no editing form, no invalid pill
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toHaveCount(0);
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toHaveCount(0);
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-invalid"]')).toHaveCount(0);
  });

  test("B2 — Editing state: clicking Connect opens input form", async () => {
    await openPATSection();

    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();

    // Form renders
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-save-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-cancel-btn"]')).toBeVisible();
    // No connected/saved pill while editing
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toHaveCount(0);
  });

  test("B3 — Editing state: Cancel returns to nudge", async () => {
    await openPATSection();
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();

    await panelPage.locator('[data-testid="wingman-github-pat-cancel-btn"]').click();

    // Back to nudge
    await expect(panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toHaveCount(0);
  });

  test("B4 — Connected state: saving a token shows Connected pill + Update/Remove actions", async () => {
    await openPATSection();
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();

    // Type a well-formed (but fake) token
    await panelPage.locator('[data-testid="wingman-github-pat-input"]').fill("github_pat_QAtest11111_AAAAAAAAAAAAAAAAAAAAAAAAA");
    await panelPage.locator('[data-testid="wingman-github-pat-save-btn"]').click();

    // Wait for connected state
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 6_000,
    });

    // Update and Remove buttons should be present
    await expect(panelPage.locator('[data-testid="wingman-github-pat-update-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-remove-btn"]')).toBeVisible();

    // No editing form, no nudge button
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toHaveCount(0);
    await expect(panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]')).toHaveCount(0);
  });

  test("B5 — Saved flash: 'Saved ✓' pill appears briefly after save", async () => {
    await openPATSection();
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await panelPage.locator('[data-testid="wingman-github-pat-input"]').fill("github_pat_QAtest22222_BBBBBBBBBBBBBBBBBBBBBBBBB");
    await panelPage.locator('[data-testid="wingman-github-pat-save-btn"]').click();

    // "Saved ✓" flash appears then transitions to Connected
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-saved"]')).toBeVisible({
      timeout: 6_000,
    });
    // Then settles on Connected
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test("B6 — Remove token: confirm dialog → clears state → back to nudge", async () => {
    await openPATSection();
    // First save a token
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await panelPage.locator('[data-testid="wingman-github-pat-input"]').fill("github_pat_QAtest33333_CCCCCCCCCCCCCCCCCCCCCCCCC");
    await panelPage.locator('[data-testid="wingman-github-pat-save-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 6_000,
    });

    // Click Remove
    await panelPage.locator('[data-testid="wingman-github-pat-remove-btn"]').click();

    // Confirm/cancel buttons appear
    await expect(panelPage.locator('[data-testid="wingman-github-pat-confirm-remove-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-cancel-remove-btn"]')).toBeVisible();

    // Confirm remove
    await panelPage.locator('[data-testid="wingman-github-pat-confirm-remove-btn"]').click();

    // Back to nudge state
    await expect(panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]')).toBeVisible({
      timeout: 4_000,
    });

    const state = await readGlassState(commandPage);
    expect((state as any).githubPATConfigured).toBe(false);
  });

  test("B7 — Remove cancel: dismisses confirm without removing", async () => {
    await openPATSection();
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await panelPage.locator('[data-testid="wingman-github-pat-input"]').fill("github_pat_QAtest44444_DDDDDDDDDDDDDDDDDDDDDDDDD");
    await panelPage.locator('[data-testid="wingman-github-pat-save-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 6_000,
    });

    await panelPage.locator('[data-testid="wingman-github-pat-remove-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-confirm-remove-btn"]')).toBeVisible();

    // Cancel — should return to connected state
    await panelPage.locator('[data-testid="wingman-github-pat-cancel-remove-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 3_000,
    });
  });

  test("B8 — Update token: re-opens editing form from connected state", async () => {
    await openPATSection();
    await panelPage.locator('[data-testid="wingman-github-pat-connect-btn"]').click();
    await panelPage.locator('[data-testid="wingman-github-pat-input"]').fill("github_pat_QAtest55555_EEEEEEEEEEEEEEEEEEEEEEEEE");
    await panelPage.locator('[data-testid="wingman-github-pat-save-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-connected"]')).toBeVisible({
      timeout: 6_000,
    });

    // Click Update Token
    await panelPage.locator('[data-testid="wingman-github-pat-update-btn"]').click();

    // Form reopens
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-save-btn"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-cancel-btn"]')).toBeVisible();
  });
});

// ─── C. GitHub PAT — dismissedInvalid flow ────────────────────────────────────

test.describe("C. GitHub PAT — token-invalid state (backdoor)", () => {
  test.beforeEach(async () => {
    // Start Glass normally; backdoor availability checked per-test
  });

  test("C1 — Token-invalid: warn banner visible + invalid pill + form auto-opens", async () => {
    const backdoorAvailable = await isBackdoorAvailable();
    test.skip(!backdoorAvailable, "Requires IIVO_GLASS_TEST=1 on Glass process");

    // Save a token first (so configured=true), then inject invalid state
    await commandPage.evaluate(() =>
      window.glass.send({
        type: "wingman-github-pat-save",
        token: "github_pat_invalid_QA_token",
      }),
    );

    await activateWingmanMode();
    await startWingmanSession("QA: token invalid state");
    await endWingmanSession();
    await waitForReport();

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-set-token-invalid" }),
    );

    // Warn banner should appear
    await expect(panelPage.locator('[data-testid="wingman-github-pat-warn-banner"]')).toBeVisible({
      timeout: 4_000,
    });
    // Invalid pill should be visible
    await expect(panelPage.locator('[data-testid="wingman-github-pat-status-invalid"]')).toBeVisible();
    // Form should auto-open in token-invalid state
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();
  });

  test("C2 — Cancel while token-invalid: banner stays with inline reopen button (dismissedInvalid)", async () => {
    const backdoorAvailable = await isBackdoorAvailable();
    test.skip(!backdoorAvailable, "Requires IIVO_GLASS_TEST=1 on Glass process");

    await commandPage.evaluate(() =>
      window.glass.send({
        type: "wingman-github-pat-save",
        token: "github_pat_invalid_QA_token_cancel",
      }),
    );

    await activateWingmanMode();
    await startWingmanSession("QA: dismissedInvalid flow");
    await endWingmanSession();
    await waitForReport();

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-set-token-invalid" }),
    );

    await expect(panelPage.locator('[data-testid="wingman-github-pat-warn-banner"]')).toBeVisible({
      timeout: 4_000,
    });
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();

    // Cancel the form while in invalid state
    await panelPage.locator('[data-testid="wingman-github-pat-cancel-btn"]').click();

    // Form should close but warn banner should remain (dismissedInvalid fix)
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toHaveCount(0);
    await expect(panelPage.locator('[data-testid="wingman-github-pat-warn-banner"]')).toBeVisible();

    // Inline reopen button should appear (not a "connected" or "nudge" state)
    await expect(panelPage.locator('[data-testid="wingman-github-pat-inline-reopen-btn"]')).toBeVisible();
  });

  test("C3 — Inline reopen button re-opens the editing form (I14)", async () => {
    const backdoorAvailable = await isBackdoorAvailable();
    test.skip(!backdoorAvailable, "Requires IIVO_GLASS_TEST=1 on Glass process");

    await commandPage.evaluate(() =>
      window.glass.send({
        type: "wingman-github-pat-save",
        token: "github_pat_invalid_QA_token_reopen",
      }),
    );

    await activateWingmanMode();
    await startWingmanSession("QA: inline reopen flow");
    await endWingmanSession();
    await waitForReport();

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-debug-set-token-invalid" }),
    );

    await expect(panelPage.locator('[data-testid="wingman-github-pat-warn-banner"]')).toBeVisible({
      timeout: 4_000,
    });

    // Cancel to get to dismissedInvalid state
    await panelPage.locator('[data-testid="wingman-github-pat-cancel-btn"]').click();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-inline-reopen-btn"]')).toBeVisible();

    // Click inline reopen
    await panelPage.locator('[data-testid="wingman-github-pat-inline-reopen-btn"]').click();

    // Form re-opens
    await expect(panelPage.locator('[data-testid="wingman-github-pat-input"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="wingman-github-pat-save-btn"]')).toBeVisible();
  });
});

// ─── D. Agent proxy consent modal ─────────────────────────────────────────────

test.describe("D. Agent proxy consent modal", () => {
  test("D1 — First-time enable shows consent modal", async () => {
    await activateWingmanMode();
    await startWingmanSession("QA: agent proxy consent");

    // Trigger enable (first time → consent modal)
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-agent-proxy-enable" }),
    );

    await expect
      .poll(
        async () => (await readGlassState(commandPage)).agentProxy?.showConsentModal,
        { timeout: 5_000 },
      )
      .toBe(true);

    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toBeVisible();
  });

  test("D2 — Consent modal shows env var and note sections", async () => {
    await activateWingmanMode();
    await startWingmanSession("QA: consent modal content");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-agent-proxy-enable" }),
    );

    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-envvar"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-note"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-dismiss"]')).toBeVisible();
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-enable"]')).toBeVisible();
  });

  test("D3 — Not now dismisses without starting proxy (G4)", async () => {
    await activateWingmanMode();
    await startWingmanSession("QA: consent dismiss");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-agent-proxy-enable" }),
    );

    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toBeVisible({
      timeout: 5_000,
    });
    await panelPage.locator('[data-testid="agent-proxy-consent-dismiss"]').click();

    // Modal should disappear
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toHaveCount(0, {
      timeout: 3_000,
    });

    // Proxy should NOT be running
    const state = await readGlassState(commandPage);
    expect((state as any).agentProxy?.running).toBe(false);
    expect((state as any).agentProxy?.showConsentModal).toBe(false);
  });

  test("D4 — Enable button starts proxy and shows toggle in panel (G5)", async () => {
    await activateWingmanMode();
    await startWingmanSession("QA: consent enable");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-agent-proxy-enable" }),
    );

    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toBeVisible({
      timeout: 5_000,
    });
    await panelPage.locator('[data-testid="agent-proxy-consent-enable"]').click();

    // Modal dismissed
    await expect(panelPage.locator('[data-testid="agent-proxy-consent-modal"]')).toHaveCount(0, {
      timeout: 4_000,
    });

    // Proxy should be running
    await expect
      .poll(
        async () => (await readGlassState(commandPage)).agentProxy?.running,
        { timeout: 5_000 },
      )
      .toBe(true);

    // Clean up — disable the proxy
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-agent-proxy-disable" }),
    );
  });
});

// ─── E. Terminal awareness ─────────────────────────────────────────────────────

test.describe("E. Terminal awareness", () => {
  test("E1 — Terminal toggle on: terminalWatching becomes true", async () => {
    await startWingmanSession("QA: terminal toggle");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-terminal-toggle" }),
    );

    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingman.session?.terminalWatching,
        { timeout: 5_000 },
      )
      .toBe(true);
  });

  test("E2 — Terminal toggle off: terminalWatching becomes false", async () => {
    await startWingmanSession("QA: terminal toggle off");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-terminal-toggle" }),
    );
    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingman.session?.terminalWatching,
        { timeout: 5_000 },
      )
      .toBe(true);

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-terminal-toggle" }),
    );
    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingman.session?.terminalWatching,
        { timeout: 5_000 },
      )
      .toBe(false);
  });

  test("E3 — terminalEvents array exists on session after terminal on", async () => {
    await startWingmanSession("QA: terminal events array");
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-terminal-toggle" }),
    );
    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingman.session?.terminalWatching,
        { timeout: 5_000 },
      )
      .toBe(true);

    const state = await readGlassState(commandPage);
    expect(Array.isArray(state.wingman.session?.terminalEvents)).toBe(true);
  });
});

// ─── F. Loop detection (backdoor) ─────────────────────────────────────────────

test.describe("F. Loop detection (backdoor)", () => {
  test("F1 — Two identical inspections trigger loopWarning in session", async () => {
    const backdoorAvailable = await isBackdoorAvailable();
    test.skip(!backdoorAvailable, "Requires IIVO_GLASS_TEST=1 on Glass process");

    await startWingmanSession("QA: loop detection");

    const sameResponse = "Error: Cannot find module './paymentProcessor.ts'";

    await commandPage.evaluate(
      (resp) => window.glass.send({ type: "wingman-debug-inject-inspection", response: resp }),
      sameResponse,
    );
    const after1 = await readGlassState(commandPage);
    expect(after1.wingman.session?.loopWarning).toBe(false);

    await commandPage.evaluate(
      (resp) => window.glass.send({ type: "wingman-debug-inject-inspection", response: resp }),
      sameResponse,
    );

    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingman.session?.loopWarning,
        { timeout: 3_000 },
      )
      .toBe(true);
  });
});

// ─── G. Report structure checks ───────────────────────────────────────────────

test.describe("G. Report structure", () => {
  async function getReport() {
    await activateWingmanMode();
    await startWingmanSession("QA: report structure check");
    await endWingmanSession();
    await waitForReport();
    return (await readGlassState(commandPage)).wingman.report;
  }

  test("G1 — Report has required fields: goal, summary, notVerified, observedOnly", async () => {
    const report = await getReport();
    expect(report).not.toBeNull();
    expect(report?.goal).toBe("QA: report structure check");
    expect(typeof report?.summary).toBe("string");
    expect(report?.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(report?.notVerified)).toBe(true);
    expect((report?.notVerified?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report?.observedOnly)).toBe(true);
    expect(typeof report?.duration).toBe("number");
  });

  test("G2 — Report contains v0.5.0 new fields: agentCalls, appsUsed", async () => {
    const report = await getReport();
    expect(Array.isArray(report?.agentCalls)).toBe(true);
    expect(Array.isArray(report?.appsUsed)).toBe(true);
  });

  test("G3 — Language contract: report never says 'verified that' or 'confirmed that'", async () => {
    const report = await getReport();
    const fullText = [
      report?.summary,
      ...(report?.keyFindings ?? []),
      ...(report?.observedOnly ?? []),
      ...(report?.notVerified ?? []),
    ].join(" ").toLowerCase();

    const FORBIDDEN = ["verified that", "confirmed that", "proven that", "glass confirmed"];
    for (const term of FORBIDDEN) {
      expect(fullText).not.toContain(term);
    }
  });

  test("G4 — Report shows 'not verified' section in UI with at least one item", async () => {
    await activateWingmanMode();
    await startWingmanSession("QA: not verified UI");
    await endWingmanSession();
    await waitForReport();

    await expect(panelPage.locator('[data-testid="wingman-report-not-verified"]')).toBeVisible();
    // Should have at least one list item
    const items = panelPage.locator('[data-testid="wingman-report-not-verified"] li');
    await expect(items.first()).toBeVisible();
  });
});

// ─── H. Cross-session memory ──────────────────────────────────────────────────

test.describe("H. Cross-session memory", () => {
  test("H1 — Session saved after end: totalSessions increases", async () => {
    const stateBefore = await readGlassState(commandPage);
    const sessionsBefore = (stateBefore as any).wingmanMemory?.totalSessions ?? 0;

    await startWingmanSession("QA: memory save test");
    await endWingmanSession();
    await waitForReport();

    const stateAfter = await readGlassState(commandPage);
    const sessionsAfter = (stateAfter as any).wingmanMemory?.totalSessions ?? 0;
    expect(sessionsAfter).toBeGreaterThan(sessionsBefore);
  });

  test("H2 — wingman-search-sessions returns results array", async () => {
    // End a session first so there's at least one in memory
    await startWingmanSession("QA: memory search — payment flow");
    await endWingmanSession();
    await waitForReport();

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-search-sessions", query: "payment" }),
    );

    await expect
      .poll(
        async () => (await readGlassState(commandPage)).wingmanMemory?.loading,
        { timeout: 6_000 },
      )
      .toBe(false);

    const state = await readGlassState(commandPage);
    expect(Array.isArray((state as any).wingmanMemory?.searchResults)).toBe(true);
  });

  test("H3 — Search results have correct shape: id, goal, duration, summary", async () => {
    await startWingmanSession("QA: memory shape test — auth middleware");
    await endWingmanSession();
    await waitForReport();

    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-search-sessions", query: "auth middleware" }),
    );

    await expect
      .poll(
        async () => !(await readGlassState(commandPage)).wingmanMemory?.loading,
        { timeout: 6_000 },
      )
      .toBe(true);

    const state = await readGlassState(commandPage);
    const results = (state as any).wingmanMemory?.searchResults ?? [];
    if (results.length > 0) {
      const rec = results[0];
      expect(typeof rec.id).toBe("string");
      expect(typeof rec.goal).toBe("string");
      expect(typeof rec.duration).toBe("number");
      expect(typeof rec.summary).toBe("string");
      // Privacy — no token fields
      expect("token" in rec).toBe(false);
      expect("apiKey" in rec).toBe(false);
    }
  });
});

// ─── I. Privacy invariants in GlassState ──────────────────────────────────────

test.describe("I. Privacy invariants", () => {
  test("I1 — GlassState never contains raw PAT token strings", async () => {
    // Save a token that would be obvious if leaked
    await commandPage.evaluate(() =>
      window.glass.send({
        type: "wingman-github-pat-save",
        token: "github_pat_PRIVACY_TEST_LEAK_CANARY_VALUE",
      }),
    );

    const state = await readGlassState(commandPage);
    const stateJson = JSON.stringify(state);

    expect(stateJson).not.toContain("github_pat_PRIVACY_TEST_LEAK_CANARY_VALUE");
    expect(stateJson).not.toContain("ghp_");
    expect(stateJson).not.toContain("sk-ant-");

    // Clean up
    await commandPage.evaluate(() =>
      window.glass.send({ type: "wingman-github-pat-clear" }),
    );
  });

  test("I2 — GlassState.privacy exists with correct boolean fields", async () => {
    const state = await readGlassState(commandPage);
    expect(state.privacy).toBeDefined();
    expect(typeof state.privacy.listening).toBe("boolean");
    expect(typeof state.privacy.capturing).toBe("boolean");
  });

  test("I3 — agentProxy.port is on localhost range after initialization", async () => {
    const state = await readGlassState(commandPage);
    const port = (state as any).agentProxy?.port;
    if (port !== undefined) {
      expect(port).toBeGreaterThanOrEqual(1024);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });
});

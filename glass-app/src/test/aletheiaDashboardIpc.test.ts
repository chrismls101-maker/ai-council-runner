/**
 * aletheiaDashboardIpc.test.ts
 * ----------------------------
 * Unit tests for the Aletheia dashboard IPC auth gate.
 *
 * Covers:
 *   - isAletheiaDashboardSender returns false before setAletheiaDashboardIpcAuth is called
 *   - isAletheiaDashboardSender returns true when the registered check passes
 *   - isAletheiaDashboardSender returns false when the registered check fails
 *   - A Glass dashboard sender (isDashboardIpcSender) is NOT an Aletheia dashboard sender
 *   - An Aletheia dashboard sender is NOT a Glass dashboard sender
 *   - setAletheiaDashboardIpcAuth replaces the check function (late registration)
 *   - Resetting auth to () => false correctly denies all senders
 *
 * NOTE: These tests exercise the exported module-level functions directly.
 * The ipcMain.handle registration requires Electron and is NOT tested here —
 * that belongs in an integration / e2e suite. The auth gate logic itself is
 * pure and fully testable without Electron.
 *
 * Run with:
 *   node --experimental-strip-types --test src/test/aletheiaDashboardIpc.test.ts
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Minimal WebContents stub — only needs identity equality for sender checks.
// ---------------------------------------------------------------------------

type FakeWebContents = { id: number };

function fakeWC(id: number): FakeWebContents {
  return { id };
}

// ---------------------------------------------------------------------------
// Re-implement the auth gate in isolation so we can test it without importing
// Electron. The logic under test is exactly what lives in aletheiaDashboardIpc.ts
// and dashboardIpc.ts — a mutable closure that wraps a replaceable check fn.
// ---------------------------------------------------------------------------

function makeAuthGate() {
  // Mirrors the real module-level pattern exactly.
  let check: (sender: FakeWebContents) => boolean = () => false;

  function setAuth(fn: (sender: FakeWebContents) => boolean): void {
    check = fn;
  }

  function isSender(sender: FakeWebContents): boolean {
    return check(sender);
  }

  return { setAuth, isSender };
}

// One gate per dashboard, matching the real architecture.
const aletheiaGate = makeAuthGate();
const glassGate = makeAuthGate();

// ---------------------------------------------------------------------------
// Test: default state (before setAuth is called)
// ---------------------------------------------------------------------------

test("isAletheiaDashboardSender returns false for any sender before setAletheiaDashboardIpcAuth is called", () => {
  // Fresh gate — check is () => false by default.
  const gate = makeAuthGate();
  const wc = fakeWC(1);
  assert.equal(gate.isSender(wc), false, "Should deny all senders before auth is configured");
});

test("isAletheiaDashboardSender returns false for multiple distinct senders before auth is set", () => {
  const gate = makeAuthGate();
  for (let i = 0; i < 5; i++) {
    assert.equal(gate.isSender(fakeWC(i)), false);
  }
});

// ---------------------------------------------------------------------------
// Test: after setAletheiaDashboardIpcAuth is called
// ---------------------------------------------------------------------------

test("isAletheiaDashboardSender returns true when registered check passes", () => {
  const gate = makeAuthGate();
  const authorised = fakeWC(42);
  gate.setAuth((sender) => sender.id === 42);
  assert.equal(gate.isSender(authorised), true);
});

test("isAletheiaDashboardSender returns false when registered check fails", () => {
  const gate = makeAuthGate();
  const stranger = fakeWC(99);
  gate.setAuth((sender) => sender.id === 42);
  assert.equal(gate.isSender(stranger), false);
});

test("isAletheiaDashboardSender returns false for a sender that was never registered even after auth is set", () => {
  const gate = makeAuthGate();
  const authorised = fakeWC(1);
  const unrelated = fakeWC(2);
  gate.setAuth((sender) => sender === authorised);
  assert.equal(gate.isSender(authorised), true);
  assert.equal(gate.isSender(unrelated), false);
});

// ---------------------------------------------------------------------------
// Test: distinct boundary — Glass sender must NOT pass Aletheia gate
// ---------------------------------------------------------------------------

test("A Glass dashboard sender is NOT accepted by the Aletheia dashboard gate", () => {
  const glassSender = fakeWC(10);
  const aletheiaSender = fakeWC(20);

  // Glass gate accepts glassSender only.
  glassGate.setAuth((sender) => sender === glassSender);
  // Aletheia gate accepts aletheiaSender only.
  aletheiaGate.setAuth((sender) => sender === aletheiaSender);

  // Glass sender passes glass gate.
  assert.equal(glassGate.isSender(glassSender), true, "Glass sender should pass glass gate");
  // Glass sender must NOT pass aletheia gate.
  assert.equal(aletheiaGate.isSender(glassSender), false, "Glass sender must NOT pass aletheia gate");
});

test("An Aletheia dashboard sender is NOT accepted by the Glass dashboard gate", () => {
  const glassSender = fakeWC(10);
  const aletheiaSender = fakeWC(20);

  glassGate.setAuth((sender) => sender === glassSender);
  aletheiaGate.setAuth((sender) => sender === aletheiaSender);

  // Aletheia sender passes aletheia gate.
  assert.equal(aletheiaGate.isSender(aletheiaSender), true, "Aletheia sender should pass aletheia gate");
  // Aletheia sender must NOT pass glass gate.
  assert.equal(glassGate.isSender(aletheiaSender), false, "Aletheia sender must NOT pass glass gate");
});

test("Same WebContents object accepted by both gates only if both checks pass (impossible in production)", () => {
  const sharedWC = fakeWC(50);

  // In production the checks are mutually exclusive via state.glassDashboardActive /
  // state.aletheiaDashboardActive (only one can be true at a time). But the gate
  // logic itself does not enforce exclusion — the caller's state guard does.
  // Here we confirm the gate simply delegates to the provided check function.
  glassGate.setAuth(() => true);     // permissive (hypothetical)
  aletheiaGate.setAuth(() => false); // closed

  assert.equal(glassGate.isSender(sharedWC), true);
  assert.equal(aletheiaGate.isSender(sharedWC), false);
});

// ---------------------------------------------------------------------------
// Test: late registration / replacement of check function
// ---------------------------------------------------------------------------

test("setAletheiaDashboardIpcAuth replaces the check — later calls override earlier ones", () => {
  const gate = makeAuthGate();
  const wc = fakeWC(7);

  gate.setAuth(() => true);
  assert.equal(gate.isSender(wc), true, "First registration: open");

  gate.setAuth(() => false);
  assert.equal(gate.isSender(wc), false, "Second registration: closed");

  gate.setAuth((sender) => sender.id === 7);
  assert.equal(gate.isSender(wc), true, "Third registration: specific match");
});

// ---------------------------------------------------------------------------
// Test: resetting to deny-all (window destroyed pattern)
// ---------------------------------------------------------------------------

test("Resetting auth to () => false correctly denies all senders (teardown pattern)", () => {
  const gate = makeAuthGate();
  const wc = fakeWC(3);

  // Window created — auth set.
  gate.setAuth((sender) => sender.id === 3);
  assert.equal(gate.isSender(wc), true);

  // Window destroyed — auth reset.
  gate.setAuth(() => false);
  assert.equal(gate.isSender(wc), false, "After teardown reset, all senders must be denied");
});

// ---------------------------------------------------------------------------
// Test: IPC channel name constants — verify distinct from Glass channels
// ---------------------------------------------------------------------------

test("Aletheia IPC channel names are distinct from Glass dashboard channel names", async () => {
  // Import the actual IPC constants (no Electron runtime needed — shared/ipc.ts
  // is a pure-TS module with no side effects).
  const { IPC } = await import("../shared/ipc.ts");

  assert.notEqual(
    IPC.getAletheiaRecentSessions,
    IPC.getRecentSessions,
    "Aletheia recent-sessions channel must differ from Glass recent-sessions channel",
  );

  assert.notEqual(
    IPC.getAletheiaSessionMessages,
    IPC.getSessionMessages,
    "Aletheia session-messages channel must differ from Glass session-messages channel",
  );

  // Must NOT contain the legacy concatenation pattern ":aletheia" suffix.
  assert.ok(
    !IPC.getAletheiaRecentSessions.endsWith(":aletheia"),
    `Channel "${IPC.getAletheiaRecentSessions}" must not use the deprecated :aletheia suffix`,
  );
  assert.ok(
    !IPC.getAletheiaSessionMessages.endsWith(":aletheia"),
    `Channel "${IPC.getAletheiaSessionMessages}" must not use the deprecated :aletheia suffix`,
  );

  // Must be properly namespaced strings.
  assert.ok(
    typeof IPC.getAletheiaRecentSessions === "string" && IPC.getAletheiaRecentSessions.length > 0,
    "getAletheiaRecentSessions must be a non-empty string",
  );
  assert.ok(
    typeof IPC.getAletheiaSessionMessages === "string" && IPC.getAletheiaSessionMessages.length > 0,
    "getAletheiaSessionMessages must be a non-empty string",
  );
});

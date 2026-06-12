/**
 * Unit tests for wingmanSession.ts
 *
 * Covers:
 *   - initialWingmanSession factory
 *   - shouldAddAppSnapshot deduplication
 *   - deriveAppsUsed
 *   - detectLoop
 *   - detectScopeDrift
 *   - buildVerificationChecklist
 *   - buildWingmanReport (structure)
 *   - DEFAULT_WINGMAN_STATE shape
 *   - "never verified" language contract
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WINGMAN_STATE,
  initialWingmanSession,
  shouldAddAppSnapshot,
  deriveAppsUsed,
  detectLoop,
  detectScopeDrift,
  buildVerificationChecklist,
  buildWingmanReport,
  buildWingmanReportPrompt,
  type WingmanInspection,
  type WingmanAppSnapshot,
  type WingmanSession,
} from "../shared/wingmanSession.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInspection(overrides: Partial<WingmanInspection> = {}): WingmanInspection {
  return {
    id: `insp-${Date.now()}-${Math.random()}`,
    triggeredBy: "user",
    timestamp: Date.now(),
    screenshotRef: "wingman-test-ref",
    response: "I observe the terminal is showing an exit code 0.",
    type: "next-step",
    confidence: "inferred",
    ...overrides,
  };
}

function makeSnapshot(app: string, title: string, timestamp = Date.now()): WingmanAppSnapshot {
  return { app, title, timestamp };
}

function makeSession(overrides: Partial<WingmanSession> = {}): WingmanSession {
  return {
    id: "wingman-test-session",
    goal: "debug the failing auth test",
    startedAt: Date.now() - 10_000,
    appSnapshots: [],
    inspections: [],
    notes: [],
    loopWarning: false,
    terminalEvents: [],
    terminalWatching: false,
    ...overrides,
  };
}

// ─── DEFAULT_WINGMAN_STATE ────────────────────────────────────────────────────

test("DEFAULT_WINGMAN_STATE has correct shape", () => {
  assert.equal(DEFAULT_WINGMAN_STATE.active, false);
  assert.equal(DEFAULT_WINGMAN_STATE.session, null);
  assert.equal(DEFAULT_WINGMAN_STATE.inspecting, false);
  assert.equal(DEFAULT_WINGMAN_STATE.report, null);
});

// ─── initialWingmanSession ───────────────────────────────────────────────────

test("initialWingmanSession creates a session with the given goal", () => {
  const session = initialWingmanSession("fix broken auth test");
  assert.equal(session.goal, "fix broken auth test");
  assert.ok(session.id.startsWith("wingman-"));
  assert.equal(session.appSnapshots.length, 0);
  assert.equal(session.inspections.length, 0);
  assert.equal(session.notes.length, 0);
  assert.equal(session.loopWarning, false);
  assert.ok(typeof session.startedAt === "number");
  assert.ok(session.startedAt <= Date.now());
});

test("initialWingmanSession generates unique ids", () => {
  const a = initialWingmanSession("goal a");
  const b = initialWingmanSession("goal b");
  assert.notEqual(a.id, b.id);
});

// ─── shouldAddAppSnapshot ─────────────────────────────────────────────────────

test("shouldAddAppSnapshot returns true when list is empty", () => {
  const snap = makeSnapshot("Cursor", "auth.ts");
  assert.equal(shouldAddAppSnapshot([], snap), true);
});

test("shouldAddAppSnapshot deduplicates same app+title within 60s", () => {
  const now = Date.now();
  const existing = makeSnapshot("Cursor", "auth.ts", now - 30_000);
  const incoming = makeSnapshot("Cursor", "auth.ts", now);
  assert.equal(shouldAddAppSnapshot([existing], incoming), false);
});

test("shouldAddAppSnapshot allows same app+title after 60s window", () => {
  const now = Date.now();
  const old = makeSnapshot("Cursor", "auth.ts", now - 61_000);
  const incoming = makeSnapshot("Cursor", "auth.ts", now);
  assert.equal(shouldAddAppSnapshot([old], incoming), true);
});

test("shouldAddAppSnapshot allows different app with same title", () => {
  const now = Date.now();
  const existing = makeSnapshot("Cursor", "auth.ts", now - 5_000);
  const incoming = makeSnapshot("Terminal", "auth.ts", now);
  assert.equal(shouldAddAppSnapshot([existing], incoming), true);
});

test("shouldAddAppSnapshot allows same app with different title", () => {
  const now = Date.now();
  const existing = makeSnapshot("Cursor", "auth.ts", now - 5_000);
  const incoming = makeSnapshot("Cursor", "payment.ts", now);
  assert.equal(shouldAddAppSnapshot([existing], incoming), true);
});

test("shouldAddAppSnapshot respects custom dedupeWindowMs", () => {
  const now = Date.now();
  const existing = makeSnapshot("VS Code", "index.ts", now - 10_000);
  const incoming = makeSnapshot("VS Code", "index.ts", now);
  // With a 5s window, 10s old entry should not block
  assert.equal(shouldAddAppSnapshot([existing], incoming, 5_000), true);
  // With a 20s window, 10s old entry should block
  assert.equal(shouldAddAppSnapshot([existing], incoming, 20_000), false);
});

// ─── deriveAppsUsed ──────────────────────────────────────────────────────────

test("deriveAppsUsed returns unique app names", () => {
  const snapshots = [
    makeSnapshot("Cursor", "auth.ts"),
    makeSnapshot("Terminal", "zsh"),
    makeSnapshot("Cursor", "payment.ts"),
    makeSnapshot("GitHub", "PR #12"),
    makeSnapshot("Terminal", "node"),
  ];
  const apps = deriveAppsUsed(snapshots);
  assert.deepEqual(apps.sort(), ["Cursor", "GitHub", "Terminal"]);
});

test("deriveAppsUsed returns empty array for no snapshots", () => {
  assert.deepEqual(deriveAppsUsed([]), []);
});

test("deriveAppsUsed ignores empty app names", () => {
  const snapshots = [
    makeSnapshot("Cursor", "auth.ts"),
    makeSnapshot("", "unknown"),
  ];
  const apps = deriveAppsUsed(snapshots);
  assert.deepEqual(apps, ["Cursor"]);
});

// ─── detectLoop ──────────────────────────────────────────────────────────────

test("detectLoop returns false with fewer than 2 inspections", () => {
  assert.equal(detectLoop([]), false);
  assert.equal(detectLoop([makeInspection()]), false);
});

test("detectLoop returns false when no shared error keywords", () => {
  const a = makeInspection({ response: "The build looks healthy. Tests appear to pass.", timestamp: Date.now() - 5_000 });
  const b = makeInspection({ response: "The terminal shows normal output.", timestamp: Date.now() });
  assert.equal(detectLoop([a, b]), false);
});

test("detectLoop returns true when last 2 inspections share 2+ error keywords within 20 min", () => {
  const now = Date.now();
  const a = makeInspection({
    response: "I observe an error on line 42 and the function failed to execute.",
    timestamp: now - 5 * 60_000,
  });
  const b = makeInspection({
    response: "The same error appears again. The function failed as before.",
    timestamp: now,
  });
  assert.equal(detectLoop([a, b]), true);
});

test("detectLoop returns false when inspections are more than 20 minutes apart", () => {
  const now = Date.now();
  const a = makeInspection({
    response: "I observe an error. The function failed.",
    timestamp: now - 25 * 60_000,
  });
  const b = makeInspection({
    response: "I see an error again. The function failed again.",
    timestamp: now,
  });
  // 25 minutes apart — beyond the 20-minute loop window
  assert.equal(detectLoop([a, b]), false);
});

test("detectLoop only considers the last two inspections", () => {
  const now = Date.now();
  const old = makeInspection({
    response: "error failed exception undefined crash",
    timestamp: now - 10 * 60_000,
  });
  const recent1 = makeInspection({
    response: "Everything looks clean. No issues observed.",
    timestamp: now - 2 * 60_000,
  });
  const recent2 = makeInspection({
    response: "Build appears successful. Terminal shows exit 0.",
    timestamp: now,
  });
  // Old error inspection + clean recent pair = no loop
  assert.equal(detectLoop([old, recent1, recent2]), false);
});

// ─── detectScopeDrift ────────────────────────────────────────────────────────

test("detectScopeDrift returns null when no drift detected", () => {
  assert.equal(detectScopeDrift("fix auth test", "Tests appear to be passing."), null);
});

test("detectScopeDrift fires on UI task touching payment config", () => {
  const warning = detectScopeDrift(
    "update the landing page button colors",
    "I observe stripe.config.js is open in the editor",
  );
  assert.ok(warning !== null);
  assert.ok(warning.toLowerCase().includes("ui") || warning.toLowerCase().includes("payment") || warning.toLowerCase().includes("billing"));
});

test("detectScopeDrift fires on test task touching production", () => {
  const warning = detectScopeDrift(
    "write unit tests for the auth module",
    "I observe a production deploy script is running",
  );
  assert.ok(warning !== null);
  assert.ok(warning.toLowerCase().includes("test") || warning.toLowerCase().includes("production") || warning.toLowerCase().includes("live"));
});

test("detectScopeDrift fires on fix task touching schema migration", () => {
  const warning = detectScopeDrift(
    "debug the broken login redirect",
    "I observe a migration file is being edited — it references DROP TABLE",
  );
  assert.ok(warning !== null);
});

test("detectScopeDrift fires on deploy task touching localhost", () => {
  const warning = detectScopeDrift(
    "deploy the release build to production",
    "I observe localhost:3000 is the current target URL",
  );
  assert.ok(warning !== null);
});

test("detectScopeDrift is case-insensitive", () => {
  const warning = detectScopeDrift(
    "Build the UI landing page",
    "STRIPE billing configuration visible",
  );
  assert.ok(warning !== null);
});

// ─── buildVerificationChecklist ──────────────────────────────────────────────

test("buildVerificationChecklist returns at least one item", () => {
  const session = makeSession({ goal: "review some documents" });
  const checklist = buildVerificationChecklist(session);
  assert.ok(checklist.length >= 1);
});

test("buildVerificationChecklist includes test-run item for debug goals", () => {
  const session = makeSession({ goal: "debug the failing auth test" });
  const checklist = buildVerificationChecklist(session);
  const joined = checklist.join(" ").toLowerCase();
  assert.ok(joined.includes("test") || joined.includes("fix") || joined.includes("debug"));
});

test("buildVerificationChecklist includes deploy items for ship goals", () => {
  const session = makeSession({ goal: "deploy and release the new build" });
  const checklist = buildVerificationChecklist(session);
  const joined = checklist.join(" ").toLowerCase();
  assert.ok(joined.includes("deploy") || joined.includes("environment") || joined.includes("build") || joined.includes("ship"));
});

test("buildVerificationChecklist includes loop warning when session has loop", () => {
  const session = makeSession({ goal: "fix a bug", loopWarning: true });
  const checklist = buildVerificationChecklist(session);
  const joined = checklist.join(" ").toLowerCase();
  assert.ok(joined.includes("same error") || joined.includes("root cause") || joined.includes("loop") || joined.includes("observed more than once"));
});

test("buildVerificationChecklist includes scope drift warnings from inspections", () => {
  const inspectionWithDrift = makeInspection({
    scopeDriftWarning: "UI task but stripe.config.js observed — verify billing logic unchanged",
  });
  const session = makeSession({ inspections: [inspectionWithDrift] });
  const checklist = buildVerificationChecklist(session);
  const joined = checklist.join(" ").toLowerCase();
  assert.ok(joined.includes("stripe") || joined.includes("billing") || joined.includes("ui"));
});

test("buildVerificationChecklist returns at most 6 items", () => {
  const session = makeSession({
    goal: "deploy test debug fix auth login ui landing",
    loopWarning: true,
    inspections: [
      makeInspection({ scopeDriftWarning: "drift warning 1" }),
      makeInspection({ scopeDriftWarning: "drift warning 2" }),
    ],
  });
  const checklist = buildVerificationChecklist(session);
  assert.ok(checklist.length <= 6);
});

// ─── buildWingmanReport ───────────────────────────────────────────────────────

test("buildWingmanReport produces correct goal and duration", () => {
  const startedAt = Date.now() - 30 * 60_000;
  const endedAt = Date.now();
  const session = makeSession({ startedAt, endedAt });
  const report = buildWingmanReport(session, "Session summary here.");
  assert.equal(report.goal, session.goal);
  assert.ok(report.duration >= 29 * 60_000 && report.duration <= 31 * 60_000);
});

test("buildWingmanReport derives apps from snapshots", () => {
  const session = makeSession({
    appSnapshots: [
      makeSnapshot("Cursor", "auth.ts"),
      makeSnapshot("Terminal", "zsh"),
    ],
  });
  const report = buildWingmanReport(session, "Summary.");
  assert.ok(report.appsUsed.includes("Cursor"));
  assert.ok(report.appsUsed.includes("Terminal"));
});

test("buildWingmanReport uses the provided AI summary", () => {
  const session = makeSession();
  const report = buildWingmanReport(session, "This is the AI-generated narrative.");
  assert.equal(report.summary, "This is the AI-generated narrative.");
});

test("buildWingmanReport includes observedOnly section — never empty", () => {
  const session = makeSession();
  const report = buildWingmanReport(session, "Summary.");
  assert.ok(Array.isArray(report.observedOnly));
  assert.ok(report.observedOnly.length >= 1);
});

test("buildWingmanReport includes notVerified section — never empty", () => {
  const session = makeSession({ goal: "fix the auth bug" });
  const report = buildWingmanReport(session, "Summary.");
  assert.ok(Array.isArray(report.notVerified));
  assert.ok(report.notVerified.length >= 1);
});

test("buildWingmanReport includes loop warning in warningsIssued", () => {
  const session = makeSession({ loopWarning: true });
  const report = buildWingmanReport(session, "Summary.");
  const warnings = report.warningsIssued.join(" ").toLowerCase();
  assert.ok(warnings.includes("same issue") || warnings.includes("more than once") || warnings.includes("loop") || warnings.includes("root cause"));
});

test("buildWingmanReport includes scope drift warnings from inspections", () => {
  const inspection = makeInspection({ scopeDriftWarning: "UI task — stripe config observed" });
  const session = makeSession({ inspections: [inspection] });
  const report = buildWingmanReport(session, "Summary.");
  const warnings = report.warningsIssued.join(" ");
  assert.ok(warnings.includes("stripe"));
});

// ─── buildWingmanReportPrompt — "never verified" contract ────────────────────

test("buildWingmanReportPrompt contains NEVER-verified language rule", () => {
  const session = makeSession();
  const prompt = buildWingmanReportPrompt(session);
  assert.ok(prompt.includes("NEVER"));
  // Must instruct the model to use observed/appears-to language
  assert.ok(prompt.toLowerCase().includes("observed") || prompt.toLowerCase().includes("appears to"));
});

test("buildWingmanReportPrompt includes the session goal", () => {
  const session = makeSession({ goal: "debug the payment webhook" });
  const prompt = buildWingmanReportPrompt(session);
  assert.ok(prompt.includes("debug the payment webhook"));
});

test("buildWingmanReportPrompt includes inspection summaries when present", () => {
  const session = makeSession({
    inspections: [
      makeInspection({ response: "I observe an uncaught exception in payment.ts." }),
    ],
  });
  const prompt = buildWingmanReportPrompt(session);
  assert.ok(prompt.includes("uncaught exception") || prompt.includes("payment.ts"));
});

test("buildWingmanReportPrompt mentions loop warning when active", () => {
  const session = makeSession({ loopWarning: true });
  const prompt = buildWingmanReportPrompt(session);
  assert.ok(prompt.toLowerCase().includes("loop") || prompt.toLowerCase().includes("same error observed more than once"));
});

// ─── WingmanInspection confidence contract ───────────────────────────────────

test("WingmanInspection confidence is observed or inferred — never verified", () => {
  const validValues: Array<WingmanInspection["confidence"]> = ["observed", "inferred"];
  for (const val of validValues) {
    const ins = makeInspection({ confidence: val });
    assert.equal(ins.confidence, val);
  }
  // TypeScript prevents "verified" at compile time; verify the valid set is exactly 2
  assert.equal(validValues.length, 2);
  assert.ok(!validValues.includes("verified" as WingmanInspection["confidence"]));
});

#!/usr/bin/env node
/**
 * IIVO Glass — Wingman Mode QA Script
 *
 * Exercises the full Wingman session lifecycle against a running Glass instance:
 *   1. Sends wingman-start with a test goal
 *   2. Adds notes
 *   3. Sends wingman-end and waits for the report
 *   4. Validates the report structure:
 *        - goal matches
 *        - notVerified section is non-empty (the "honest section")
 *        - summary present
 *        - no "verified"/"confirmed" language in the report (language contract)
 *
 * Also validates the passive state machine:
 *   - wingmanState.active is false before start
 *   - wingmanState.active is true during session
 *   - wingmanState.active is false after end
 *   - session contains the correct goal
 *
 * Usage:
 *   node scripts/glass-qa-wingman.mjs [--url http://localhost:PORT]
 *
 * Requires:
 *   GLASS_API_SECRET env var  OR  IIVO_API_KEY env var
 *   Glass server running at --url (defaults to http://localhost:7842)
 *
 * Exit codes:
 *   0  all checks passed
 *   1  one or more checks failed
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf("--url");
  return {
    url: urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:7842",
  };
}

const { url: BASE_URL } = parseArgs();
const API_SECRET = process.env.GLASS_API_SECRET ?? process.env.IIVO_API_KEY ?? "";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_SECRET ? { "x-glass-secret": API_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

async function getState() {
  const res = await fetch(`${BASE_URL}/api/state`, {
    headers: API_SECRET ? { "x-glass-secret": API_SECRET } : {},
  });
  if (!res.ok) throw new Error(`GET /api/state → ${res.status}`);
  return res.json();
}

async function sendCommand(command) {
  return post("/api/command", command);
}

// ─── Polling helper ───────────────────────────────────────────────────────────

async function waitFor(predicate, { timeoutMs = 15_000, intervalMs = 300, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState().catch(() => null);
    if (state && predicate(state)) return state;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// ─── Check runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label, value, expected, { contains = false, absent = false } = {}) {
  let ok = false;
  let detail = "";

  if (absent) {
    ok = !String(value ?? "").toLowerCase().includes(String(expected).toLowerCase());
    detail = ok ? "" : `found forbidden term "${expected}" in: ${String(value).slice(0, 120)}`;
  } else if (contains) {
    ok = String(value ?? "").toLowerCase().includes(String(expected).toLowerCase());
    detail = ok ? "" : `"${expected}" not found in: ${String(value ?? "").slice(0, 120)}`;
  } else {
    ok = value === expected;
    detail = ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`;
  }

  const icon = ok ? "✓" : "✗";
  const msg = ok ? `${icon} ${label}` : `${icon} ${label} — FAIL: ${detail}`;
  console.log(msg);
  if (ok) passed++; else failed++;
  return ok;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─── Main QA flow ─────────────────────────────────────────────────────────────

async function runQA() {
  console.log("IIVO Glass — Wingman Mode QA");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Secret: ${API_SECRET ? "set" : "NOT SET (unauthenticated)"}`);
  console.log("");

  // ── 1. Verify server is reachable ──────────────────────────────────────────

  section("Server reachability");
  let initialState;
  try {
    initialState = await getState();
    check("Glass state endpoint reachable", true, true);
  } catch (err) {
    check("Glass state endpoint reachable", false, true);
    console.error(`  Error: ${err.message}`);
    console.log("\nCannot continue — Glass server not reachable.");
    process.exit(1);
  }

  // ── 2. Pre-condition: no active session ────────────────────────────────────

  section("Pre-condition");
  if (initialState.wingman?.active) {
    console.log("  [cleanup] Sending wingman-end to clear existing session…");
    await sendCommand({ type: "wingman-end" });
    await new Promise((r) => setTimeout(r, 500));
  }
  const preState = await getState();
  check("wingman.active is false before test", preState.wingman?.active, false);
  check("wingman.session is null before test", preState.wingman?.session, null);

  // ── 3. Start a Wingman session ─────────────────────────────────────────────

  section("wingman-start");
  const testGoal = "QA: verify the payment webhook logs errors correctly";
  await sendCommand({ type: "wingman-start", goal: testGoal });

  const activeState = await waitFor(
    (s) => s.wingman?.active === true,
    { label: "wingman.active = true", timeoutMs: 5_000 },
  );

  check("wingman.active is true after start", activeState.wingman?.active, true);
  check("session exists after start", activeState.wingman?.session !== null, true);
  check("session.goal matches", activeState.wingman?.session?.goal, testGoal);
  check("session has no inspections yet", activeState.wingman?.session?.inspections?.length, 0);
  check("session.loopWarning is false", activeState.wingman?.session?.loopWarning, false);
  check("no audio started", activeState.privacy?.listening, false);
  check("no capture started", activeState.privacy?.capturing, false);

  // ── 4. Add notes ───────────────────────────────────────────────────────────

  section("wingman-add-note");
  await sendCommand({ type: "wingman-add-note", content: "Webhook logs show 200 for test events" });
  await sendCommand({ type: "wingman-add-note", content: "Error event routing goes through EventBridge" });

  const notedState = await waitFor(
    (s) => (s.wingman?.session?.notes?.length ?? 0) >= 2,
    { label: "2 notes added", timeoutMs: 5_000 },
  );

  check("session has 2 notes", notedState.wingman?.session?.notes?.length, 2);
  check("first note content correct", notedState.wingman?.session?.notes?.[0]?.content, "Webhook logs show 200 for test events");
  check("note source is user", notedState.wingman?.session?.notes?.[0]?.source, "user");

  // ── 5. End session ─────────────────────────────────────────────────────────

  section("wingman-end + report generation");
  await sendCommand({ type: "wingman-end" });

  const endedState = await waitFor(
    (s) => s.wingman?.active === false,
    { label: "wingman.active = false", timeoutMs: 5_000 },
  );

  check("wingman.active is false after end", endedState.wingman?.active, false);
  check("session.endedAt is set", typeof endedState.wingman?.session?.endedAt, "number");

  // Report is generated async — wait up to 20s
  const reportState = await waitFor(
    (s) => s.wingman?.report !== null,
    { label: "wingman.report != null", timeoutMs: 20_000 },
  ).catch(() => endedState);

  section("Report structure validation");
  const report = reportState.wingman?.report;

  if (!report) {
    check("report generated (AI may be unavailable)", false, true);
    console.log("  NOTE: Report not generated — this is expected if Glass has no AI connection.");
  } else {
    check("report.goal matches session goal", report.goal, testGoal);
    check("report.summary is a non-empty string", typeof report.summary === "string" && report.summary.length > 0, true);
    check("report.notVerified is non-empty array", Array.isArray(report.notVerified) && report.notVerified.length > 0, true);
    check("report.observedOnly is non-empty array", Array.isArray(report.observedOnly) && report.observedOnly.length > 0, true);
    check("report.appsUsed is an array", Array.isArray(report.appsUsed), true);
    check("report.duration is positive number", typeof report.duration === "number" && report.duration > 0, true);

    // ── Language contract: "never verified" ───────────────────────────────────

    section("Language contract: 'never verified'");
    const allReportText = [
      report.summary,
      ...(report.keyFindings ?? []),
      ...(report.observedOnly ?? []),
      ...(report.notVerified ?? []),
    ].join(" ");

    // These words should not appear as positive assertions
    const FORBIDDEN_ASSERTIONS = [
      "verified that",
      "confirmed that",
      "proven that",
      "tested and confirmed",
      "we confirmed",
      "i confirmed",
      "glass confirmed",
    ];

    for (const term of FORBIDDEN_ASSERTIONS) {
      check(
        `report does not assert "${term}"`,
        allReportText,
        term,
        { absent: true },
      );
    }

    // These observed-language markers should be present or at least not totally absent
    const observedLanguagePresent =
      allReportText.toLowerCase().includes("observed") ||
      allReportText.toLowerCase().includes("appears") ||
      allReportText.toLowerCase().includes("visible") ||
      allReportText.toLowerCase().includes("cannot confirm") ||
      allReportText.toLowerCase().includes("not independently");

    check("report uses observed/appears language", observedLanguagePresent, true);
  }

  // ── 6. Post-condition ─────────────────────────────────────────────────────

  section("Post-condition cleanup");
  const finalState = await getState();
  check("wingman.active remains false after QA", finalState.wingman?.active, false);

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log("");
  console.log("══════════════════════════════════════");
  console.log(`  Wingman QA: ${passed} passed  /  ${failed} failed`);
  console.log("══════════════════════════════════════");

  if (failed > 0) {
    console.log("\nSome checks failed. Review output above.");
    process.exit(1);
  } else {
    console.log("\nAll Wingman QA checks passed.");
    process.exit(0);
  }
}

runQA().catch((err) => {
  console.error("QA script error:", err.message);
  process.exit(1);
});

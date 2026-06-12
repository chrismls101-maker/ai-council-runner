#!/usr/bin/env node
/**
 * IIVO Glass — Wingman Mode QA Script (v0.5.0)
 *
 * Exercises the full Wingman session lifecycle against a running Glass instance.
 *
 * §1  Server reachability
 * §2  Pre-condition (no active session)
 * §3  wingman-start — state machine + session shape
 * §4  wingman-add-note — note storage
 * §5  Terminal toggle — wingman-terminal-toggle on/off
 * §6  Agent proxy state — shape, initial values, enable/disable flow
 * §7  New v0.5.0 session fields — agentCalls, terminalWatching, terminalEvents
 * §8  wingman-end + report generation
 * §9  Report structure (v0.5.0) — goal, summary, notVerified, agentCalls,
 *       terminalEvents, gitDiff presence/shape
 * §10 Language contract — "never verified"
 * §11 Cross-session memory — wingmanMemory shape + wingman-search-sessions
 * §12 Post-condition cleanup
 * §13 GitHub PAT management — wingman-github-pat-status, save, clear
 * §14 Verification results — report.verificationResults shape
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

  section("§1 Server reachability");
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

  section("§2 Pre-condition");
  if (initialState.wingman?.active) {
    console.log("  [cleanup] Sending wingman-end to clear existing session…");
    await sendCommand({ type: "wingman-end" });
    await new Promise((r) => setTimeout(r, 500));
  }
  const preState = await getState();
  check("wingman.active is false before test", preState.wingman?.active, false);
  check("wingman.session is null before test", preState.wingman?.session, null);

  // ── 3. Start a Wingman session ─────────────────────────────────────────────

  section("§3 wingman-start");
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

  section("§4 wingman-add-note");
  await sendCommand({ type: "wingman-add-note", content: "Webhook logs show 200 for test events" });
  await sendCommand({ type: "wingman-add-note", content: "Error event routing goes through EventBridge" });

  const notedState = await waitFor(
    (s) => (s.wingman?.session?.notes?.length ?? 0) >= 2,
    { label: "2 notes added", timeoutMs: 5_000 },
  );

  check("session has 2 notes", notedState.wingman?.session?.notes?.length, 2);
  check("first note content correct", notedState.wingman?.session?.notes?.[0]?.content, "Webhook logs show 200 for test events");
  check("note source is user", notedState.wingman?.session?.notes?.[0]?.source, "user");

  // ── 5. Terminal toggle ─────────────────────────────────────────────────────

  section("§5 Terminal toggle");
  await sendCommand({ type: "wingman-terminal-toggle" });

  const termOnState = await waitFor(
    (s) => s.wingman?.session?.terminalWatching === true,
    { label: "terminalWatching = true", timeoutMs: 3_000 },
  ).catch(() => null);

  if (termOnState) {
    check("terminalWatching becomes true after first toggle", termOnState.wingman?.session?.terminalWatching, true);
    check("terminalEvents is an array while watching", Array.isArray(termOnState.wingman?.session?.terminalEvents), true);

    // Toggle back off
    await sendCommand({ type: "wingman-terminal-toggle" });
    const termOffState = await waitFor(
      (s) => s.wingman?.session?.terminalWatching === false,
      { label: "terminalWatching = false", timeoutMs: 3_000 },
    ).catch(() => null);
    check("terminalWatching becomes false after second toggle", termOffState?.wingman?.session?.terminalWatching, false);
  } else {
    check("terminal toggle responded (timeout — Glass may not be running)", false, true);
  }

  // ── 6. Agent proxy state ────────────────────────────────────────────────────

  section("§6 Agent proxy state");
  const proxyCheckState = await getState();
  const ap = proxyCheckState.agentProxy;

  check("agentProxy exists on GlassState", ap !== undefined && ap !== null, true);
  check("agentProxy.running defaults to false", ap?.running, false);
  check("agentProxy.showConsentModal defaults to false", ap?.showConsentModal, false);
  check("agentProxy.port is a number", typeof ap?.port === "number", true);

  // Enable should trigger consent modal (not consented yet in a fresh test run)
  // NOTE: if consent was already granted in a previous run, proxy starts instead.
  await sendCommand({ type: "wingman-agent-proxy-enable" });
  await new Promise((r) => setTimeout(r, 400));
  const afterEnableState = await getState();
  const afterAp = afterEnableState.agentProxy;

  const eitherConsentOrRunning = afterAp?.showConsentModal === true || afterAp?.running === true;
  check(
    "enabling proxy shows consent modal (or starts if already consented)",
    eitherConsentOrRunning,
    true,
  );

  // Disable clears whatever state enable set
  await sendCommand({ type: "wingman-agent-proxy-disable" });
  await new Promise((r) => setTimeout(r, 400));
  const afterDisableState = await getState();
  const disAp = afterDisableState.agentProxy;

  check("proxy.running is false after disable", disAp?.running, false);
  check("proxy.showConsentModal is false after disable", disAp?.showConsentModal, false);

  // ── 7. New v0.5.0 session fields ────────────────────────────────────────────

  section("§7 v0.5.0 session fields");
  const sessionFieldState = await getState();
  const sess = sessionFieldState.wingman?.session;

  check("session.agentCalls is an array", Array.isArray(sess?.agentCalls), true);
  check("session.terminalEvents is an array", Array.isArray(sess?.terminalEvents), true);
  check("session.terminalWatching is a boolean", typeof sess?.terminalWatching === "boolean", true);

  // ── 8. End session ─────────────────────────────────────────────────────────

  section("§8 wingman-end + report generation");
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

  section("§9 Report structure (v0.5.0)");
  const report = reportState.wingman?.report;

  if (!report) {
    check("report generated (AI may be unavailable)", false, true);
    console.log("  NOTE: Report not generated — this is expected if Glass has no AI connection.");
  } else {
    // Core fields (unchanged)
    check("report.goal matches session goal", report.goal, testGoal);
    check("report.summary is a non-empty string", typeof report.summary === "string" && report.summary.length > 0, true);
    check("report.notVerified is non-empty array", Array.isArray(report.notVerified) && report.notVerified.length > 0, true);
    check("report.observedOnly is non-empty array", Array.isArray(report.observedOnly) && report.observedOnly.length > 0, true);
    check("report.appsUsed is an array", Array.isArray(report.appsUsed), true);
    check("report.duration is positive number", typeof report.duration === "number" && report.duration > 0, true);

    // v0.5.0 — new fields
    check("report.agentCalls is an array", Array.isArray(report.agentCalls), true);
    check("report.terminalEvents is an array (or undefined)", report.terminalEvents === undefined || Array.isArray(report.terminalEvents), true);

    // gitDiff — only present when a git repo was active during the session
    if (report.gitDiff !== undefined) {
      check("report.gitDiff.filesChanged is an array", Array.isArray(report.gitDiff.filesChanged), true);
      check("report.gitDiff.totalInsertions is a number", typeof report.gitDiff.totalInsertions === "number", true);
      check("report.gitDiff.totalDeletions is a number", typeof report.gitDiff.totalDeletions === "number", true);
      check("report.gitDiff.scopeHint is a valid value", ["on-track","possible-drift","significant-drift","unknown"].includes(report.gitDiff.scopeHint), true);
    } else {
      console.log("  (report.gitDiff is undefined — no git repo active during QA session, as expected)");
    }

    // agentCalls shape — if any calls were intercepted
    if (report.agentCalls?.length > 0) {
      const call = report.agentCalls[0];
      check("agentCalls[0].id is a string", typeof call.id === "string", true);
      check("agentCalls[0].model is a string", typeof call.model === "string", true);
      check("agentCalls[0].userMessageSnippet is a string", typeof call.userMessageSnippet === "string", true);
      check("agentCalls[0].responseSnippet is a string", typeof call.responseSnippet === "string", true);
      check("agentCalls[0].hasToolUse is a boolean", typeof call.hasToolUse === "boolean", true);
      check("agentCalls[0].toolNames is an array", Array.isArray(call.toolNames), true);
      // Privacy contract: no full API key fields should exist
      check("agentCalls[0] has no apiKey field", "apiKey" in call, false);
      check("agentCalls[0] has no authorization field", "authorization" in call, false);
    } else {
      console.log("  (no agentCalls in this session — proxy was not active)");
    }

    // ── §10 Language contract: "never verified" ────────────────────────────────

    section("§10 Language contract: 'never verified'");
    const allReportText = [
      report.summary,
      ...(report.keyFindings ?? []),
      ...(report.observedOnly ?? []),
      ...(report.notVerified ?? []),
    ].join(" ");

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

    const observedLanguagePresent =
      allReportText.toLowerCase().includes("observed") ||
      allReportText.toLowerCase().includes("appears") ||
      allReportText.toLowerCase().includes("visible") ||
      allReportText.toLowerCase().includes("cannot confirm") ||
      allReportText.toLowerCase().includes("not independently");

    check("report uses observed/appears language", observedLanguagePresent, true);
  }

  // ── §11 Cross-session memory ───────────────────────────────────────────────

  section("§11 Cross-session memory");
  const memStateInitial = await getState();
  const mem = memStateInitial.wingmanMemory;

  check("wingmanMemory exists on GlassState", mem !== undefined && mem !== null, true);
  check("wingmanMemory.totalSessions is a number", typeof mem?.totalSessions === "number", true);
  check("wingmanMemory.loading is a boolean", typeof mem?.loading === "boolean", true);
  check("wingmanMemory.searchResults is an array", Array.isArray(mem?.searchResults), true);
  check("wingmanMemory.totalSessions > 0 (at least this session was saved)", (mem?.totalSessions ?? 0) > 0, true);

  // Trigger a search
  await sendCommand({ type: "wingman-search-sessions", query: "payment webhook" });
  await new Promise((r) => setTimeout(r, 1_000));
  const memSearchState = await getState();
  const memSearch = memSearchState.wingmanMemory;

  check("search completes (loading = false)", memSearch?.loading, false);
  check("searchResults is an array after search", Array.isArray(memSearch?.searchResults), true);

  if (memSearch?.searchResults?.length > 0) {
    const rec = memSearch.searchResults[0];
    check("searchResult[0].id is a string", typeof rec.id === "string", true);
    check("searchResult[0].goal is a string", typeof rec.goal === "string", true);
    check("searchResult[0].duration is a number", typeof rec.duration === "number", true);
    check("searchResult[0].summary is a string", typeof rec.summary === "string", true);
  } else {
    console.log("  (no matching sessions found in memory — index may be empty on first run)");
  }

  // ── §12 Post-condition ─────────────────────────────────────────────────────

  section("§12 Post-condition cleanup");
  const finalState = await getState();
  check("wingman.active remains false after QA", finalState.wingman?.active, false);
  check("agentProxy.running is false after QA", finalState.agentProxy?.running, false);

  // ── §13 GitHub PAT management ──────────────────────────────────────────────

  section("§13 GitHub PAT management");

  // §13.1 — wingman-github-pat-status returns GitHubPATState shape
  const patStatusRes = await sendCommand({ type: "wingman-github-pat-status" });
  const patState = patStatusRes?.data ?? patStatusRes;
  check("wingman-github-pat-status responds", patState !== undefined, true);
  check("githubPATState.configured is boolean", typeof patState?.configured === "boolean", true);
  check("githubPATState.tokenInvalid is boolean", typeof patState?.tokenInvalid === "boolean", true);

  // §13.2 — GlassState.githubPATConfigured is boolean
  const patGlassState = await getState();
  check("GlassState.githubPATConfigured is boolean", typeof patGlassState?.githubPATConfigured === "boolean", true);

  // §13.3 — wingman-github-pat-save doesn't crash Glass (token validation is in the UI)
  //   Server accepts the token and attempts safeStorage write; we just verify Glass stays responsive.
  await sendCommand({ type: "wingman-github-pat-save", token: "github_pat_QA_placeholder_token" });
  const postSaveState = await getState();
  check("Glass remains responsive after wingman-github-pat-save", postSaveState !== null, true);

  // §13.4 — wingman-github-pat-clear succeeds without throwing
  const clearRes = await sendCommand({ type: "wingman-github-pat-clear" });
  check("wingman-github-pat-clear responds without error", clearRes !== undefined, true);

  // §13.5 — After clear, GlassState.githubPATConfigured is false
  const postClearState = await getState();
  check("githubPATConfigured is false after clear", postClearState?.githubPATConfigured, false);

  // ── §14 Verification results ───────────────────────────────────────────────

  section("§14 Verification results");

  // §14 uses the report from §9 (if we have one stored in the report variable)
  if (report != null) {
    if (report.verificationResults) {
      check("verificationResults.results is an array", Array.isArray(report.verificationResults.results), true);
      check("verificationResults.verifiedCount is a number", typeof report.verificationResults.verifiedCount === "number", true);
      check("verificationResults.contradictedCount is a number", typeof report.verificationResults.contradictedCount === "number", true);
      if (report.verificationResults.results.length > 0) {
        const vr = report.verificationResults.results[0];
        check("verificationResult[0].claim is a string", typeof vr.claim === "string", true);
        check("verificationResult[0].verdict is ok|warn|fail", ["ok", "warn", "fail"].includes(vr.verdict), true);
      }
    } else {
      console.log("  (verificationResults not present — requires at least one inspection with claim detection)");
    }
  } else {
    console.log("  (no report available — §14 skipped)");
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log("");
  console.log("══════════════════════════════════════");
  console.log(`  Wingman QA v0.5.0: ${passed} passed  /  ${failed} failed`);
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

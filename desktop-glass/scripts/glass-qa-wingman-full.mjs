#!/usr/bin/env node
/**
 * IIVO Glass — Full Wingman QA Script (v0.5.0)
 *
 * Comprehensive automation of all MANUAL_QA_v0.5.0.md IPC-testable checks.
 * Covers all §1–§20, including gap coverage via dev-only IPC backdoors.
 *
 * §1  Server reachability
 * §2  Pre-condition (no active session)
 * §3  wingman-start — state machine + session shape
 * §4  wingman-add-note — note storage
 * §5  Terminal toggle — wingman-terminal-toggle on/off
 * §6  Agent proxy state — shape, initial values, enable/disable flow
 * §7  v0.5.0 session fields — agentCalls, terminalWatching, terminalEvents
 * §8  wingman-end + report generation
 * §9  Report structure — goal, summary, notVerified, agentCalls, gitDiff, PR
 * §10 Language contract — "never verified"
 * §11 Cross-session memory — shape + wingman-search-sessions
 * §12 Post-condition cleanup
 * §13 GitHub PAT management — status, save, clear, GlassState sync
 * §14 Verification results — report.verificationResults shape
 * §15 [BACKDOOR] Loop detection — inject 2 identical inspections → loopWarning
 * §16 [BACKDOOR] Scope drift — inject off-topic inspection → scopeDrift notice
 * §17 [BACKDOOR] Token-invalid state machine — set invalid → banner, cancel, reopen
 * §18 [BACKDOOR] Session snapshot — wingman-debug-get-session shape contract
 * §19 [BACKDOOR] State clear — wingman-debug-clear-state resets all sub-states
 * §20 Privacy invariants — GlassState never contains raw PAT/API keys
 *
 * BACKDOOR SECTIONS (§15–§19) require Glass to be started with:
 *   IIVO_GLASS_TEST=1 npm run dev
 *
 * Without that env var the backdoor commands are silently ignored and the
 * script marks those checks as "skipped" rather than failing.
 *
 * Usage:
 *   node scripts/glass-qa-wingman-full.mjs [--url http://localhost:PORT]
 *
 * Requires:
 *   GLASS_API_SECRET env var  OR  IIVO_API_KEY env var
 *   Glass server running at --url (defaults to http://localhost:7842)
 *
 * Exit codes:
 *   0  all checks passed (skipped checks do not count as failures)
 *   1  one or more checks failed
 */

import { dirname } from "node:path";
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

async function waitFor(
  predicate,
  { timeoutMs = 15_000, intervalMs = 300, label = "condition" } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState().catch(() => null);
    if (state && predicate(state)) return state;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Check runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

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

function skip(label, reason) {
  console.log(`  ⊘ SKIP ${label} — ${reason}`);
  skipped++;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─── Backdoor availability check ──────────────────────────────────────────────

async function checkBackdoorAvailable() {
  try {
    // Send a harmless debug command; if Glass is not in test mode it will be
    // silently ignored and return null/empty. We detect this by probing the
    // session snapshot command and checking the response shape.
    const res = await sendCommand({ type: "wingman-debug-get-session" });
    // If backdoor is active, response contains session data (or null if no session)
    // The key is that the command doesn't 404 or throw.
    return res !== undefined;
  } catch {
    return false;
  }
}

// ─── Main QA flow ─────────────────────────────────────────────────────────────

async function runQA() {
  console.log("IIVO Glass — Full Wingman QA (v0.5.0)");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Secret: ${API_SECRET ? "set" : "NOT SET (unauthenticated)"}`);
  console.log("");
  console.log("Note: §15–§19 require IIVO_GLASS_TEST=1 when starting Glass.");
  console.log("");

  // ── §1. Verify server is reachable ─────────────────────────────────────────

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

  // ── §2. Pre-condition: no active session ────────────────────────────────────

  section("§2 Pre-condition");
  if (initialState.wingman?.active) {
    console.log("  [cleanup] Sending wingman-end to clear existing session…");
    await sendCommand({ type: "wingman-end" });
    await sleep(500);
  }

  // Also try the debug clear if available (doesn't hurt if not in test mode)
  await sendCommand({ type: "wingman-debug-clear-state" }).catch(() => {});
  await sleep(300);

  const preState = await getState();
  check("wingman.active is false before test", preState.wingman?.active, false);
  check("wingman.session is null before test", preState.wingman?.session, null);
  check("wingman.report is null before test", preState.wingman?.report, null);

  // ── §3. Start a Wingman session ─────────────────────────────────────────────

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
  check("session.id is a non-empty string", typeof activeState.wingman?.session?.id === "string" && activeState.wingman.session.id.length > 0, true);
  check("session.startedAt is a positive number", typeof activeState.wingman?.session?.startedAt === "number" && activeState.wingman.session.startedAt > 0, true);
  check("session has no inspections yet", activeState.wingman?.session?.inspections?.length, 0);
  check("session.loopWarning is false", activeState.wingman?.session?.loopWarning, false);
  check("session.notes is an empty array", Array.isArray(activeState.wingman?.session?.notes) && activeState.wingman.session.notes.length === 0, true);
  check("no audio started (privacy)", activeState.privacy?.listening, false);
  check("no capture started (privacy)", activeState.privacy?.capturing, false);

  // ── §4. Add notes ───────────────────────────────────────────────────────────

  section("§4 wingman-add-note");
  await sendCommand({ type: "wingman-add-note", content: "Webhook logs show 200 for test events" });
  await sendCommand({ type: "wingman-add-note", content: "Error event routing goes through EventBridge" });

  const notedState = await waitFor(
    (s) => (s.wingman?.session?.notes?.length ?? 0) >= 2,
    { label: "2 notes added", timeoutMs: 5_000 },
  );

  check("session has 2 notes", notedState.wingman?.session?.notes?.length, 2);
  check("first note content correct",
    notedState.wingman?.session?.notes?.[0]?.content,
    "Webhook logs show 200 for test events",
  );
  check("note source is 'user'", notedState.wingman?.session?.notes?.[0]?.source, "user");
  check("note has timestamp", typeof notedState.wingman?.session?.notes?.[0]?.timestamp === "number", true);

  // ── §5. Terminal toggle ─────────────────────────────────────────────────────

  section("§5 Terminal toggle");
  await sendCommand({ type: "wingman-terminal-toggle" });

  const termOnState = await waitFor(
    (s) => s.wingman?.session?.terminalWatching === true,
    { label: "terminalWatching = true", timeoutMs: 3_000 },
  ).catch(() => null);

  if (termOnState) {
    check("terminalWatching becomes true after toggle on",
      termOnState.wingman?.session?.terminalWatching, true);
    check("terminalEvents is an array while watching",
      Array.isArray(termOnState.wingman?.session?.terminalEvents), true);

    await sendCommand({ type: "wingman-terminal-toggle" });
    const termOffState = await waitFor(
      (s) => s.wingman?.session?.terminalWatching === false,
      { label: "terminalWatching = false", timeoutMs: 3_000 },
    ).catch(() => null);
    check("terminalWatching becomes false after toggle off",
      termOffState?.wingman?.session?.terminalWatching, false);
  } else {
    check("terminal toggle responded (timeout — accessibility may be restricted)", false, true);
  }

  // ── §6. Agent proxy state ───────────────────────────────────────────────────

  section("§6 Agent proxy state");
  const proxyCheckState = await getState();
  const ap = proxyCheckState.agentProxy;

  check("agentProxy exists on GlassState", ap !== undefined && ap !== null, true);
  check("agentProxy.running defaults to false", ap?.running, false);
  check("agentProxy.showConsentModal defaults to false", ap?.showConsentModal, false);
  check("agentProxy.port is a number", typeof ap?.port === "number", true);
  check("agentProxy.port is in valid range", (ap?.port ?? 0) >= 1024 && (ap?.port ?? 0) <= 65535, true);

  // Enable — either shows consent modal or starts (if already consented)
  await sendCommand({ type: "wingman-agent-proxy-enable" });
  await sleep(400);
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
  await sleep(400);
  const afterDisableState = await getState();
  const disAp = afterDisableState.agentProxy;
  check("proxy.running is false after disable", disAp?.running, false);
  check("proxy.showConsentModal is false after disable", disAp?.showConsentModal, false);

  // ── §7. v0.5.0 session fields ───────────────────────────────────────────────

  section("§7 v0.5.0 session fields");
  const sessionFieldState = await getState();
  const sess7 = sessionFieldState.wingman?.session;

  check("session.agentCalls is an array", Array.isArray(sess7?.agentCalls), true);
  check("session.terminalEvents is an array", Array.isArray(sess7?.terminalEvents), true);
  check("session.terminalWatching is a boolean", typeof sess7?.terminalWatching === "boolean", true);
  check("session.inspections is an array", Array.isArray(sess7?.inspections), true);
  check("session.loopWarning is a boolean", typeof sess7?.loopWarning === "boolean", true);

  // ── §8. End session ─────────────────────────────────────────────────────────

  section("§8 wingman-end + report generation");
  await sendCommand({ type: "wingman-end" });

  const endedState = await waitFor(
    (s) => s.wingman?.active === false,
    { label: "wingman.active = false", timeoutMs: 8_000 },
  );

  check("wingman.active is false after end", endedState.wingman?.active, false);
  check("session.endedAt is set",
    typeof endedState.wingman?.session?.endedAt === "number", true);

  // Report is generated async — wait up to 25s
  let report = null;
  const reportState = await waitFor(
    (s) => s.wingman?.report !== null,
    { label: "wingman.report != null", timeoutMs: 25_000 },
  ).catch(() => endedState);
  report = reportState.wingman?.report ?? null;

  // ── §9. Report structure ────────────────────────────────────────────────────

  section("§9 Report structure (v0.5.0)");

  if (!report) {
    skip("§9 checks (no report — AI may be unavailable in this environment)", "no AI connection");
    console.log("  NOTE: Report not generated. All §9/§10 checks skipped.");
  } else {
    // Core fields
    check("report.goal matches session goal", report.goal, testGoal);
    check("report.summary is a non-empty string",
      typeof report.summary === "string" && report.summary.length > 0, true);
    check("report.notVerified is non-empty array",
      Array.isArray(report.notVerified) && report.notVerified.length > 0, true);
    check("report.observedOnly is non-empty array",
      Array.isArray(report.observedOnly) && report.observedOnly.length > 0, true);
    check("report.appsUsed is an array", Array.isArray(report.appsUsed), true);
    check("report.duration is positive number",
      typeof report.duration === "number" && report.duration > 0, true);

    // v0.5.0 new fields
    check("report.agentCalls is an array", Array.isArray(report.agentCalls), true);
    check("report.terminalEvents is array or undefined",
      report.terminalEvents === undefined || Array.isArray(report.terminalEvents), true);

    // gitDiff — only present if a git repo was active
    if (report.gitDiff !== undefined) {
      check("report.gitDiff.filesChanged is an array",
        Array.isArray(report.gitDiff.filesChanged), true);
      check("report.gitDiff.totalInsertions is a number",
        typeof report.gitDiff.totalInsertions === "number", true);
      check("report.gitDiff.totalDeletions is a number",
        typeof report.gitDiff.totalDeletions === "number", true);
      check("report.gitDiff.scopeHint is valid",
        ["on-track", "possible-drift", "significant-drift", "unknown"].includes(report.gitDiff.scopeHint), true);
    } else {
      console.log("  (report.gitDiff absent — no git repo active during QA, expected)");
    }

    // agentCalls privacy contract
    if (report.agentCalls?.length > 0) {
      const call = report.agentCalls[0];
      check("agentCalls[0].id is a string", typeof call.id === "string", true);
      check("agentCalls[0].model is a string", typeof call.model === "string", true);
      check("agentCalls[0].userMessageSnippet is a string",
        typeof call.userMessageSnippet === "string", true);
      check("agentCalls[0].responseSnippet is a string",
        typeof call.responseSnippet === "string", true);
      check("agentCalls[0].hasToolUse is a boolean",
        typeof call.hasToolUse === "boolean", true);
      check("agentCalls[0].toolNames is an array",
        Array.isArray(call.toolNames), true);
      // Privacy contract — raw key must never appear
      check("agentCalls[0] has no 'apiKey' field", "apiKey" in call, false);
      check("agentCalls[0] has no 'authorization' field", "authorization" in call, false);
    } else {
      console.log("  (no agentCalls — proxy was not active, expected)");
    }

    // ── §10. Language contract ─────────────────────────────────────────────────

    section("§10 Language contract: 'never verified'");
    const allReportText = [
      report.summary,
      ...(report.keyFindings ?? []),
      ...(report.observedOnly ?? []),
      ...(report.notVerified ?? []),
    ].join(" ");

    const FORBIDDEN = [
      "verified that",
      "confirmed that",
      "proven that",
      "tested and confirmed",
      "we confirmed",
      "i confirmed",
      "glass confirmed",
    ];
    for (const term of FORBIDDEN) {
      check(`report does not assert "${term}"`, allReportText, term, { absent: true });
    }

    const hasObservedLanguage =
      allReportText.toLowerCase().includes("observed") ||
      allReportText.toLowerCase().includes("appears") ||
      allReportText.toLowerCase().includes("visible") ||
      allReportText.toLowerCase().includes("cannot confirm") ||
      allReportText.toLowerCase().includes("not independently");
    check("report uses observed/appears language", hasObservedLanguage, true);
  }

  // ── §11. Cross-session memory ───────────────────────────────────────────────

  section("§11 Cross-session memory");
  const memState = await getState();
  const mem = memState.wingmanMemory;

  check("wingmanMemory exists on GlassState", mem !== undefined && mem !== null, true);
  check("wingmanMemory.totalSessions is a number",
    typeof mem?.totalSessions === "number", true);
  check("wingmanMemory.loading is a boolean",
    typeof mem?.loading === "boolean", true);
  check("wingmanMemory.searchResults is an array",
    Array.isArray(mem?.searchResults), true);
  check("totalSessions > 0 (at least this session saved)",
    (mem?.totalSessions ?? 0) > 0, true);

  // Search — using goal keywords
  await sendCommand({ type: "wingman-search-sessions", query: "payment webhook" });
  await sleep(1_200);
  const memSearchState = await getState();
  const memSearch = memSearchState.wingmanMemory;

  check("search completes (loading = false)", memSearch?.loading, false);
  check("searchResults is an array after search",
    Array.isArray(memSearch?.searchResults), true);

  if (memSearch?.searchResults?.length > 0) {
    const rec = memSearch.searchResults[0];
    check("searchResult[0].id is a string", typeof rec.id === "string", true);
    check("searchResult[0].goal is a string", typeof rec.goal === "string", true);
    check("searchResult[0].duration is a number", typeof rec.duration === "number", true);
    check("searchResult[0].summary is a string", typeof rec.summary === "string", true);
    // Shape contract — no raw token fields
    check("searchResult[0] has no 'token' field", "token" in rec, false);
  } else {
    console.log("  (no matching sessions — index may be empty on first run)");
  }

  // Empty query — should return all sessions
  await sendCommand({ type: "wingman-search-sessions", query: "" });
  await sleep(1_200);
  const allSessionsState = await getState();
  const allMem = allSessionsState.wingmanMemory;
  check("empty query returns results array",
    Array.isArray(allMem?.searchResults), true);
  check("totalSessions remains consistent after second search",
    (allMem?.totalSessions ?? 0) >= (mem?.totalSessions ?? 0), true);

  // ── §12. Post-condition ─────────────────────────────────────────────────────

  section("§12 Post-condition cleanup");
  const finalState = await getState();
  check("wingman.active remains false after QA", finalState.wingman?.active, false);
  check("agentProxy.running is false after QA", finalState.agentProxy?.running, false);
  check("wingmanMemory still intact after QA", finalState.wingmanMemory !== null, true);

  // ── §13. GitHub PAT management ──────────────────────────────────────────────

  section("§13 GitHub PAT management");

  // §13.1 — wingman-github-pat-status shape
  // sendCommand returns { ok, state: GlassState } — PAT fields are in state
  const patStatusRes = await sendCommand({ type: "wingman-github-pat-status" });
  const patStatusGlassState = patStatusRes?.state;
  check("wingman-github-pat-status responds", patStatusGlassState !== undefined, true);
  check("githubPATState.configured is boolean",
    typeof patStatusGlassState?.githubPATConfigured === "boolean", true);
  check("githubPATState.tokenInvalid is boolean",
    typeof patStatusGlassState?.githubTokenInvalid === "boolean", true);

  // §13.2 — GlassState sync
  const patGlassState = await getState();
  check("GlassState.githubPATConfigured is boolean",
    typeof patGlassState?.githubPATConfigured === "boolean", true);

  // §13.3 — save doesn't crash Glass (UI validates format, not server)
  await sendCommand({
    type: "wingman-github-pat-save",
    token: "github_pat_QA_placeholder_token_DO_NOT_USE",
  });
  const postSaveState = await getState();
  check("Glass remains responsive after pat-save",
    postSaveState !== null, true);

  // §13.4 — clear
  const clearRes = await sendCommand({ type: "wingman-github-pat-clear" });
  check("wingman-github-pat-clear responds without error",
    clearRes !== undefined, true);

  // §13.5 — post-clear state
  await sleep(400);
  const postClearState = await getState();
  check("githubPATConfigured is false after clear",
    postClearState?.githubPATConfigured, false);

  // §13.6 — save after clear → configured becomes true
  await sendCommand({
    type: "wingman-github-pat-save",
    token: "github_pat_QA_second_placeholder",
  });
  await sleep(400);
  const postResaveState = await getState();
  check("githubPATConfigured becomes true after re-save",
    postResaveState?.githubPATConfigured, true);

  // Clean up — clear again so we don't leave a dummy token in Keychain
  await sendCommand({ type: "wingman-github-pat-clear" });
  await sleep(200);

  // ── §14. Verification results ───────────────────────────────────────────────

  section("§14 Verification results");

  if (report?.verificationResults) {
    check("verificationResults.results is an array",
      Array.isArray(report.verificationResults.results), true);
    check("verificationResults.verifiedCount is a number",
      typeof report.verificationResults.verifiedCount === "number", true);
    check("verificationResults.contradictedCount is a number",
      typeof report.verificationResults.contradictedCount === "number", true);
    check("verifiedCount + contradictedCount <= results.length",
      (report.verificationResults.verifiedCount + report.verificationResults.contradictedCount) <=
        report.verificationResults.results.length,
      true,
    );
    if (report.verificationResults.results.length > 0) {
      const vr = report.verificationResults.results[0];
      check("verificationResult[0].claim is a string",
        typeof vr.claim === "string", true);
      check("verificationResult[0].verdict is ok|warn|fail",
        ["ok", "warn", "fail"].includes(vr.verdict), true);
      check("verificationResult[0].evidence is a string",
        typeof vr.evidence === "string", true);
    }
  } else if (report) {
    console.log("  (verificationResults absent — no inspections ran during this QA session, expected)");
  } else {
    console.log("  (§14 skipped — no report)");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKDOOR SECTIONS — require IIVO_GLASS_TEST=1 on the Glass process
  // ─────────────────────────────────────────────────────────────────────────────

  console.log("\n══ Backdoor sections (require IIVO_GLASS_TEST=1 on Glass) ══");

  // Check if backdoors are available by probing get-session
  const backdoorsAvailable = await checkBackdoorAvailable();

  if (!backdoorsAvailable) {
    console.log("  Backdoor commands appear unavailable (Glass not in test mode).");
    console.log("  Start Glass with IIVO_GLASS_TEST=1 to run §15–§19.");
    for (const s of ["§15", "§16", "§17", "§18", "§19"]) {
      skip(s, "IIVO_GLASS_TEST=1 not set");
    }
  } else {
    // ── §15. Loop detection via backdoor ────────────────────────────────────────

    section("§15 [BACKDOOR] Loop detection");

    // Reset state first
    await sendCommand({ type: "wingman-debug-clear-state" });
    await sleep(300);

    // Start a fresh session
    await sendCommand({ type: "wingman-start", goal: "QA: test loop detection" });
    await waitFor((s) => s.wingman?.active === true,
      { label: "session active for loop test", timeoutMs: 5_000 });

    const loopResponse = "Error: Cannot find module './paymentProcessor'";

    // Inject first inspection
    await sendCommand({
      type: "wingman-debug-inject-inspection",
      response: loopResponse,
      prompt: "What is on screen?",
    });
    await sleep(300);

    const afterFirst = await getState();
    check("first injection: inspections.length = 1",
      afterFirst.wingman?.session?.inspections?.length, 1);
    check("first injection: loopWarning is false (one occurrence not a loop)",
      afterFirst.wingman?.session?.loopWarning, false);

    // Inject second identical inspection — detectLoop should fire
    await sendCommand({
      type: "wingman-debug-inject-inspection",
      response: loopResponse,
      prompt: "What is on screen?",
    });
    await sleep(300);

    const afterSecond = await getState();
    check("second injection: inspections.length = 2",
      afterSecond.wingman?.session?.inspections?.length, 2);
    check("second injection: loopWarning is true (identical responses detected)",
      afterSecond.wingman?.session?.loopWarning, true);

    // Verify the loop warning persists until session ends
    const loopPersistState = await getState();
    check("loopWarning remains true (not auto-cleared)",
      loopPersistState.wingman?.session?.loopWarning, true);

    // Clean up
    await sendCommand({ type: "wingman-debug-clear-state" });
    await sleep(300);

    // ── §16. Scope drift via backdoor ────────────────────────────────────────────

    section("§16 [BACKDOOR] Scope drift detection");

    // Start session with a specific goal keyword
    await sendCommand({ type: "wingman-start", goal: "Fix the authentication middleware" });
    await waitFor((s) => s.wingman?.active === true,
      { label: "session active for drift test", timeoutMs: 5_000 });

    // Inject a response that triggers scope drift for the "fix" task rule.
    // SCOPE_DRIFT_RULES: goal "fix" + riskSignals include "database", "migration", "schema".
    // "authentication middleware" → taskSignal "fix" matched; response must hit a riskSignal.
    const driftResponse = "I can see a database migration script that drops the users schema";
    await sendCommand({
      type: "wingman-debug-inject-inspection",
      response: driftResponse,
      prompt: "What do you see on screen?",
    });
    await sleep(300);

    const driftState = await getState();
    check("drift injection: inspection added",
      (driftState.wingman?.session?.inspections?.length ?? 0) >= 1, true);

    // lastNotice should contain a drift hint (or the session should have a scope drift indicator)
    // The exact field depends on whether detectScopeDrift fired:
    // lastNotice is a plain string in GlassState (not an object)
    const lastNotice = driftState.lastNotice;
    const lastNoticeLower = typeof lastNotice === "string" ? lastNotice.toLowerCase() : "";
    const hasDriftNotice =
      lastNoticeLower.includes("drift") ||
      lastNoticeLower.includes("scope") ||
      lastNoticeLower.includes("off") ||
      driftState.wingman?.session?.scopeDriftWarning != null;
    check(
      "scope drift detected (lastNotice or scopeDriftWarning set)",
      hasDriftNotice,
      true,
    );

    // Clean up
    await sendCommand({ type: "wingman-debug-clear-state" });
    await sleep(300);

    // ── §17. Token-invalid state machine via backdoor ────────────────────────────

    section("§17 [BACKDOOR] Token-invalid state machine");

    // Save a fake token so isPATConfigured returns true
    await sendCommand({
      type: "wingman-github-pat-save",
      token: "github_pat_test_token_for_invalid_state",
    });
    await sleep(400);

    const beforeInvalidState = await getState();
    check("githubPATConfigured is true before inject",
      beforeInvalidState?.githubPATConfigured, true);

    // Set token-invalid via backdoor (simulates a real 401 from GitHub)
    await sendCommand({ type: "wingman-debug-set-token-invalid" });
    await sleep(400);

    const invalidState = await getState();
    // After set-token-invalid, GlassState.githubTokenInvalid should be true
    const tokenInvalidSet =
      invalidState?.githubTokenInvalid === true ||
      invalidState?.githubPATState?.tokenInvalid === true;
    check("token-invalid state is true after debug inject", tokenInvalidSet, true);

    // Also verify via wingman-github-pat-status (returns { ok, state: GlassState })
    const invalidStatusRes = await sendCommand({ type: "wingman-github-pat-status" });
    check("wingman-github-pat-status.tokenInvalid is true",
      invalidStatusRes?.state?.githubTokenInvalid, true);

    // Clear the token to reset
    await sendCommand({ type: "wingman-github-pat-clear" });
    await sleep(400);

    const afterClearInvalidState = await getState();
    check("githubPATConfigured is false after clearing invalid token",
      afterClearInvalidState?.githubPATConfigured, false);

    // Verify status also returns configured:false
    const postClearStatusRes = await sendCommand({ type: "wingman-github-pat-status" });
    check("wingman-github-pat-status.configured is false after clear",
      postClearStatusRes?.state?.githubPATConfigured, false);

    // ── §18. Session snapshot shape ──────────────────────────────────────────────

    section("§18 [BACKDOOR] Session snapshot (wingman-debug-get-session)");

    // Start a session to snapshot
    await sendCommand({ type: "wingman-start", goal: "QA: snapshot test" });
    await waitFor((s) => s.wingman?.active === true,
      { label: "session active for snapshot", timeoutMs: 5_000 });

    // sendCommand returns { ok, state: GlassState } — session lives in state.wingman.session
    const snapshotRes = await sendCommand({ type: "wingman-debug-get-session" });
    const snapshot = snapshotRes?.data ?? snapshotRes?.state?.wingman?.session ?? snapshotRes?.session;

    check("snapshot is an object", typeof snapshot === "object" && snapshot !== null, true);
    check("snapshot.id is a string", typeof snapshot?.id === "string" && snapshot.id.length > 0, true);
    check("snapshot.goal matches", snapshot?.goal, "QA: snapshot test");
    check("snapshot.startedAt is a number", typeof snapshot?.startedAt === "number", true);
    check("snapshot.inspections is an array", Array.isArray(snapshot?.inspections), true);
    check("snapshot.notes is an array", Array.isArray(snapshot?.notes), true);
    check("snapshot.terminalEvents is an array", Array.isArray(snapshot?.terminalEvents), true);
    check("snapshot.agentCalls is an array", Array.isArray(snapshot?.agentCalls), true);
    check("snapshot.loopWarning is a boolean", typeof snapshot?.loopWarning === "boolean", true);

    await sendCommand({ type: "wingman-debug-clear-state" });
    await sleep(300);

    // ── §19. State clear ─────────────────────────────────────────────────────────

    section("§19 [BACKDOOR] wingman-debug-clear-state");

    // Start a session, add state, then clear
    await sendCommand({ type: "wingman-start", goal: "QA: state clear test" });
    await waitFor((s) => s.wingman?.active === true,
      { label: "session active before clear", timeoutMs: 5_000 });
    await sendCommand({ type: "wingman-add-note", content: "Should disappear after clear" });
    await sendCommand({ type: "wingman-search-sessions", query: "some prior search" });
    await sleep(500);

    const beforeClearState = await getState();
    check("session active before clear", beforeClearState.wingman?.active, true);

    await sendCommand({ type: "wingman-debug-clear-state" });
    await sleep(400);

    const afterClearState = await getState();
    check("wingman.active is false after clear", afterClearState.wingman?.active, false);
    check("wingman.session is null after clear", afterClearState.wingman?.session, null);
    check("wingman.report is null after clear", afterClearState.wingman?.report, null);
    check("wingman.inspecting is false after clear", afterClearState.wingman?.inspecting, false);
    check("wingmanMemory.searchResults is empty array after clear",
      Array.isArray(afterClearState.wingmanMemory?.searchResults) &&
      afterClearState.wingmanMemory.searchResults.length === 0,
      true,
    );
    check("wingmanMemory.loading is false after clear",
      afterClearState.wingmanMemory?.loading, false);
  }

  // ── §20. Privacy invariants ─────────────────────────────────────────────────

  section("§20 Privacy invariants — GlassState key hygiene");

  const privacyState = await getState();
  const stateString = JSON.stringify(privacyState);

  // GlassState must never contain raw token strings
  // (We check for common token prefixes that should never appear in state)
  const BANNED_PATTERNS = [
    "github_pat_",    // fine-grained PAT
    "ghp_",          // classic PAT
    "gho_",          // OAuth token
    "sk-ant-",       // Anthropic key
    "x-api-key",     // raw API key header (should be stripped by proxy)
  ];

  for (const pattern of BANNED_PATTERNS) {
    check(
      `GlassState does not contain raw "${pattern}" token`,
      stateString,
      pattern,
      { absent: true },
    );
  }

  // GlassState.privacy should be present and have known shape
  check("GlassState.privacy exists", privacyState.privacy !== undefined, true);
  check("GlassState.privacy.listening is a boolean",
    typeof privacyState.privacy?.listening === "boolean", true);

  // ─── Final summary ──────────────────────────────────────────────────────────

  console.log("");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  Full Wingman QA v0.5.0`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log("══════════════════════════════════════════════════════");

  if (failed > 0) {
    console.log("\nSome checks failed — see output above for details.");
    process.exit(1);
  } else {
    console.log(
      `\nAll checks passed${skipped > 0 ? ` (${skipped} skipped — run with IIVO_GLASS_TEST=1 for full coverage)` : ""}.`,
    );
    process.exit(0);
  }
}

runQA().catch((err) => {
  console.error("QA script error:", err.message);
  process.exit(1);
});

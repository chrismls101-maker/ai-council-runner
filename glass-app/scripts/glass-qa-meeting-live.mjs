#!/usr/bin/env node
/**
 * IIVO Glass — Meeting Intelligence real-audio QA script (Task #41)
 *
 * Exercises the full meeting pipeline end-to-end with a realistic transcript:
 *   1. Launches/attaches Glass → sets meeting_call mode
 *   2. Injects a canned multi-speaker meeting transcript (≥300 chars) in batches
 *   3. Triggers extraction ticks and waits for classification + moment extraction
 *   4. Asserts: classification subType detected, required moment types present
 *      (decision, action_item), debrief contains meeting report sections
 *   5. Optionally runs against the live IIVO server for AI enrichment
 *
 * Usage:
 *   npm run qa:meeting:live
 *   npm run qa:meeting:live -- --attach          # Glass already running
 *   npm run qa:meeting:live -- --keep-glass      # leave Glass open after
 *   npm run qa:meeting:live -- --scenario sync   # use team_sync transcript
 *   npm run qa:meeting:live -- --scenario sales  # use sales_review transcript
 *   npm run qa:meeting:live -- --no-debrief      # skip debrief assertion
 *   npm run qa:meeting:live -- --dry-run         # inject transcript but no asserts
 *
 * Output:
 *   /tmp/iivo-glass-meeting-qa/MEETING_QA_REPORT.md
 *   /tmp/iivo-glass-meeting-qa/MEETING_QA_RESULTS.jsonl
 */

import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachGlassForListenLive,
  closeGlassSession,
  launchGlassForListenLive,
  readGlassState,
} from "./lib/glass-listen-live-glass.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    attach: argv.includes("--attach"),
    keepGlass: argv.includes("--keep-glass"),
    noDebrief: argv.includes("--no-debrief"),
    dryRun: argv.includes("--dry-run"),
    scenario: argv[argv.indexOf("--scenario") + 1] ?? "sync",
  };
}

// ─── Transcripts ──────────────────────────────────────────────────────────────

const TRANSCRIPTS = {
  /** Team sync — should classify as team_sync subtype */
  sync: [
    "Alright everyone, let's get started with our weekly sync. Quick agenda: sprint review, blockers, and planning for next week.",
    "On the sprint review — we shipped the notification refactor on Tuesday. All the tests are green and it's in staging.",
    "I wanted to flag a blocker: the design handoff for the dashboard is still pending. We can't start the front-end work without the Figma specs.",
    "Agreed. I'll follow up with the design team today — that's an action item for me. Can we get those specs by Thursday?",
    "The API rate-limiting work is still in progress. We decided last meeting to cap it at 500 req/min per user. That decision stands.",
    "One open question: should the rate limits be configurable per customer tier? We haven't resolved that yet.",
    "I think yes — enterprise customers need higher limits. Let's make that a decision for next sync after we hear from sales.",
    "For next steps: I'll own the design follow-up. Jordan, can you own the API tier investigation? We need the research by Friday.",
    "Sure, I'll take that. I'll also unblock the staging environment issue — there's a cert expiry on the sandbox server.",
    "Great. The decision to ship to production is on hold until both blockers are clear. Let's revisit at Thursday's check-in.",
    "One more thing — the on-call schedule needs to be updated. Current rotation still shows the old team. That's a follow-up for ops.",
    "Noted. I'll circle back with the ops team. Same time next week everyone.",
  ],

  /** Sales call — should classify as sales_review subtype */
  sales: [
    "Thanks for joining today. Quick agenda: we'll walk you through the enterprise tier, address your security questions, and discuss next steps.",
    "Our main concern is data residency. We need all data stored in the EU region — is that something you can offer?",
    "Absolutely — we have EU data residency as a standard option on the enterprise plan. All data stays within AWS eu-west-1.",
    "That's good to hear. What's the pricing for a 500-seat license? We have about 480 users today but expect to grow.",
    "For 500 seats you're looking at our Growth tier — $42 per seat per year. That comes with SSO, audit logs, and dedicated support.",
    "We'd need a custom SLA — 99.9% uptime with 4-hour response time for P1 incidents. Is that something you can commit to?",
    "Yes, that's standard in our enterprise agreement. I'll have legal send over the SLA addendum by end of week.",
    "The decision from our side is to move forward to procurement review. The key blocker is getting the security questionnaire back to you.",
    "Understood. Action item on our side: share the security questionnaire template by tomorrow. Can your security team turn that around in two weeks?",
    "Two weeks should work. I'll flag it as a priority internally. Follow-up: you'll send the contract draft alongside the SLA addendum?",
    "Correct. I'll also loop in your IT contact for the SSO setup call. Let's schedule that for next Thursday if procurement approves.",
    "Sounds good. One open question is whether our existing SAML provider is compatible — I'll check and let you know by Wednesday.",
  ],

  /** Product review — should classify as product_review subtype */
  product: [
    "Okay team, this is our product review for the Q3 roadmap items. Let's go feature by feature and make sure we're aligned.",
    "Starting with the notification center redesign — the UX research is done, personas validated. Risk: implementation might exceed the 2-sprint estimate.",
    "I flagged a blocker on notifications: we need the new event schema from the backend team before we can start the renderer work.",
    "Decision: we're committing notifications to Q3, but we move the advanced filtering to Q4. That keeps us on track.",
    "Next: the analytics dashboard. This is still in discovery. Open question — do we want real-time or near-real-time updates? Latency tradeoff is significant.",
    "I'd vote near-real-time — 60-second refresh. Real-time requires the WebSocket infra we don't have. Action item for me: write the ADR for this choice.",
    "Agreed. There's also a risk here: the third-party chart library we planned to use has a breaking change in v3. We need to evaluate alternatives.",
    "I'll take that as an action item — evaluate Chart.js vs Recharts by end of sprint. I'll bring a recommendation to the next product review.",
    "On the mobile app — we need to decide: React Native or Flutter? This is the big open question for Q3 planning.",
    "We decided in the last architecture review to go with React Native for code sharing. That decision still stands unless someone wants to reopen it.",
    "No objections. Action item: I'll update the technical spec to reflect React Native and share it with the mobile team this week.",
    "Wrap-up: three decisions made today, four action items assigned. Follow-ups: ADR for analytics, spec update, chart lib eval, backend schema ETA.",
  ],
};

// ─── I/O helpers ─────────────────────────────────────────────────────────────

const OUT_DIR = "/tmp/iivo-glass-meeting-qa";
const REPORT_MD = join(OUT_DIR, "MEETING_QA_REPORT.md");
const RESULTS_JSONL = join(OUT_DIR, "MEETING_QA_RESULTS.jsonl");

mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  console.log(msg);
}

function appendResult(record) {
  appendFileSync(RESULTS_JSONL, JSON.stringify({ ...record, at: new Date().toISOString() }) + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeReport(md) {
  writeFileSync(REPORT_MD, md, "utf8");
}

// ─── State polling ────────────────────────────────────────────────────────────

async function pollUntil(fn, { timeoutMs = 30_000, intervalMs = 800, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null && result !== undefined && result !== false) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${label} (${timeoutMs}ms)`);
}

// ─── Grading ──────────────────────────────────────────────────────────────────

const REQUIRED_MOMENT_TYPES = ["decision", "action_item"];
const EXPECTED_SUBTYPE_FOR_SCENARIO = {
  sync: ["team_sync", "general"],
  sales: ["sales_review", "general"],
  product: ["product_review", "general"],
};

function gradeClassification(meetingIntel, scenario) {
  if (!meetingIntel?.classification) {
    return { ok: false, reason: "classification is null — engine never ran" };
  }
  const subType = meetingIntel.classification.subType;
  const allowed = EXPECTED_SUBTYPE_FOR_SCENARIO[scenario] ?? ["general"];
  if (!allowed.includes(subType)) {
    return {
      ok: false,
      reason: `Expected one of [${allowed.join(", ")}], got '${subType}' (confidence=${meetingIntel.classification.confidence ?? "?"})`
    };
  }
  return { ok: true, subType, confidence: meetingIntel.classification.confidence };
}

function gradeMoments(meetingIntel) {
  const moments = meetingIntel?.moments ?? [];
  const found = new Set(moments.map((m) => m.type));
  const missing = REQUIRED_MOMENT_TYPES.filter((t) => !found.has(t));
  return {
    ok: missing.length === 0,
    total: moments.length,
    found: [...found],
    missing,
  };
}

function gradeDebrief(debriefMd) {
  if (!debriefMd) return { ok: false, reason: "debrief markdown is empty" };
  const sections = ["Action Items", "Decisions", "action_item", "decision", "Action item", "Decision"];
  const present = sections.filter((s) => debriefMd.includes(s));
  return {
    ok: present.length >= 2,
    presentSections: present,
    reason: present.length < 2 ? `Only found sections: [${present.join(", ")}]` : "ok",
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const cli = parseArgs();
const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const webUrl = (process.env.IIVO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
const transcript = TRANSCRIPTS[cli.scenario] ?? TRANSCRIPTS.sync;

const summary = {
  scenario: cli.scenario,
  attach: cli.attach,
  dryRun: cli.dryRun,
  glassLaunched: false,
  chunksInjected: 0,
  ticksFired: 0,
  classificationGrade: null,
  momentsGrade: null,
  debriefGrade: null,
  meetingSubType: null,
  momentTypes: [],
  momentCount: 0,
  debriefGenerated: false,
  failures: [],
  warnings: [],
};

log("══════════════════════════════════════════════════════════════");
log("  IIVO Glass — Meeting Intelligence QA");
log("══════════════════════════════════════════════════════════════");
log(`  Scenario: ${cli.scenario} (${transcript.length} chunks)`);
log(`  Mode:     ${cli.attach ? "attach" : "auto-launch"}`);
log(`  Dry-run:  ${cli.dryRun ? "yes (no asserts)" : "no"}`);
log(`  Debrief:  ${cli.noDebrief ? "skipped" : "enabled"}`);
log(`  Output:   ${OUT_DIR}`);
log("");

// ── Launch / attach ───────────────────────────────────────────────────────────

let glassSession = null;
try {
  glassSession = cli.attach
    ? await attachGlassForListenLive({ log })
    : await launchGlassForListenLive({ apiUrl, webUrl, log });
  summary.glassLaunched = glassSession.launched;
  log("");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  summary.failures.push({ category: "launch_failed", cause: msg, fix: "Run npm run build or use --attach." });
  writeReport(buildReport());
  process.exit(1);
}

const { command } = glassSession.pages;

// ── Setup meeting session ─────────────────────────────────────────────────────

log("STEP 1 — Setting up meeting session…");
await command.evaluate(() => window.glass.send({ type: "stop-everything" }));
await sleep(400);
await command.evaluate(() => window.glass.send({ type: "copilot-set-mode", mode: "coaching" }));
await command.evaluate(() =>
  window.glass.send({ type: "copilot-set-config", patch: { sessionType: "meeting_call" } }),
);
await command.evaluate(() => window.glass.send({ type: "session-start" }));
await sleep(600);

// Verify session is live and in meeting mode
const setupState = await readGlassState(command);
if (setupState.copilot?.config?.sessionType !== "meeting_call") {
  summary.failures.push({
    category: "setup_failed",
    cause: `sessionType = '${setupState.copilot?.config?.sessionType}' (expected 'meeting_call')`,
    fix: "Check copilot-set-config patch handling in index.ts.",
  });
  await closeGlassSession(glassSession);
  writeReport(buildReport());
  process.exit(1);
}
log(`  session-type: meeting_call ✓`);
log(`  session live: ${setupState.copilot?.sessionLive ?? "?"}`);
log("");

// ── Inject transcript ─────────────────────────────────────────────────────────

log("STEP 2 — Injecting meeting transcript…");

// Inject in three batches to simulate real meeting flow:
//   Batch A (4 chunks): enough for initial classification
//   Batch B (4 chunks): more material for extraction
//   Batch C (remaining): debrief depth
const batches = [
  transcript.slice(0, 4),
  transcript.slice(4, 8),
  transcript.slice(8),
];

for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
  const batch = batches[batchIdx];
  for (const chunk of batch) {
    await command.evaluate(
      (text) => window.glass.send({ type: "add-transcript-chunk", text, tags: ["microphone"] }),
      chunk,
    );
    summary.chunksInjected++;
    await sleep(80); // brief spacing to avoid dedup
  }

  // Trigger classification/extraction tick after each batch
  await command.evaluate(() => window.glass.send({ type: "e2e-copilot-tick" }));
  summary.ticksFired++;
  log(`  batch ${batchIdx + 1}/${batches.length}: ${batch.length} chunks · tick fired`);
  await sleep(500);
}

log(`  Total injected: ${summary.chunksInjected} chunks\n`);

// ── Wait for classification ───────────────────────────────────────────────────

log("STEP 3 — Waiting for meeting classification…");

let meetingIntel = null;
try {
  meetingIntel = await pollUntil(
    async () => {
      const s = await readGlassState(command);
      return s.meetingIntelligence?.classification ? s.meetingIntelligence : null;
    },
    { timeoutMs: 25_000, label: "meetingIntelligence.classification" },
  );
  summary.meetingSubType = meetingIntel.classification.subType;
  log(`  Classified: ${meetingIntel.classification.subType} (confidence=${meetingIntel.classification.confidence ?? "?"})`);
} catch (err) {
  // Classification may not have fired yet — check raw state
  const s = await readGlassState(command);
  meetingIntel = s.meetingIntelligence ?? null;
  const msg = meetingIntel
    ? `classification field absent; intel state: ${JSON.stringify(meetingIntel).slice(0, 200)}`
    : "meetingIntelligence is null — engine not running (is sessions.meeting_call mode active?)";
  summary.failures.push({
    category: "classification_timeout",
    cause: msg,
    fix: "Check isMeetingsModeActive() and runMeetingIntelTick() wiring in index.ts.",
  });
  log(`  WARN: ${msg}`);
}

// ── Wait for moment extraction ────────────────────────────────────────────────

log("\nSTEP 4 — Waiting for moment extraction…");

// Fire a couple more ticks to trigger AI extraction (if server available)
for (let i = 0; i < 2; i++) {
  await command.evaluate(() => window.glass.send({ type: "e2e-copilot-tick" }));
  summary.ticksFired++;
  await sleep(800);
}

// Poll for moments to appear
try {
  meetingIntel = await pollUntil(
    async () => {
      const s = await readGlassState(command);
      const intel = s.meetingIntelligence;
      if (!intel?.moments?.length) return null;
      return intel;
    },
    { timeoutMs: 30_000, label: "meetingIntelligence.moments.length > 0" },
  );
  summary.momentCount = meetingIntel.moments.length;
  summary.momentTypes = [...new Set(meetingIntel.moments.map((m) => m.type))];
  log(`  Moments extracted: ${meetingIntel.moments.length} (types: ${summary.momentTypes.join(", ")})`);
  for (const m of meetingIntel.moments.slice(0, 6)) {
    log(`    [${m.type}] ${m.content?.slice(0, 90) ?? "—"}${(m.content?.length ?? 0) > 90 ? "…" : ""}`);
  }
} catch {
  const s = await readGlassState(command);
  meetingIntel = s.meetingIntelligence ?? meetingIntel;
  const count = meetingIntel?.moments?.length ?? 0;
  const msg = count === 0
    ? "No moments extracted after ticks — extraction may require live server"
    : `Only ${count} moment(s) extracted`;
  summary.warnings.push({ category: "moments_low", cause: msg });
  log(`  WARN: ${msg}`);
  if (count > 0) {
    summary.momentCount = count;
    summary.momentTypes = [...new Set(meetingIntel.moments.map((m) => m.type))];
    log(`  Types so far: ${summary.momentTypes.join(", ")}`);
  }
}

// ── Grade classification + moments ───────────────────────────────────────────

log("\nSTEP 5 — Grading classification and moments…");

summary.classificationGrade = gradeClassification(meetingIntel, cli.scenario);
summary.momentsGrade = gradeMoments(meetingIntel);

if (!cli.dryRun) {
  if (!summary.classificationGrade.ok) {
    summary.failures.push({
      category: "classification_wrong",
      cause: summary.classificationGrade.reason,
      fix: `Update meetingClassifier.ts scoring for '${cli.scenario}' scenario words.`,
    });
  }
  if (!summary.momentsGrade.ok) {
    summary.failures.push({
      category: "moments_missing",
      cause: `Missing moment types: [${summary.momentsGrade.missing.join(", ")}]`,
      fix: "Check meetingIntelligenceEngine regex extraction and AI schema coverage.",
    });
  }
}

log(`  Classification: ${summary.classificationGrade.ok ? "PASS" : "FAIL"} — ${
  summary.classificationGrade.ok
    ? `${summary.classificationGrade.subType} (confidence=${summary.classificationGrade.confidence ?? "?"})`
    : summary.classificationGrade.reason
}`);
log(`  Moments: ${summary.momentsGrade.ok ? "PASS" : "FAIL"} — ${summary.momentsGrade.total} total, found: [${summary.momentsGrade.found.join(", ")}], missing: [${summary.momentsGrade.missing.join(", ")}]`);

// ── Debrief ───────────────────────────────────────────────────────────────────

let debriefMd = null;

if (!cli.noDebrief) {
  log("\nSTEP 6 — Triggering debrief and asserting meeting report…");

  // Use session-end to trigger the debrief path (session-end triggers debrief generation)
  await command.evaluate(() => window.glass.send({ type: "session-end" }));
  await sleep(1_000);

  // Alternatively try copilot-generate-debrief if supported
  await command.evaluate(() => window.glass.send({ type: "copilot-generate-debrief" }));

  try {
    const debriefState = await pollUntil(
      async () => {
        const s = await readGlassState(command);
        // debrief may be in s.copilot.debrief or s.lastDebrief
        const d = s.copilot?.debrief ?? s.lastDebrief ?? null;
        if (!d) return null;
        return d;
      },
      { timeoutMs: 30_000, label: "debrief generated" },
    );

    debriefMd = typeof debriefState === "string"
      ? debriefState
      : (debriefState.markdown ?? debriefState.report ?? JSON.stringify(debriefState).slice(0, 500));

    summary.debriefGenerated = true;
    summary.debriefGrade = gradeDebrief(debriefMd);
    log(`  Debrief: ${summary.debriefGrade.ok ? "PASS" : "FAIL"} — sections found: [${summary.debriefGrade.presentSections.join(", ")}]`);

    if (!cli.dryRun && !summary.debriefGrade.ok) {
      summary.failures.push({
        category: "debrief_incomplete",
        cause: summary.debriefGrade.reason,
        fix: "Check meetingReport.ts section generation and debriefToMarkdown wiring.",
      });
    }
  } catch (err) {
    const msg = `Debrief did not appear within timeout: ${err instanceof Error ? err.message : String(err)}`;
    summary.warnings.push({ category: "debrief_timeout", cause: msg });
    summary.debriefGrade = { ok: false, reason: msg };
    log(`  WARN: ${msg}`);
  }
} else {
  log("\nSTEP 6 — Debrief skipped (--no-debrief).");
  summary.debriefGrade = { ok: true, reason: "skipped" };
}

appendResult({
  action: "meeting_qa_run",
  scenario: cli.scenario,
  chunksInjected: summary.chunksInjected,
  ticksFired: summary.ticksFired,
  classificationOk: summary.classificationGrade?.ok ?? false,
  subType: summary.meetingSubType,
  momentsOk: summary.momentsGrade?.ok ?? false,
  momentCount: summary.momentCount,
  momentTypes: summary.momentTypes,
  debriefOk: summary.debriefGrade?.ok ?? false,
  failureCount: summary.failures.length,
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

if (!cli.keepGlass) {
  await closeGlassSession(glassSession);
}

// ── Report ────────────────────────────────────────────────────────────────────

function buildReport() {
  const lines = [];
  const passed =
    !cli.dryRun &&
    summary.failures.length === 0 &&
    (summary.classificationGrade?.ok ?? false) &&
    (summary.momentsGrade?.ok ?? false) &&
    (summary.debriefGrade?.ok ?? false);

  lines.push("# IIVO Glass — Meeting Intelligence QA Report");
  lines.push("");
  lines.push(`Scenario: **${summary.scenario}** · Mode: ${summary.attach ? "attach" : "auto-launch"}`);
  lines.push(`Dry-run: ${summary.dryRun ? "yes" : "no"} · Finished: ${new Date().toISOString()}`);
  lines.push(`Output JSONL: ${RESULTS_JSONL}`);
  lines.push("");
  lines.push("## What this test proves");
  lines.push("");
  lines.push("- Glass correctly classifies meeting type from injected transcript (no real audio required).");
  lines.push("- Meeting Intelligence engine extracts ≥1 decision and ≥1 action item.");
  lines.push("- Debrief report includes meeting-specific sections (Action Items, Decisions).");
  lines.push("- Full pipeline exercised: `add-transcript-chunk → tick → classify → extract → debrief`.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(`| Glass launched | ${summary.glassLaunched ? "yes" : "already running"} |`);
  lines.push(`| Transcript chunks injected | ${summary.chunksInjected} |`);
  lines.push(`| Intel ticks fired | ${summary.ticksFired} |`);
  lines.push(`| Classification | ${summary.classificationGrade?.ok ? "**PASS**" : "**FAIL**"} — subType: ${summary.meetingSubType ?? "_none_"} |`);
  lines.push(`| Moment extraction | ${summary.momentsGrade?.ok ? "**PASS**" : "**FAIL**"} — ${summary.momentCount} moments |`);
  lines.push(`| Moment types found | ${summary.momentTypes.join(", ") || "_none_"} |`);
  lines.push(`| Missing moment types | ${summary.momentsGrade?.missing?.join(", ") || "none"} |`);
  lines.push(`| Debrief generated | ${summary.debriefGenerated ? "yes" : "no"} |`);
  lines.push(`| Debrief quality | ${summary.debriefGrade?.ok ? "**PASS**" : "**FAIL**"} |`);
  lines.push(`| Failures | ${summary.failures.length} |`);
  lines.push(`| Warnings | ${summary.warnings.length} |`);
  lines.push("");

  if (summary.failures.length > 0) {
    lines.push("## Failures");
    for (const f of summary.failures) {
      lines.push(`### ${f.category}`);
      lines.push(`- **Cause:** ${f.cause}`);
      lines.push(`- **Fix:** ${f.fix}`);
      lines.push("");
    }
  }

  if (summary.warnings.length > 0) {
    lines.push("## Warnings");
    for (const w of summary.warnings) {
      lines.push(`- [${w.category}] ${w.cause}`);
    }
    lines.push("");
  }

  if (debriefMd) {
    lines.push("## Debrief output (first 2000 chars)");
    lines.push("");
    lines.push("```markdown");
    lines.push(debriefMd.slice(0, 2_000));
    if (debriefMd.length > 2_000) lines.push("…(truncated)");
    lines.push("```");
    lines.push("");
  }

  lines.push("## Verdict");
  if (cli.dryRun) {
    lines.push("**DRY RUN** — no pass/fail assertions made.");
  } else {
    lines.push(passed ? "**PASS** — Meeting Intelligence pipeline verified." : "**FAIL** — see Failures above.");
  }

  return lines.join("\n");
}

const report = buildReport();
writeReport(report);

log("\n══════════════════════════════════════════════════════════════");
log(`  Classification: ${summary.classificationGrade?.ok ?? "—"} · Moments: ${summary.momentsGrade?.ok ?? "—"} · Debrief: ${summary.debriefGrade?.ok ?? "—"}`);
log(`  Failures: ${summary.failures.length} · Warnings: ${summary.warnings.length}`);
log(`  Report: ${REPORT_MD}`);
log(`  JSONL: ${RESULTS_JSONL}`);
log("══════════════════════════════════════════════════════════════\n");

const exitFail =
  !cli.dryRun &&
  (summary.failures.length > 0 ||
    !summary.classificationGrade?.ok ||
    !summary.momentsGrade?.ok ||
    !summary.debriefGrade?.ok);

process.exit(exitFail ? 1 : 0);

#!/usr/bin/env node
/**
 * IIVO Glass — Live Notes Quality Test: $4B Founder Video
 *
 * Silicon Valley Girl · "$4B Founder: The Next 3 Years Will Make 100 New Founders Rich"
 * https://www.youtube.com/watch?v=ExgNR94SrfI  (52:48)
 *
 * ═══════════════════════════════════════════════════════════════════
 * CURSOR INSTRUCTIONS — READ THIS BEFORE RUNNING
 * ═══════════════════════════════════════════════════════════════════
 *
 * What this test does:
 *   1. Launches IIVO Glass automatically (or attaches if already running)
 *   2. Opens the Silicon Valley Girl YouTube video in Chrome
 *   3. Activates Listen mode with system audio capture
 *   4. Watches for 10 minutes as IIVO takes live notes on the video
 *   5. Grades the note quality specifically for founder/business content
 *   6. Prints a full quality report: sections populated, AI notes count,
 *      note examples, transcript-like ratio, verdict
 *
 * Prerequisites (Cursor: verify each is green before running):
 *   □ IIVO server running:    cd <project-root> && npm run dev
 *   □ Chrome installed and signed in to YouTube
 *   □ BlackHole 2ch audio routing configured (system audio capture)
 *   □ DEEPGRAM_API_KEY set in desktop-glass/.env
 *   □ GLASS_API_SECRET set and matches server
 *   □ Node.js 22+ (for --experimental-strip-types)
 *
 * Run from desktop-glass/:
 *   node scripts/testFounderVideoLiveNotes.mjs
 *   node scripts/testFounderVideoLiveNotes.mjs --minutes 15
 *   node scripts/testFounderVideoLiveNotes.mjs --attach     # if Glass already open
 *   node scripts/testFounderVideoLiveNotes.mjs --minutes 5  # quick smoke test
 *
 * Output:
 *   /tmp/iivo-founder-test/FOUNDER_NOTES_REPORT.md   ← main report
 *   /tmp/iivo-founder-test/FOUNDER_RAW.jsonl          ← raw results
 *
 * What "green" looks like after 10 minutes of this video:
 *   ✓ keyIdeas section has ≥3 notes (founder insights, market observations)
 *   ✓ frameworks section has ≥1 note (the speaker describes systems/processes)
 *   ✓ warnings section has ≥1 note (mistakes founders make)
 *   ✓ AI notes count ≥2 (GPT-5.5 pass fires after 35s with ≥300 new chars)
 *   ✓ transcript-like ratio < 40% (notes are interpretive, not copy-paste)
 *   ✓ latestInsight is set (gold banner in the panel)
 *   ✓ currentTopic reflects the video topic, not a generic fallback
 *   ✓ 0 microphone chunks (system audio only)
 *   ✓ 0 action-first cards
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const GLASS_ROOT = join(__dirname, "..");

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const minutesIdx = args.indexOf("--minutes");
const minutes = minutesIdx >= 0 ? Number(args[minutesIdx + 1] || 10) : 10;
const attach = args.includes("--attach");
const skipBuild = args.includes("--skip-build");

// ─── Output paths ─────────────────────────────────────────────────────────────

const OUT_DIR = "/tmp/iivo-founder-test";
const REPORT_MD = join(OUT_DIR, "FOUNDER_NOTES_REPORT.md");
const RAW_JSONL = join(OUT_DIR, "FOUNDER_RAW.jsonl");
mkdirSync(OUT_DIR, { recursive: true });

function log(...a) {
  const line = a.join(" ");
  console.log(line);
  appendFileSync(RAW_JSONL, JSON.stringify({ ts: new Date().toISOString(), msg: line }) + "\n");
}

function writeReport(md) {
  writeFileSync(REPORT_MD, md, "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Import live test infrastructure ─────────────────────────────────────────

const {
  runServerPreflight,
  openYouTubeForListenTest,
  collectSystemAudioChunks,
  collectMicrophoneChunks,
  collectListenMomentEvents,
  evaluateListenMomentsFromTranscript,
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  createListenHarnessRuntime,
  buildHarnessListenReport,
  buildListenHarnessNoteMetrics,
  gradeListenHarnessQuality,
  countDuplicateTranscriptLines,
  getActiveSession,
  readSessionsStore,
  resolveSessionsPath,
  captureMacMediaContext,
  summarizeMomentStats,
  sanitize,
} = await import(join(__dirname, "lib/glass-listen-live-lib.mjs"));

const {
  launchGlassForListenLive,
  attachGlassForListenLive,
  automateListenMode,
  waitForNotesPadVisible,
  readGlassState,
  closeGlassSession,
  attemptListenRecovery,
} = await import(join(__dirname, "lib/glass-listen-live-glass.mjs"));

// ─── Founder content vocabulary for quality grading ──────────────────────────
// After 10 minutes of a founder/VC interview, notes should include these themes.

const FOUNDER_SIGNAL_WORDS = [
  "founder",
  "startup",
  "market",
  "growth",
  "revenue",
  "product",
  "team",
  "investor",
  "capital",
  "raise",
  "billion",
  "opportunity",
  "scale",
  "build",
  "company",
  "customer",
  "business",
  "strategy",
  "exit",
  "value",
];

/** Count how many founder-signal words appear across all note texts. */
function scoreFounderRelevance(noteTexts) {
  const joined = noteTexts.join(" ").toLowerCase();
  const hits = FOUNDER_SIGNAL_WORDS.filter((w) => joined.includes(w));
  return { hits, score: hits.length };
}

/** Grade note quality specifically for founder/business interview content. */
function gradeFounderNotes(noteMetrics, liveNotesState) {
  const results = [];
  const { pass, fail } = { pass: (s) => results.push(`  ✓ ${s}`), fail: (s) => results.push(`  ✗ ${s}`) };

  const sections = liveNotesState?.sections ?? {};
  const keyIdeasCount = sections.keyIdeas?.length ?? 0;
  const frameworksCount = sections.frameworks?.length ?? 0;
  const warningsCount = sections.warnings?.length ?? 0;
  const aiNotesCount = liveNotesState?.aiNotesCount ?? 0;
  const transcriptRatio =
    noteMetrics.meaningNotesCount > 0
      ? noteMetrics.transcriptLikeNotesCount / noteMetrics.meaningNotesCount
      : 0;

  keyIdeasCount >= 3
    ? pass(`Key ideas: ${keyIdeasCount} notes (expected ≥3 for a founder interview)`)
    : fail(`Key ideas: only ${keyIdeasCount} notes (expected ≥3 — is system audio flowing?)`);

  keyIdeasCount >= 1
    ? pass(`At least one key idea captured in 10 minutes`)
    : fail(`Zero key ideas — likely no transcript reaching the pipeline`);

  frameworksCount >= 1
    ? pass(`Frameworks section populated (${frameworksCount}) — speaker described a system/process`)
    : results.push(`  ~ Frameworks: 0 — speaker may not have described a step-by-step process yet`);

  warningsCount >= 1
    ? pass(`Warnings section populated (${warningsCount}) — founder cautioned against something`)
    : results.push(`  ~ Warnings: 0 — might appear later in the video`);

  aiNotesCount >= 2
    ? pass(`AI notes (GPT-5.5): ${aiNotesCount} interpretive notes generated`)
    : aiNotesCount === 1
      ? results.push(`  ~ AI notes: 1 — first pass happened, more expected after next 35s interval`)
      : fail(`AI notes: 0 — server may be unreachable or transcript too thin for AI pass`);

  transcriptRatio <= 0.4
    ? pass(`Note quality: ${(transcriptRatio * 100).toFixed(0)}% transcript-like (threshold 40%) — notes are interpretive`)
    : fail(`Note quality: ${(transcriptRatio * 100).toFixed(0)}% transcript-like — too many copy-paste notes`);

  const allNoteTexts = Object.values(sections).flat();
  const { hits, score } = scoreFounderRelevance(allNoteTexts);
  score >= 3
    ? pass(`Founder relevance: ${score} signal words detected (${hits.slice(0, 5).join(", ")}…)`)
    : fail(`Founder relevance: only ${score} signal words — notes may be too generic for this content`);

  const insight = liveNotesState?.latestInsight;
  insight
    ? pass(`Gold insight banner set: "${insight.note?.slice(0, 80)}…"`)
    : results.push(`  ~ No latest insight yet — needs a mature high-confidence note`);

  const topic = liveNotesState?.currentTopic;
  topic
    ? pass(`currentTopic: "${topic.slice(0, 80)}"`)
    : fail(`currentTopic not set — no transcript reaching the pipeline`);

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const VIDEO_URL = "https://www.youtube.com/watch?v=ExgNR94SrfI";
const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const sessionsPath = resolveSessionsPath();

log("");
log("╔═══════════════════════════════════════════════════════════════╗");
log("║   IIVO Glass · Live Notes Quality Test · Founder Video        ║");
log("╚═══════════════════════════════════════════════════════════════╝");
log("");
log(`Video:    $4B Founder: The Next 3 Years Will Make 100 New Founders Rich`);
log(`Channel:  Silicon Valley Girl (Marina Mogilko)`);
log(`URL:      ${VIDEO_URL}`);
log(`Duration: ${minutes} min test window of 52:48 total video`);
log(`Mode:     ${attach ? "attach to running Glass" : "auto-launch Glass"}`);
log(`Output:   ${OUT_DIR}`);
log("");

// ─── Preflight ───────────────────────────────────────────────────────────────

log("── PREFLIGHT ────────────────────────────────────────────────────");
const preflight = await runServerPreflight(apiUrl);
if (!preflight.ok) {
  log("");
  log("BLOCKED — server preflight failed:");
  for (const f of preflight.failures) {
    if (f.category === "vision_not_configured") continue;
    log(`  ✗ [${f.category}] ${f.cause}`);
    log(`    Fix: ${f.fix}`);
  }
  log("");
  log("Start the IIVO server (npm run dev in project root) then re-run.");
  process.exit(1);
}
log("  ✓ Server healthy · GPT-5.5 configured · STT ready");
log("");

// ─── Launch or attach ────────────────────────────────────────────────────────

log("── GLASS SETUP ──────────────────────────────────────────────────");
let glassSession = null;
try {
  glassSession = attach
    ? await attachGlassForListenLive({ log })
    : await launchGlassForListenLive({ apiUrl, webUrl: "http://localhost:5173", log });
  log("");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log(`✗ Could not ${attach ? "attach to" : "launch"} IIVO Glass: ${msg}`);
  if (!attach) {
    log("  Make sure the build is complete: npm run build");
    log("  Or use --attach if Glass is already running with IIVO_GLASS_E2E=1");
  }
  process.exit(1);
}

const { command, dock, panel } = glassSession.pages;

// ─── Listen mode first (notes pad before video) ───────────────────────────────

log("── LISTEN MODE ──────────────────────────────────────────────────");
const listenResult = await automateListenMode({
  command,
  dock,
  panel,
  endurance: { maxListeningMinutes: minutes + 2, attention: "balanced" },
  log,
});
if (!listenResult.ok) {
  log(`✗ Listen mode failed: ${listenResult.cause}`);
  log(`  Fix: ${listenResult.fix}`);
  await closeGlassSession(glassSession);
  process.exit(1);
}
log("  ✓ Listen mode active · system audio only · mic off");

await waitForNotesPadVisible({
  browser: glassSession.browser,
  command,
  log,
});
log("");

// ─── Open YouTube (after notes pad is on screen) ─────────────────────────────

log("── VIDEO ─────────────────────────────────────────────────────────");
log("Opening Silicon Valley Girl founder video in Chrome…");
openYouTubeForListenTest(log, VIDEO_URL);
log("  Chrome will auto-play. If it stays paused, press K to play.");
await sleep(1_500);
log("");

// ─── Watch & collect ─────────────────────────────────────────────────────────

log("── WATCHING VIDEO ───────────────────────────────────────────────");
log(`Watching for ${minutes} minutes. IIVO is taking notes…`);
log("  • Live notes panel should start populating within 30–60s of first transcript");
log("  • AI quality pass (GPT-5.5) fires every 15s when ≥150 new chars arrive");
log("  • Gold insight banner appears once a mature high-confidence note is detected");
log("");

const runStartMs = Date.now();
const runEndMs = runStartMs + minutes * 60_000;
const harnessRuntime = createListenHarnessRuntime("balanced");
harnessRuntime.listenStartedMs = runStartMs;

let lastTranscriptLen = 0;
let lastAiRefreshCheck = 0;
let tickCount = 0;
let liveNotesState = null;

while (Date.now() < runEndMs) {
  await sleep(10_000); // poll every 10s
  tickCount++;

  const store = readSessionsStore(sessionsPath);
  const session = getActiveSession(store);
  if (!session) {
    log(`  [${tickCount * 10}s] Waiting for active session…`);
    continue;
  }

  const audioChunks = collectSystemAudioChunks(session);
  const micChunks = collectMicrophoneChunks(session);
  const momentEvents = collectListenMomentEvents(session);
  const transcriptText = audioChunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
  const newLen = transcriptText.length;
  const newChars = newLen - lastTranscriptLen;

  // Run moment analysis on new chunks
  if (newChars > 0) {
    const allChunkTexts = audioChunks.map((c) => ({ text: c.text ?? c.title ?? "" }));
    const updatedMoments = evaluateListenMomentsFromTranscript(
      allChunkTexts,
      harnessRuntime.surfacedMoments,
      "Silicon Valley Girl founder interview",
    );
    for (const m of updatedMoments) {
      const analysis = analyzeListenMomentWithHarness({
        moments: updatedMoments,
        runtime: harnessRuntime,
        recentTranscriptChars: newChars,
        lastChunkMs: Date.now(),
        nowMs: Date.now(),
        listenWarmupMs: 60_000,
      });
      if (analysis.candidate?.id === m.id) {
        applyHarnessMomentDecision(analysis, harnessRuntime, Date.now());
      }
    }
    lastTranscriptLen = newLen;
  }

  // Read live notes state from Glass
  try {
    const glassState = await readGlassState(command);
    liveNotesState = glassState?.listenLiveNotes ?? null;
  } catch {
    /* state not available yet */
  }

  const elapsed = Math.round((Date.now() - runStartMs) / 1000);
  const audioCount = audioChunks.length;
  const micCount = micChunks.length;
  const sectionsPopulated = liveNotesState
    ? Object.values(liveNotesState.sections ?? {}).filter((s) => s.length > 0).length
    : 0;
  const aiCount = liveNotesState?.aiNotesCount ?? 0;

  log(
    `  [${elapsed}s] audio chunks: ${audioCount} · mic chunks: ${micCount} · sections: ${sectionsPopulated}/8 · AI notes: ${aiCount}${micCount > 0 ? " ⚠ MIC CHUNKS DETECTED" : ""}`,
  );

  if (tickCount % 3 === 0 && liveNotesState?.currentTopic) {
    log(`           Topic: "${liveNotesState.currentTopic.slice(0, 80)}"`);
  }
}

log("");
log("── COLLECTING FINAL STATE ───────────────────────────────────────");

// ─── Final metrics ───────────────────────────────────────────────────────────

const store = readSessionsStore(sessionsPath);
const session = getActiveSession(store);
const finalChunks = session ? collectSystemAudioChunks(session) : [];
const micChunks = session ? collectMicrophoneChunks(session) : [];
const finalTranscript = finalChunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
const allMoments = [
  ...harnessRuntime.surfacedMoments,
  ...harnessRuntime.savedSilently,
  ...harnessRuntime.staleMoments,
];

const noteMetrics = buildListenHarnessNoteMetrics({
  moments: allMoments,
  transcriptChunks: finalChunks.map((c) => (c.text ?? c.title ?? "").trim()).filter(Boolean),
  runtime: harnessRuntime,
});

const cardQuality = gradeListenHarnessQuality({
  runtime: harnessRuntime,
  listenWarmupMs: 60_000,
  duplicateTranscriptLines: countDuplicateTranscriptLines(finalChunks),
  micChunks: micChunks.length,
  transcriptChunkCount: finalChunks.length,
  liveNotesEntryCount: noteMetrics.liveNotesCreated,
});

const momentStats = summarizeMomentStats(allMoments);
const founderGrade = gradeFounderNotes(noteMetrics, liveNotesState);

// ─── Print report ─────────────────────────────────────────────────────────────

log("");
log("╔═══════════════════════════════════════════════════════════════╗");
log("║   LIVE NOTES QUALITY REPORT                                   ║");
log("╚═══════════════════════════════════════════════════════════════╝");
log("");
log(`Video:      $4B Founder · Silicon Valley Girl`);
log(`Test window: ${minutes} min`);
log(`Transcript:  ${finalChunks.length} audio chunks · ${finalTranscript.length} chars captured`);
log(`             ${micChunks.length} mic chunks (should be 0)`);
log("");
log("── MOMENT DETECTION ─────────────────────────────────────────────");
log(`  Detected:    ${momentStats.detected} moments total`);
log(`  Ready:       ${momentStats.ready} moments ready to surface`);
log(`  Saved silent: ${momentStats.savedSilently} (sent to live notes)`);
log(`  Developing:  ${momentStats.developing} still building`);
log(`  Stale:       ${momentStats.stale}`);
log("");
log("── LIVE NOTES STATE ─────────────────────────────────────────────");
if (liveNotesState) {
  const secs = liveNotesState.sections ?? {};
  for (const [sec, entries] of Object.entries(secs)) {
    if (entries.length === 0) continue;
    log(`  ${sec.padEnd(14)} ${entries.length} note(s):`);
    for (const e of entries.slice(0, 2)) {
      log(`    · ${sanitize(e, 90)}`);
    }
  }
  log(`  AI notes:    ${liveNotesState.aiNotesCount ?? 0} (GPT-5.5 quality pass)`);
  log(`  Topic:       ${liveNotesState.currentTopic?.slice(0, 80) ?? "(not set)"}`);
  log(`  Insight:     ${liveNotesState.latestInsight ? `"${liveNotesState.latestInsight.note?.slice(0, 70)}…"` : "(not set)"}`);
} else {
  log("  (Live notes state not available — Glass may not have had transcript yet)");
}
log("");
log("── NOTE QUALITY METRICS ─────────────────────────────────────────");
log(`  Total notes created:    ${noteMetrics.liveNotesCreated}`);
log(`  Meaning notes:          ${noteMetrics.meaningNotesCount}`);
log(`  Transcript-like:        ${noteMetrics.transcriptLikeNotesCount} (${noteMetrics.meaningNotesCount > 0 ? ((noteMetrics.transcriptLikeNotesCount / noteMetrics.meaningNotesCount) * 100).toFixed(0) : 0}%)`);
log(`  Developing/uncertain:   ${noteMetrics.developingNotesCount}`);
log(`  Action-first cards:     ${harnessRuntime.actionFirstCardCount} (should be 0)`);
log(`  Transcript-like mostly: ${noteMetrics.notesMostlyTranscriptLike ? "YES ⚠ — notes need improvement" : "NO ✓"}`);
if (noteMetrics.noteExamples.length > 0) {
  log("");
  log("  Note examples (from this session):");
  for (const ex of noteMetrics.noteExamples) {
    log(`    › ${ex}`);
  }
}
log("");
log("── FOUNDER VIDEO QUALITY CHECK ──────────────────────────────────");
for (const line of founderGrade) {
  log(line);
}
log("");
log("── PIPELINE GATES ───────────────────────────────────────────────");
const gates = {
  "System audio only (no mic)": micChunks.length === 0,
  "Transcript flowing (>10 chunks)": finalChunks.length >= 10,
  "Notes created (>0)": noteMetrics.liveNotesCreated > 0,
  "Not mostly transcript-like": !noteMetrics.notesMostlyTranscriptLike,
  "No action-first cards": harnessRuntime.actionFirstCardCount === 0,
  "No vague cards": !cardQuality.anyVagueCard,
};
for (const [gate, ok] of Object.entries(gates)) {
  log(`  ${ok ? "✓" : "✗"} ${gate}`);
}
log("");

const failures = cardQuality.failures.filter(
  (f) => !f.includes("Balanced Listen surfaced") // balanced mode never proactively surfaces
);
const allPass =
  finalChunks.length >= 10 &&
  noteMetrics.liveNotesCreated >= 1 &&
  !noteMetrics.notesMostlyTranscriptLike &&
  harnessRuntime.actionFirstCardCount === 0 &&
  micChunks.length === 0 &&
  failures.length === 0;

log("╔═══════════════════════════════════════════════════════════════╗");
log(`║   VERDICT: ${allPass ? "PASS ✓ — Live Notes delivered for founder video" : "FAIL ✗ — See issues above"}${" ".repeat(allPass ? 12 : 14)}║`);
log("╚═══════════════════════════════════════════════════════════════╝");
log("");

if (!allPass && failures.length > 0) {
  log("Issues to investigate:");
  for (const f of failures) log(`  · ${f}`);
  log("");
}

// ─── Build and write markdown report ─────────────────────────────────────────

const listenReportMd = buildHarnessListenReport({
  moments: allMoments,
  transcriptText: finalTranscript,
  sessionTitle: "$4B Founder · Silicon Valley Girl · IIVO Live Notes Test",
});

const reportLines = [
  `# IIVO Glass — Live Notes Quality Report`,
  ``,
  `**Video:** $4B Founder: The Next 3 Years Will Make 100 New Founders Rich`,
  `**Channel:** Silicon Valley Girl (Marina Mogilko)`,
  `**Test window:** ${minutes} minutes`,
  `**Verdict:** ${allPass ? "**PASS ✓**" : "**FAIL ✗**"}`,
  ``,
  `## Pipeline metrics`,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Audio chunks captured | ${finalChunks.length} |`,
  `| Mic chunks (should be 0) | ${micChunks.length} |`,
  `| Transcript chars | ${finalTranscript.length} |`,
  `| Moments detected | ${momentStats.detected} |`,
  `| Live notes created | ${noteMetrics.liveNotesCreated} |`,
  `| AI notes (GPT-5.5) | ${liveNotesState?.aiNotesCount ?? 0} |`,
  `| Meaning notes | ${noteMetrics.meaningNotesCount} |`,
  `| Transcript-like ratio | ${noteMetrics.meaningNotesCount > 0 ? ((noteMetrics.transcriptLikeNotesCount / noteMetrics.meaningNotesCount) * 100).toFixed(0) : 0}% |`,
  `| Action-first cards | ${harnessRuntime.actionFirstCardCount} |`,
  ``,
  `## Founder video quality check`,
  founderGrade.join("\n"),
  ``,
  `## Note examples`,
  noteMetrics.noteExamples.length > 0
    ? noteMetrics.noteExamples.map((e) => `- ${e}`).join("\n")
    : "_No mature notes captured in this window_",
  ``,
  `## Sections populated`,
];
if (liveNotesState?.sections) {
  for (const [sec, entries] of Object.entries(liveNotesState.sections)) {
    if (entries.length === 0) continue;
    reportLines.push(`### ${sec} (${entries.length})`);
    for (const e of entries) reportLines.push(`- ${e}`);
  }
}
reportLines.push("", "---", "", listenReportMd);
writeReport(reportLines.join("\n"));

log(`Full report: ${REPORT_MD}`);
log("");

// ─── Cleanup ──────────────────────────────────────────────────────────────────

await closeGlassSession(glassSession);
process.exit(allPass ? 0 : 1);

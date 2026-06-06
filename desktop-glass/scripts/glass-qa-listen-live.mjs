#!/usr/bin/env node
/**
 * IIVO Glass — Live Listen mode QA (real product workflow).
 *
 * Proves: screen/media context → system_audio transcript → moment intelligence →
 * quiet/surface logic → context-aware GPT-5.5 answers → Listen Report.
 *
 * Does NOT fake transcript chunks or call simulated context "real audio".
 *
 * Usage:
 *   npm run glass:qa:listen:live
 *   npm run glass:qa:listen:live -- --minutes 60
 *   npm run glass:qa:listen:live -- --attach --minutes 60   # Glass already running (IIVO_GLASS_E2E=1)
 *   npm run glass:qa:listen:live -- --manual --minutes 60    # legacy: you click everything
 *   npm run glass:qa:listen:live -- --keep-glass             # leave Glass open after test
 *
 * Output:
 *   /tmp/iivo-glass-listen-live/LISTEN_LIVE_RESULTS.jsonl
 *   /tmp/iivo-glass-listen-live/LISTEN_LIVE_REPORT.md
 *   /tmp/iivo-glass-listen-live/LISTEN_REPORT.md
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync } from "node:fs";
import { shouldRetryLiveAsk } from "./lib/glass-live-ask-retry.mjs";
import {
  OUT_DIR,
  RESULTS_JSONL,
  REPORT_MD,
  LISTEN_REPORT_MD,
  parseListenLiveArgs,
  resolveSessionsPath,
  readSessionsStore,
  getActiveSession,
  collectSystemAudioChunks,
  collectMicrophoneChunks,
  collectListenMomentEvents,
  evaluateListenMomentsFromChunks,
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  createListenHarnessRuntime,
  pickContextAwareQuestion,
  buildHarnessListenReport,
  gradeListenLiveAnswer,
  gradeMediaExtraction,
  runServerPreflight,
  sessionHasRawAudioOrBase64,
  summarizeMomentStats,
  gradeListenHarnessQuality,
  buildListenHarnessNoteMetrics,
  countDuplicateTranscriptLines,
  LISTEN_INTERRUPT_QA_QUESTIONS,
  buildListenLiveAskSession,
  captureMacMediaContext,
  mediaContextFromSession,
  openYouTubeForListenTest,
  appendResult,
  writeReport,
  sleep,
  sanitize,
  formatEnduranceConfig,
  effectiveMaxListeningMinutes,
  validateEnduranceConfig,
  diagnoseFailure,
} from "./lib/glass-listen-live-lib.mjs";
import {
  automateListenMode,
  attachGlassForListenLive,
  closeGlassSession,
  launchGlassForListenLive,
  printSetupInstructions,
  readGlassState,
  attemptListenRecovery,
} from "./lib/glass-listen-live-glass.mjs";

const cli = parseListenLiveArgs();
const {
  minutes,
  manual,
  attach,
  keepGlass,
  warmupSeconds,
  attention,
  realAudioRequired,
  failOnMicChunks,
  failOnDuplicateTranscriptSpam,
  recordAnswers,
  recordThoughts,
  videoUrl,
  autoFix,
} = cli;

console.log(formatEnduranceConfig(cli));
console.log("");

const enduranceValidation = validateEnduranceConfig(cli);
for (const w of enduranceValidation.warnings) console.warn(`WARN: ${w}`);
if (!enduranceValidation.ok) {
  for (const e of enduranceValidation.errors) console.error(`BLOCKED: ${e}`);
  process.exit(1);
}

const effectiveMaxListeningMin = effectiveMaxListeningMinutes(cli);
const listenWarmupMs =
  warmupSeconds != null ? warmupSeconds * 1000 : cli.warmupMinutes * 60_000;
const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const sessionsPath = resolveSessionsPath();
const runStarted = Date.now();
const runEnds = runStarted + minutes * 60_000;
const harnessRuntime = createListenHarnessRuntime(attention);

const summary = {
  preflightOk: false,
  glassAutomated: !manual,
  glassLaunched: false,
  listenModeActivated: false,
  realSystemAudio: false,
  screenContextCaptured: false,
  mediaSourceType: "unknown",
  extractedTitle: null,
  extractedChannel: null,
  extractedUrl: videoUrl ?? null,
  expectedVideoUrl: videoUrl ?? null,
  extractedDuration: null,
  mediaExtractionNotes: [],
  transcriptChunks: 0,
  transcriptSource: "none",
  micStayedOff: true,
  micChunks: 0,
  voiceModeDetected: false,
  momentsDetected: 0,
  momentsDeveloping: 0,
  momentsSurfaced: 0,
  momentsSavedSilently: 0,
  momentsStale: 0,
  silenceReasons: [],
  momentEvaluations: [],
  generatedThoughts: [],
  dynamicQuestions: [],
  rawAudioStored: false,
  base64InSession: false,
  questionsAsked: 0,
  gptAnswers: 0,
  failures: [],
  results: [],
  listenWarmupMs,
  segmentCounts: {},
  firstProactiveCardMs: null,
  suppressedMoments: [],
  cardQualityFailures: [],
  cardQualityWarnings: [],
  maxSimultaneousCards: 0,
  cardsSurfaced: 0,
  duplicateTranscriptLines: 0,
  listeningLimitFired: false,
  listeningLimitFiredAtMs: null,
  actionFirstCardCount: 0,
  proactiveThoughtCardsShown: 0,
  vagueCardCount: 0,
  interruptQuestionsAsked: 0,
  autoFixAttempts: [],
  warmupRespected: true,
};

function log(msg) {
  console.log(msg);
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input, output });
  await rl.question(`${prompt}\nPress Enter when ready… `);
  rl.close();
}

async function askLive(question, sessionPayload) {
  const body = { prompt: question, session: sessionPayload, responseStyle: "overlay" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/api/glass/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const httpStatus = res.status;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(`HTTP ${httpStatus}`);
        err.httpStatus = httpStatus;
        throw err;
      }
      return { data, attempt };
    } catch (err) {
      if (attempt === 0 && shouldRetryLiveAsk(err, err.httpStatus ?? 0, attempt)) {
        log("  ↻ transient error, retrying once…");
        continue;
      }
      throw err;
    }
  }
  throw new Error("ask failed");
}

async function waitForTranscriptChunks(minChunks = 2, timeoutMs = 10 * 60_000, commandPage = null) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  let lastSttLog = "";
  while (Date.now() < deadline && Date.now() < runEnds) {
    const store = readSessionsStore(sessionsPath);
    const session = getActiveSession(store);
    const chunks = collectSystemAudioChunks(session);
    if (chunks.length !== lastCount) {
      log(`  … ${chunks.length} system_audio transcript chunk(s) in session`);
      if (chunks.length > 0) {
        const sample = (chunks[chunks.length - 1].text ?? chunks[chunks.length - 1].title ?? "").slice(0, 80);
        log(`  … latest: "${sample}${sample.length >= 80 ? "…" : ""}"`);
      }
      lastCount = chunks.length;
    }
    if (commandPage) {
      try {
        const st = await readGlassState(commandPage);
        const err = st.stt?.lastError ?? st.lastError ?? "";
        const elapsed = st.stt?.listeningElapsedMs ?? 0;
        const statusLine = `listening ${Math.round(elapsed / 1000)}s · transcribing=${st.stt?.transcribing ? "yes" : "no"}${err ? ` · ${err}` : ""}`;
        if (statusLine !== lastSttLog) {
          log(`  … ${statusLine}`);
          lastSttLog = statusLine;
        }
      } catch {
        /* Glass may have closed */
      }
    }
    if (chunks.length >= minChunks) return chunks;
    await sleep(5000);
  }
  return collectSystemAudioChunks(getActiveSession(readSessionsStore(sessionsPath)));
}

function refreshPrivacyMetrics(session) {
  summary.micChunks = collectMicrophoneChunks(session).length;
  summary.micStayedOff = summary.micChunks === 0;
  summary.rawAudioStored = sessionHasRawAudioOrBase64(session);
  summary.base64InSession = summary.rawAudioStored;
}

function refreshMomentMetrics(moments, session) {
  const stats = summarizeMomentStats(moments);
  summary.momentsDetected = stats.detected;
  summary.momentsDeveloping = stats.developing;
  summary.momentsSurfaced =
    stats.surfaced +
    harnessRuntime.surfacedMoments.length +
    collectListenMomentEvents(session).filter((e) => e.tags?.includes("surfaced")).length;
  summary.momentsSavedSilently = stats.savedSilently + harnessRuntime.savedSilently.length;
  summary.momentsStale = stats.stale + harnessRuntime.staleMoments.length;
  summary.generatedThoughts = harnessRuntime.generatedThoughts;
  summary.maxSimultaneousCards = harnessRuntime.maxSimultaneousCards;
  summary.cardsSurfaced = harnessRuntime.cardsSurfaced;
  summary.actionFirstCardCount = harnessRuntime.actionFirstCardCount;
  summary.vagueCardCount = harnessRuntime.vagueCardCount;
  if (session?.events) {
    const limitEvent = session.events.find((e) => e.kind === "listening_limit_reached");
    if (limitEvent) {
      summary.listeningLimitFired = true;
      summary.listeningLimitFiredAtMs = Date.parse(limitEvent.timestamp);
    }
  }
}

function buildQaReport(listenReportMd) {
  const lines = [];
  lines.push("# IIVO Glass — Live Listen Mode QA Report");
  lines.push("");
  lines.push(`Duration target: ${minutes} minutes`);
  lines.push(`Warm-up duration: ${summary.listenWarmupMs / 1000}s`);
  lines.push(`Finished: ${new Date().toISOString()}`);
  lines.push(`Results JSONL: ${RESULTS_JSONL}`);
  lines.push(`Listen Report: ${LISTEN_REPORT_MD}`);
  lines.push("");
  lines.push("## What this test proves");
  lines.push("");
  lines.push("- Real YouTube/media on screen with extracted context (not hardcoded).");
  lines.push("- Listen mode uses **computer audio only** — mic verified off.");
  lines.push("- Real `system_audio` transcript chunks from BlackHole/STT.");
  lines.push("- Moment intelligence evaluates transcript without timer-driven spam.");
  lines.push("- IIVO stays quiet when transcript is thin or idea is developing.");
  lines.push("- Context-aware questions and GPT-5.5 answers anchored in transcript.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(`| Preflight | ${summary.preflightOk ? "pass" : "fail"} |`);
  lines.push(`| Real system audio (≥2 chunks) | ${summary.realSystemAudio ? "yes" : "no"} |`);
  lines.push(`| Screen/media context | ${summary.screenContextCaptured ? "yes" : "no"} |`);
  lines.push(`| Source type | ${summary.mediaSourceType} |`);
  lines.push(`| Title extracted | ${summary.extractedTitle ?? "_none_"} |`);
  lines.push(`| Channel extracted | ${summary.extractedChannel ?? "_none_"} |`);
  lines.push(`| Expected video URL | ${summary.expectedVideoUrl ?? "_none_"} |`);
  lines.push(`| URL detected | ${summary.extractedUrl ?? "_none_"} |`);
  lines.push(`| Duration | ${summary.extractedDuration ?? "_none_"} |`);
  lines.push(`| Transcript chunks | ${summary.transcriptChunks} |`);
  lines.push(`| Mic stayed off | ${summary.micStayedOff ? "**yes**" : "**NO — FAIL**"} (${summary.micChunks} mic chunks) |`);
  lines.push(`| Raw audio in session | ${summary.rawAudioStored ? "yes (unexpected)" : "no"} |`);
  lines.push(`| Base64 in session | ${summary.base64InSession ? "yes (unexpected)" : "no"} |`);
  lines.push(`| Moments detected | ${summary.momentsDetected} |`);
  lines.push(`| Developing | ${summary.momentsDeveloping} |`);
  lines.push(`| Surfaced | ${summary.momentsSurfaced} |`);
  lines.push(`| Saved silently | ${summary.momentsSavedSilently} |`);
  lines.push(`| Stale | ${summary.momentsStale} |`);
  lines.push(`| Cards surfaced (harness) | ${summary.cardsSurfaced} |`);
  lines.push(`| Max simultaneous cards | ${summary.maxSimultaneousCards} |`);
  lines.push(`| Duplicate transcript lines | ${summary.duplicateTranscriptLines} |`);
  lines.push(`| Listening limit fired | ${summary.listeningLimitFired ? "yes" : "no"} |`);
  lines.push(`| Action-first cards | ${summary.actionFirstCardCount} |`);
  lines.push(`| Proactive thought cards | ${summary.proactiveThoughtCardsShown ?? 0} |`);
  lines.push(`| Vague cards | ${summary.vagueCardCount} |`);
  lines.push(`| Warm-up respected | ${summary.warmupRespected ? "yes" : "no"} |`);
  lines.push(`| First proactive card | ${summary.firstProactiveCardMs != null ? `${Math.round(summary.firstProactiveCardMs / 1000)}s after start` : "_none_"} |`);
  lines.push(`| Live notes created | ${summary.liveNotesCreated ?? 0} |`);
  lines.push(`| Note updates | ${summary.noteUpdates ?? 0} |`);
  lines.push(`| No-audio prompts | ${summary.noAudioPromptsCount ?? 0} |`);
  lines.push(`| User interrupted too much | ${summary.userInterruptedTooMuch ? "**yes**" : "no"} |`);
  lines.push(`| Segment counts | ${JSON.stringify(summary.segmentCounts)} |`);
  lines.push(`| Questions asked | ${summary.questionsAsked} |`);
  lines.push(`| Interrupt questions (current moment) | ${summary.interruptQuestionsAsked} |`);
  lines.push(`| GPT-5.5 answers | ${summary.gptAnswers} |`);
  lines.push("");

  if (summary.mediaExtractionNotes.length) {
    lines.push("## Media extraction");
    summary.mediaExtractionNotes.forEach((n) => lines.push(`- ${n}`));
    lines.push("");
  }

  if (summary.noteExamples?.length) {
    lines.push("## Live Notes quality examples");
    summary.noteExamples.forEach((n) => lines.push(`- ${n}`));
    lines.push("");
  }

  if (summary.failures.length) {
    lines.push("## Failures & diagnosis");
    for (const f of summary.failures) {
      lines.push(`### ${f.category}`);
      lines.push(`- **Cause:** ${f.cause}`);
      lines.push(`- **Fix:** ${f.fix}`);
      lines.push("");
    }
  }

  if (summary.silenceReasons.length) {
    lines.push("## Why IIVO stayed quiet");
    summary.silenceReasons.slice(-25).forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  if (summary.generatedThoughts.length) {
    lines.push("## IIVO thoughts (harness)");
    for (const t of summary.generatedThoughts.slice(-15)) {
      const cardNote =
        t.disposition === "surfaced"
          ? ` · card vague=${t.cardVague ? "yes" : "no"} · fullText=${t.hasFullText !== false ? "yes" : "no"}`
          : "";
      lines.push(`- [${t.disposition}] ${t.thought} _(${t.reasonSelected})_${cardNote}`);
    }
    lines.push("");
  }

  if (summary.suppressedMoments.length) {
    lines.push("## Moments suppressed");
    for (const s of summary.suppressedMoments.slice(-12)) {
      lines.push(`- ${s.reason}${s.segmentKind ? ` [${s.segmentKind}]` : ""}`);
    }
    lines.push("");
  }

  if (summary.cardQualityFailures.length || summary.cardQualityWarnings.length) {
    lines.push("## Card / timing quality");
    summary.cardQualityFailures.forEach((f) => lines.push(`- **FAIL:** ${f}`));
    summary.cardQualityWarnings.forEach((w) => lines.push(`- **WARN:** ${w}`));
    lines.push("");
  }

  if (summary.dynamicQuestions.length) {
    lines.push("## Dynamic questions");
    for (const q of summary.dynamicQuestions) {
      lines.push(`- **Q:** ${q.question}`);
      lines.push(`  - Source: ${q.source} · Moment: ${q.momentId ?? "n/a"}`);
      lines.push(`  - Reason: ${q.reasonSelected}`);
      lines.push(`  - Anchors: ${q.transcriptAnchors?.[0]?.slice(0, 80) ?? "n/a"}`);
    }
    lines.push("");
  }

  const strong = summary.results.filter((r) => r.verdict === "strong").length;
  const weak = summary.results.filter((r) => r.verdict === "weak").length;
  lines.push("## Answer quality");
  lines.push(`Strong: ${strong} · Acceptable: ${summary.results.length - strong - weak} · Weak: ${weak}`);
  lines.push("");

  lines.push("## Answers");
  for (const r of summary.results) {
    lines.push(`### Q${r.index}: ${r.question}`);
    lines.push(`- Verdict: **${r.verdict}** · Route: ${r.routeUsed} · Model: ${r.modelUsed} · ${r.latencyMs ?? "?"}ms`);
    lines.push(`- Source: ${r.questionSource ?? "?"} · Moment decision: ${r.momentDecision ?? "n/a"}`);
    lines.push(`- Flags: ${r.flags?.join(", ") || "none"}`);
    lines.push(`- Answer: ${sanitize(r.answerPreview, 600)}`);
    lines.push("");
  }

  lines.push("## Listen Report (generated)");
  lines.push("");
  lines.push(listenReportMd || "_Report not generated — insufficient context._");
  lines.push("");

  const passed =
    summary.preflightOk &&
    summary.realSystemAudio &&
    summary.micStayedOff &&
    !summary.rawAudioStored &&
    weak === 0 &&
    summary.cardQualityFailures.length === 0;

  lines.push("## Verdict");
  lines.push(passed ? "**PASS** — Live Listen workflow verified." : "**FAIL or INCOMPLETE** — see above.");
  return lines.join("\n");
}

// --- Main -------------------------------------------------------------------

printSetupInstructions(log);

log("=== IIVO Glass Live Listen QA ===\n");
log(`Duration: ${minutes} min · Mode: ${manual ? "manual" : attach ? "attach" : "auto"}`);
log(`Video URL: ${videoUrl ?? "(default test video)"}`);
log(`Auto-fix: ${autoFix ? "on" : "off"} · Record answers: ${recordAnswers} · Record thoughts: ${recordThoughts}`);
log(`Sessions: ${sessionsPath}`);
log(`Output: ${OUT_DIR}\n`);

log("PREFLIGHT — Server (health, GPT-5.5, STT)…");
const preflight = await runServerPreflight(apiUrl);
summary.preflightOk = preflight.ok;
if (preflight.failures.length) {
  for (const f of preflight.failures) {
    if (f.category === "vision_not_configured") {
      log(`  WARN: ${f.cause}`);
      continue;
    }
    summary.failures.push(f);
    log(`  FAIL [${f.category}]: ${f.cause}`);
    log(`       Fix: ${f.fix}`);
  }
}
if (!preflight.ok) {
  writeReport(buildQaReport(""));
  process.exit(1);
}
log("  OK: server healthy · GPT-5.5 · STT configured\n");

const webUrl = (process.env.IIVO_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
let glassSession = null;

if (!manual) {
  try {
    glassSession = attach
      ? await attachGlassForListenLive({ log })
      : await launchGlassForListenLive({ apiUrl, webUrl, log });
    summary.glassLaunched = glassSession.launched;
    log("");
    log("Opening YouTube now — press play while Glass runs setup…");
    openYouTubeForListenTest(log, videoUrl);
    log("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.failures.push(
      diagnoseFailure("app_not_running", msg, "Run npm run glass:build or use --manual."),
    );
    log(`FAIL: Could not launch/attach Glass — ${msg}`);
    writeReport(buildQaReport(""));
    process.exit(1);
  }
} else if (!existsSync(sessionsPath)) {
  summary.failures.push(
    diagnoseFailure(
      "app_not_running",
      `No sessions file at ${sessionsPath}`,
      "Open IIVO Glass before running with --manual.",
    ),
  );
  log(`WARN: ${sessionsPath} not found — open IIVO Glass first.\n`);
}

async function waitForYouTubeFrontmost(maxWaitMs = 20_000) {
  if (manual) {
    log("STEP 1 — Open YouTube video (tab frontmost). Example:");
    log('  Silicon Valley Girl — "$4 billion founder: the next three years will make 100 new founders rich"');
    await waitForEnter("Video tab frontmost and playing?");
    return captureMacMediaContext();
  }

  log("STEP 1 — YouTube/video tab (opened at launch — press play if needed)…");
  if (!glassSession) openYouTubeForListenTest(log, videoUrl);
  await sleep(1500);
  const captured = captureMacMediaContext();
  if (captured.media?.sourceType === "youtube" || captured.windowTitle?.includes("YouTube")) {
    log(`  Detected: ${captured.media?.title ?? captured.windowTitle}`);
    return captured;
  }

  const deadline = Date.now() + maxWaitMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const next = captureMacMediaContext();
    if (next.media?.sourceType === "youtube" || next.windowTitle?.includes("YouTube")) {
      log(`  Detected: ${next.media?.title ?? next.windowTitle}`);
      return next;
    }
    if (Date.now() - lastLog > 8_000) {
      log("  … bring Chrome/YouTube frontmost and press play");
      lastLog = Date.now();
    }
    await sleep(1500);
  }
  log("  WARN: YouTube not detected — continuing (audio may still work)");
  return captureMacMediaContext();
}

const screen = await waitForYouTubeFrontmost();

log("\nSTEP 2 — Screen/media context (no facial recognition)…");
if (screen.error) {
  summary.failures.push(
    diagnoseFailure("screen_capture_failed", screen.error, "Grant Accessibility / ensure browser is frontmost."),
  );
}

let media = screen.media;
const mediaGrade = gradeMediaExtraction(media);
summary.mediaExtractionNotes = mediaGrade.notes;
summary.screenContextCaptured = mediaGrade.captured;

if (media) {
  summary.mediaSourceType = media.sourceType;
  summary.extractedTitle = media.title ?? null;
  summary.extractedChannel = media.channelOrSource ?? null;
  summary.extractedUrl = media.url ?? screen.browserUrl ?? null;
  summary.extractedDuration = media.durationLabel ?? null;
  log(`  App: ${screen.appName ?? "?"}`);
  log(`  Window: ${screen.windowTitle ?? "?"}`);
  log(`  URL: ${screen.browserUrl ?? "not available"}`);
  log(`  Type: ${media.sourceType} · Confidence: ${media.confidence}`);
  for (const note of mediaGrade.notes) log(`  · ${note}`);
} else {
  summary.failures.push(
    diagnoseFailure(
      "media_title_not_extracted",
      "Could not extract media context from window title/URL.",
      "Ensure the YouTube tab is frontmost with title visible in window bar.",
    ),
  );
  log("  WARN: media context missing — continuing if audio works.");
}

log("\nSTEP 3 — Activate Listen mode (computer audio only, mic off)…");

if (glassSession) {
  const listenResult = await automateListenMode({
    ...glassSession.pages,
    endurance: {
      maxListeningMinutes: effectiveMaxListeningMin,
      attention,
    },
    log,
  });
  if (!listenResult.ok) {
    summary.failures.push(
      diagnoseFailure(listenResult.category, listenResult.cause, listenResult.fix),
    );
    log(`FAIL: ${listenResult.cause}`);
    log(`Fix: ${listenResult.fix}`);
    if (!keepGlass) await closeGlassSession(glassSession);
    writeReport(buildQaReport(""));
    process.exit(1);
  }
  summary.listenModeActivated = true;
  const st = listenResult.state;
  log(`  Copilot active: ${st.copilot?.active} · focus: ${st.copilot?.config?.sessionType}`);
  log(`  Listening: ${st.privacy?.listening} · mode: ${st.transcriptionMode}`);
} else {
  log("  Manual mode — ensure you clicked Listen, system audio on, Voice OFF.");
  await waitForEnter("Listen mode active, system audio listening, Voice OFF?");
}

log("\nSTEP 4 — Waiting for ≥2 real system_audio transcript chunks…");
log("  (Not simulated — chunks must appear in glass-sessions.json)\n");
const chunks = await waitForTranscriptChunks(
  2,
  Math.min(10 * 60_000, runEnds - Date.now()),
  glassSession?.pages?.command ?? null,
);
summary.transcriptChunks = chunks.length;
summary.transcriptSource = chunks.length > 0 ? "system_audio" : "none";
summary.realSystemAudio = chunks.length >= 2;

const sessionAfterAudio = getActiveSession(readSessionsStore(sessionsPath));
refreshPrivacyMetrics(sessionAfterAudio);

const sessionMedia = mediaContextFromSession(sessionAfterAudio);
if (sessionMedia && !media) {
  media = sessionMedia;
  summary.screenContextCaptured = true;
  summary.mediaSourceType = sessionMedia.sourceType;
  summary.extractedTitle = sessionMedia.title ?? summary.extractedTitle;
  summary.extractedChannel = sessionMedia.channelOrSource ?? summary.extractedChannel;
  log("  Using media context captured by Glass on Listen click.");
}

if (!summary.realSystemAudio) {
  summary.failures.push(
    diagnoseFailure(
      "transcript_chunks_missing",
      `Only ${chunks.length} system_audio chunk(s) in ${sessionsPath}.`,
      "Check BlackHole routing, system audio selected, STT server, video playing with sound.",
    ),
  );
  log(`\nFAIL: only ${chunks.length} real system_audio chunk(s).`);
  if (!keepGlass && glassSession) await closeGlassSession(glassSession);
  writeReport(buildQaReport(""));
  process.exit(1);
}

if (!summary.micStayedOff) {
  summary.failures.push(
    diagnoseFailure(
      "mic_accidentally_active",
      `${summary.micChunks} microphone chunk(s) detected during Listen mode.`,
      "Stop Everything, click Listen again — do not enable Voice or microphone.",
    ),
  );
  log(`\nFAIL privacy: ${summary.micChunks} microphone chunk(s) detected.`);
}

log(`\nOK: ${chunks.length} real system_audio chunks · mic off: ${summary.micStayedOff ? "yes" : "NO"}\n`);

let runtimeMoments = evaluateListenMomentsFromChunks(chunks);
let fallbackIndex = 0;
let interruptIndex = 0;
let nextMomentEval = Date.now() + 40_000;
let lastChunkMs = Date.now();
let lastAnalysis = { decision: "wait_for_more_context", reason: "Starting listen loop.", thought: undefined };

log("STEP 5 — Moment intelligence loop (eval every 30–60s, ask only with context)…\n");

let nextAutoFixAt = 0;
const TRANSCRIPT_STALL_MS = 3 * 60_000;

while (Date.now() < runEnds) {
  const store = readSessionsStore(sessionsPath);
  const session = getActiveSession(store);
  const freshChunks = collectSystemAudioChunks(session);
  if (freshChunks.length > summary.transcriptChunks) lastChunkMs = Date.now();
  summary.transcriptChunks = freshChunks.length;
  refreshPrivacyMetrics(session);

  if (
    autoFix &&
    glassSession?.pages &&
    Date.now() - lastChunkMs > TRANSCRIPT_STALL_MS &&
    Date.now() >= nextAutoFixAt
  ) {
    log(`\n  [auto-fix] No new transcript for ${Math.round((Date.now() - lastChunkMs) / 1000)}s — recovering…`);
    const recovery = await attemptListenRecovery({
      ...glassSession.pages,
      endurance: { maxListeningMinutes: effectiveMaxListeningMin, attention },
      log,
    });
    const attempt = {
      at: new Date().toISOString(),
      ok: recovery.ok,
      cause: recovery.cause ?? null,
      chunksBefore: freshChunks.length,
    };
    summary.autoFixAttempts.push(attempt);
    appendResult({ action: "auto_fix", ...attempt });
    nextAutoFixAt = Date.now() + 5 * 60_000;
    if (recovery.ok) lastChunkMs = Date.now();
    else log(`  [auto-fix] failed: ${recovery.cause ?? "unknown"}`);
  }

  const transcriptText = freshChunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
  summary.duplicateTranscriptLines = countDuplicateTranscriptLines(freshChunks);
  runtimeMoments = evaluateListenMomentsFromChunks(freshChunks, runtimeMoments);
  refreshMomentMetrics(runtimeMoments, session);

  if (Date.now() >= nextMomentEval) {
    const latestChunk = freshChunks.at(-1);
    const latestText = (latestChunk?.text ?? latestChunk?.title ?? "").trim();
    if (!harnessRuntime.listenStartedMs) harnessRuntime.listenStartedMs = Date.now();

    lastAnalysis = analyzeListenMomentWithHarness({
      moments: runtimeMoments,
      runtime: harnessRuntime,
      recentTranscriptChars: transcriptText.length,
      lastChunkMs,
      userReceivingAnswer: false,
      listenWarmupMs,
      newTranscript: latestText,
      visibleText: media?.visibleTextSummary,
      mediaTitle: media?.title ?? summary.extractedTitle ?? undefined,
    });

    applyHarnessMomentDecision(lastAnalysis, harnessRuntime);
    summary.segmentCounts = { ...harnessRuntime.segmentCounts };
    summary.firstProactiveCardMs = harnessRuntime.firstProactiveCardMs ?? summary.firstProactiveCardMs;
    summary.suppressedMoments = harnessRuntime.suppressedMoments.slice(-20);
    refreshMomentMetrics(runtimeMoments, session);

    summary.momentEvaluations.push({
      at: new Date().toISOString(),
      decision: lastAnalysis.decision,
      reason: lastAnalysis.reason,
      candidate: lastAnalysis.candidate?.summary,
      thought: lastAnalysis.thought,
    });
    summary.silenceReasons.push(`${lastAnalysis.decision}: ${lastAnalysis.reason}`);
    log(`  [moment] ${lastAnalysis.decision} — ${lastAnalysis.reason}`);
    if (lastAnalysis.decision === "surface_now" && lastAnalysis.thought) {
      log(`  [IIVO thought] ${sanitize(lastAnalysis.thought, 120)}`);
      if (recordThoughts) {
        const thoughtRecord = {
          action: "surfaced_card",
          at: new Date().toISOString(),
          thought: lastAnalysis.thought,
          reason: lastAnalysis.reason,
          momentSummary: lastAnalysis.candidate?.summary,
          transcriptAnchors: lastAnalysis.candidate?.transcriptAnchors,
        };
        appendResult(thoughtRecord);
      }
    }
    nextMomentEval = Date.now() + (30 + Math.floor(Math.random() * 31)) * 1000;
  }

  const nearEnd = Date.now() >= runEnds - 90_000;
  const shouldAsk =
    lastAnalysis.decision === "surface_now" ||
    (nearEnd && transcriptText.length >= 80) ||
    (summary.questionsAsked === 0 && transcriptText.length >= 80);

  if (shouldAsk) {
    let generated = null;
    if (
      interruptIndex < LISTEN_INTERRUPT_QA_QUESTIONS.length &&
      transcriptText.length >= 80
    ) {
      const question = LISTEN_INTERRUPT_QA_QUESTIONS[interruptIndex++];
      generated = {
        question,
        reasonSelected: "User-like Listen interruption — current moment ask.",
        transcriptAnchors: [transcriptText.slice(-220)],
        expectedAnswerAnchors: [transcriptText.slice(-120)],
        disposition: "ask_now",
        source: "interrupt",
      };
      summary.interruptQuestionsAsked += 1;
    } else {
      generated = pickContextAwareQuestion({
        moments: runtimeMoments,
        transcriptText,
        runtime: harnessRuntime,
        allowReport: nearEnd,
        fallbackIndex,
      });
    }

    if (generated) {
      fallbackIndex += 1;
      summary.dynamicQuestions.push(generated);
      summary.questionsAsked += 1;

      const sessionPayload = buildListenLiveAskSession({
        mediaContext: media,
        systemAudioChunks: freshChunks,
      });

      log(`Q${summary.questionsAsked} [${generated.source}]: ${generated.question}`);
      if (generated.reasonSelected) log(`  Reason: ${generated.reasonSelected}`);

      const started = Date.now();
      try {
        const { data } = await askLive(generated.question, sessionPayload);
        const latencyMs = Date.now() - started;
        const modelUsed = data.modelUsed ?? data.model ?? "?";
        const grade = gradeListenLiveAnswer({
          answer: data.answer,
          routeUsed: data.routeUsed,
          modelUsed,
          hasTranscript: freshChunks.length >= 2,
          mediaContext: media,
          question: generated,
          transcriptText,
        });
        if (/gpt-5\.5/i.test(modelUsed)) summary.gptAnswers += 1;

        const record = {
          index: summary.questionsAsked,
          action: recordAnswers ? "answered_user_like_question" : "asked_question",
          question: generated.question,
          questionSource: generated.source,
          momentId: generated.momentId,
          reasonSelected: generated.reasonSelected,
          transcriptAnchors: generated.transcriptAnchors,
          answerPreview: sanitize(data.answer, 800),
          routeUsed: data.routeUsed,
          modelUsed,
          latencyMs,
          verdict: grade.verdict,
          flags: grade.flags,
          transcriptChunks: freshChunks.length,
          momentDecision: lastAnalysis.decision,
          realSystemAudio: true,
          at: new Date().toISOString(),
        };
        summary.results.push(record);
        appendResult(record);
        log(`  → ${grade.verdict} · ${data.routeUsed} · ${modelUsed} · ${latencyMs}ms`);
        log(`  → ${sanitize(data.answer, 160)}\n`);
      } catch (err) {
        const fail = err instanceof Error ? err.message : String(err);
        summary.failures.push(
          diagnoseFailure("timeout_api_transient", fail, "Retry or check server load / network."),
        );
        appendResult({
          index: summary.questionsAsked,
          question: generated.question,
          pass: false,
          failReason: fail,
          at: new Date().toISOString(),
        });
        log(`  FAIL: ${fail}\n`);
      }
    } else {
      summary.silenceReasons.push("deferred: not enough transcript for context-aware question.");
    }
  }

  if (Date.now() >= runEnds) break;
  const waitSec = shouldAsk ? 90 + Math.floor(Math.random() * 91) : 20;
  await sleep(waitSec * 1000);
}

// Final Listen Report
log("\nSTEP 6 — Generating Listen Report…\n");
const finalStore = readSessionsStore(sessionsPath);
const finalSession = getActiveSession(finalStore);
const finalChunks = collectSystemAudioChunks(finalSession);
const finalTranscript = finalChunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
runtimeMoments = evaluateListenMomentsFromChunks(finalChunks, runtimeMoments);
refreshMomentMetrics(runtimeMoments, finalSession);

const listenReportMd = buildHarnessListenReport({
  moments: [...runtimeMoments, ...harnessRuntime.savedSilently, ...harnessRuntime.surfacedMoments],
  mediaContext: media,
  transcriptText: finalTranscript,
  sessionTitle: summary.extractedTitle ?? "Live Listen QA",
});
writeReport(listenReportMd, LISTEN_REPORT_MD);

const cardQuality = gradeListenHarnessQuality({
  runtime: harnessRuntime,
  listenWarmupMs,
  duplicateTranscriptLines: countDuplicateTranscriptLines(finalChunks),
  listeningLimitFired: summary.listeningLimitFired,
  listeningElapsedMs: Date.now() - runStarted,
  maxListeningMin: effectiveMaxListeningMin,
  micChunks: summary.micChunks,
  transcriptChunkCount: finalChunks.length,
  liveNotesEntryCount: buildListenHarnessNoteMetrics({
    moments: [...runtimeMoments, ...harnessRuntime.savedSilently, ...harnessRuntime.surfacedMoments],
    transcriptChunks: finalChunks.map((c) => (c.text ?? c.title ?? "").trim()).filter(Boolean),
    runtime: harnessRuntime,
  }).liveNotesCreated,
});

const noteMetrics = buildListenHarnessNoteMetrics({
  moments: [...runtimeMoments, ...harnessRuntime.savedSilently, ...harnessRuntime.surfacedMoments],
  transcriptChunks: finalChunks.map((c) => (c.text ?? c.title ?? "").trim()).filter(Boolean),
  runtime: harnessRuntime,
});
summary.liveNotesCreated = noteMetrics.liveNotesCreated;
summary.noteUpdates = noteMetrics.noteUpdates;
summary.proactiveThoughtCardsShown = noteMetrics.proactiveThoughtCardsShown;
summary.noteExamples = noteMetrics.noteExamples;
summary.userInterruptedTooMuch = noteMetrics.userInterruptedTooMuch;
summary.noAudioPromptsCount = noteMetrics.noAudioPromptsCount;
if (failOnMicChunks && summary.micChunks > 0) {
  summary.failures.push(
    diagnoseFailure(
      "mic_in_listen",
      `${summary.micChunks} microphone chunk(s) during Listen mode.`,
      "Listen endurance requires system audio only.",
    ),
  );
}
if (failOnDuplicateTranscriptSpam && cardQuality.duplicateTranscriptLines > 3) {
  summary.failures.push(
    diagnoseFailure(
      "duplicate_transcript_spam",
      `Duplicate transcript lines: ${cardQuality.duplicateTranscriptLines}`,
      "Check transcript dedupe in sttChunkHandler and add-transcript-chunk.",
    ),
  );
}
summary.cardQualityFailures = cardQuality.failures;
summary.cardQualityWarnings = cardQuality.warnings;
summary.maxSimultaneousCards = Math.max(summary.maxSimultaneousCards, cardQuality.maxSimultaneousCards);
summary.warmupRespected = !cardQuality.cardTooEarly;
if (cardQuality.failures.length) {
  for (const f of cardQuality.failures) {
    summary.failures.push(diagnoseFailure("listen_card_quality", f, "Review warm-up, segment filter, and card copy."));
  }
}

if (!summary.results.some((r) => /report/i.test(r.question ?? ""))) {
  summary.questionsAsked += 1;
  log(`Q${summary.questionsAsked}: Give me the report`);
  try {
    const { data } = await askLive(
      "Give me the report",
      buildListenLiveAskSession({ mediaContext: media, systemAudioChunks: finalChunks }),
    );
    summary.results.push({
      index: summary.questionsAsked,
      question: "Give me the report",
      questionSource: "report",
      answerPreview: sanitize(data.answer, 1200),
      routeUsed: data.routeUsed,
      modelUsed: data.modelUsed ?? data.model,
      verdict: "report",
      at: new Date().toISOString(),
    });
    appendResult(summary.results.at(-1));
  } catch (err) {
    summary.failures.push(
      diagnoseFailure("report_failed", err instanceof Error ? err.message : String(err), "Check debrief route."),
    );
  }
}

writeReport(buildQaReport(listenReportMd));
log(`\nDone.`);
log(`  QA Report: ${REPORT_MD}`);
log(`  Listen Report: ${LISTEN_REPORT_MD}`);
log(`  JSONL: ${RESULTS_JSONL}`);

const weakCount = summary.results.filter((r) => r.verdict === "weak").length;
const exitFail =
  weakCount > 0 ||
  !summary.micStayedOff ||
  !summary.realSystemAudio ||
  !summary.preflightOk ||
  summary.rawAudioStored ||
  summary.cardQualityFailures.length > 0;

if (!keepGlass && glassSession) {
  await closeGlassSession(glassSession);
}

process.exit(exitFail ? 1 : 0);

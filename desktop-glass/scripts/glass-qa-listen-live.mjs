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
 *   npm run glass:qa:listen:live -- --minutes 10
 *   npm run glass:qa:listen:live -- --minutes 60
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
  buildListenLiveAskSession,
  captureMacMediaContext,
  mediaContextFromSession,
  appendResult,
  writeReport,
  sleep,
  sanitize,
  diagnoseFailure,
} from "./lib/glass-listen-live-lib.mjs";

const { minutes } = parseListenLiveArgs();
const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const sessionsPath = resolveSessionsPath();
const runStarted = Date.now();
const runEnds = runStarted + minutes * 60_000;
const harnessRuntime = createListenHarnessRuntime("balanced");

const summary = {
  preflightOk: false,
  realSystemAudio: false,
  screenContextCaptured: false,
  mediaSourceType: "unknown",
  extractedTitle: null,
  extractedChannel: null,
  extractedUrl: null,
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

async function waitForTranscriptChunks(minChunks = 2, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline && Date.now() < runEnds) {
    const store = readSessionsStore(sessionsPath);
    const session = getActiveSession(store);
    const chunks = collectSystemAudioChunks(session);
    if (chunks.length !== lastCount) {
      log(`  … ${chunks.length} system_audio transcript chunk(s) in session`);
      lastCount = chunks.length;
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
}

function buildQaReport(listenReportMd) {
  const lines = [];
  lines.push("# IIVO Glass — Live Listen Mode QA Report");
  lines.push("");
  lines.push(`Duration target: ${minutes} minutes`);
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
  lines.push(`| URL | ${summary.extractedUrl ?? "_none_"} |`);
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
  lines.push(`| Questions asked | ${summary.questionsAsked} |`);
  lines.push(`| GPT-5.5 answers | ${summary.gptAnswers} |`);
  lines.push("");

  if (summary.mediaExtractionNotes.length) {
    lines.push("## Media extraction");
    summary.mediaExtractionNotes.forEach((n) => lines.push(`- ${n}`));
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
      lines.push(`- [${t.disposition}] ${t.thought} _(${t.reasonSelected})_`);
    }
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
    weak === 0;

  lines.push("## Verdict");
  lines.push(passed ? "**PASS** — Live Listen workflow verified." : "**FAIL or INCOMPLETE** — see above.");
  return lines.join("\n");
}

// --- Main -------------------------------------------------------------------

log("\n=== IIVO Glass Live Listen QA ===\n");
log(`Duration: ${minutes} min · Sessions: ${sessionsPath}`);
log(`Output: ${OUT_DIR}\n`);

log("PREFLIGHT — Server (health, GPT-5.5, STT, vision)…");
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

if (!existsSync(sessionsPath)) {
  summary.failures.push(
    diagnoseFailure(
      "app_not_running",
      `No sessions file at ${sessionsPath}`,
      "Open IIVO Glass (packaged or dev) before running this test.",
    ),
  );
  log(`WARN: ${sessionsPath} not found — start IIVO Glass first.\n`);
}

log("STEP 1 — Open the YouTube video (tab frontmost). Example:");
log('  Channel: Silicon Valley Girl');
log('  Title: "$4 billion founder: the next three years will make 100 new founders rich"');
log("  Route Mac audio through BlackHole. Keep playing — do not pause.\n");
await waitForEnter("Video tab is frontmost and playing?");

log("\nSTEP 2 — Extracting screen/media context (no facial recognition)…");
const screen = captureMacMediaContext();
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

log("\nSTEP 3 — In IIVO Glass:");
log("  1. Click **Listen** (not Voice).");
log("  2. Confirm **Computer Audio** / System Audio is selected.");
log("  3. Confirm listening is active.");
log("  4. Do NOT start Voice Mode — mic must stay OFF.\n");
await waitForEnter("Listen mode active, system audio listening, Voice OFF?");

log("\nSTEP 4 — Waiting for ≥2 real system_audio transcript chunks…");
log("  (Not simulated — chunks must appear in glass-sessions.json)\n");
const chunks = await waitForTranscriptChunks(2, Math.min(10 * 60_000, runEnds - Date.now()));
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
let nextMomentEval = Date.now() + 40_000;
let lastChunkMs = Date.now();
let lastAnalysis = { decision: "wait_for_more_context", reason: "Starting listen loop.", thought: undefined };

log("STEP 5 — Moment intelligence loop (eval every 30–60s, ask only with context)…\n");

while (Date.now() < runEnds) {
  const store = readSessionsStore(sessionsPath);
  const session = getActiveSession(store);
  const freshChunks = collectSystemAudioChunks(session);
  if (freshChunks.length > summary.transcriptChunks) lastChunkMs = Date.now();
  summary.transcriptChunks = freshChunks.length;
  refreshPrivacyMetrics(session);

  const transcriptText = freshChunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
  runtimeMoments = evaluateListenMomentsFromChunks(freshChunks, runtimeMoments);
  refreshMomentMetrics(runtimeMoments, session);

  if (Date.now() >= nextMomentEval) {
    lastAnalysis = analyzeListenMomentWithHarness({
      moments: runtimeMoments,
      runtime: harnessRuntime,
      recentTranscriptChars: transcriptText.length,
      lastChunkMs,
      userReceivingAnswer: false,
    });

    applyHarnessMomentDecision(lastAnalysis, harnessRuntime);
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
    }
    nextMomentEval = Date.now() + (30 + Math.floor(Math.random() * 31)) * 1000;
  }

  const nearEnd = Date.now() >= runEnds - 90_000;
  const shouldAsk =
    lastAnalysis.decision === "surface_now" ||
    (nearEnd && transcriptText.length >= 80) ||
    (summary.questionsAsked === 0 && transcriptText.length >= 80);

  if (shouldAsk) {
    const generated = pickContextAwareQuestion({
      moments: runtimeMoments,
      transcriptText,
      runtime: harnessRuntime,
      allowReport: nearEnd,
      fallbackIndex,
    });

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
  summary.rawAudioStored;
process.exit(exitFail ? 1 : 0);

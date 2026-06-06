#!/usr/bin/env node
// Live AI ask for a single QA scenario (rate-limited by caller). Uses fixture HTML
// as text context when scenario has controlled_visual_fixture.
//
// Usage: node scripts/glass-live-scenario-ask.mjs --scenario-id founder_strategy_01
//
// Sanitized answer samples append to /tmp/iivo-glass-overnight/live-scenario-results.jsonl

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getScenarioById, FIXTURE_PAGES } from "./qa-scenarios/iivo-glass-scenarios.mjs";
import {
  scoreGlassAnswerQuality,
  scoreMeetingAnswer,
  scoreCategoryAnswer,
  scoreActiveListeningAnswer,
  visualFixtureFailReason,
} from "./lib/glass-answer-quality.mjs";
import { shouldRetryLiveAsk } from "./lib/glass-live-ask-retry.mjs";

const CATEGORY_GRADED = new Set(["video_learning", "creator_content", "sales_review", "active_listening"]);
import { renderFixtureScreenshot } from "./lib/render-fixture-screenshot.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLASS_ROOT = join(__dirname, "..");
const OUT = "/tmp/iivo-glass-overnight";
const RESULTS_JSONL = join(OUT, "live-scenario-results.jsonl");

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = ["Final Action Plan", "Decision Quality", "Sales Attack", "Product Decision", "Final Judge"];

function parseArgs() {
  const i = process.argv.indexOf("--scenario-id");
  return i >= 0 ? process.argv[i + 1] : null;
}

/** @param {string} text @param {number} [maxLen] */
function sanitizeText(text, maxLen = 500) {
  if (!text) return "";
  let s = String(text)
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted-image]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[redacted-key]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted-token]")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

/** @param {import('./qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} scenario */
function contextSummary(scenario) {
  const parts = [];
  if (scenario.screenContextText) parts.push(scenario.screenContextText.slice(0, 160));
  if (scenario.transcriptChunks?.length) {
    parts.push(`transcript(${scenario.transcriptChunks.length} chunks)`);
  }
  if (scenario.fixturePage) parts.push(`fixture:${scenario.fixturePage}`);
  if (scenario.appName) parts.push(`app:${scenario.appName}`);
  return parts.join(" · ") || "(none)";
}

function appendResult(record) {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(RESULTS_JSONL, `${JSON.stringify(record)}\n`);
}

const scenarioId = parseArgs();
if (!scenarioId) {
  console.error("Usage: node scripts/glass-live-scenario-ask.mjs --scenario-id <id>");
  process.exit(2);
}

const scenario = getScenarioById(scenarioId);
if (!scenario) {
  console.error(`Unknown scenario: ${scenarioId}`);
  process.exit(2);
}
if (!scenario.liveAllowed) {
  console.error(`Scenario ${scenarioId} is not liveAllowed`);
  process.exit(2);
}

const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

function assertAnswer(answer) {
  if (!answer?.trim()) throw new Error("Empty answer");
  if (answer.includes(STUB_CANARY)) throw new Error("Stub canary");
  if (answer.trim().length < 15) throw new Error("Too short");
  for (const m of COUNCIL_MARKERS) {
    if (answer.includes(m)) throw new Error(`Council: ${m}`);
  }
}

function assertVisualFixtureAnswer(answer) {
  assertAnswer(answer);
  const reason = visualFixtureFailReason({
    answer,
    contextKeywords: scenario.fixtureExpectedKeywords,
  });
  if (reason) throw new Error(reason);
}

function classifyActiveListeningIntent(prompt) {
  const t = String(prompt ?? "");
  if (/\bhow does that work\b/i.test(t)) return "explain_current_moment";
  if (/\bturn that into action steps\b/i.test(t)) return "action_steps";
  if (/\bcreate (?:a )?(?:cursor )?prompt\b/i.test(t)) return "prompt_generation";
  if (/\bwhat should i say next\b/i.test(t)) return "sales_coaching";
  if (/\bwhat objection is this\b/i.test(t)) return "objection_handling";
  if (/\bwhat should i remember\b/i.test(t)) return "summarize_recent";
  if (/\bwhat did i miss\b/i.test(t)) return "summarize_recent";
  return "general_contextual";
}

/** @param {import('./qa-scenarios/iivo-glass-scenarios.mjs').QaScenario} scenario */
function buildActiveListeningSession(scenario) {
  const transcript = (scenario.transcriptChunks ?? []).join(" ");
  const chunks = (scenario.transcriptChunks ?? []).map((text, i) => ({
    text,
    source: "system_audio",
    timestamp: new Date(Date.now() - ((scenario.transcriptChunks?.length ?? 1) - i) * 45_000).toISOString(),
  }));
  const activeMode = scenario.expectedSessionType === "meeting_call" ? "meetings" : "listen";
  return {
    recentTranscript: transcript.slice(-1500),
    currentSource: {
      appName: scenario.appName,
      windowTitle: scenario.windowTitle,
    },
    activeListening: {
      enabled: true,
      activeMode,
      windowMinutes: 3,
      chunkCount: chunks.length,
      systemAudioChunkCount: chunks.length,
      microphoneChunkCount: 0,
      recentTranscriptWindow: transcript,
      chunks,
      sessionFocus: scenario.expectedSessionType,
      copilotMode: "coaching",
      detectedIntent: classifyActiveListeningIntent(scenario.userPrompt),
      contextThin: transcript.trim().length < 40,
    },
  };
}

const prompt =
  scenario.category === "active_listening"
    ? scenario.userPrompt
    : `${scenario.userPrompt}\n\nContext: ${scenario.screenContextText}\n${scenario.transcriptChunks.join(" ")}`.slice(0, 2000);

/** @returns {Promise<{ body: object, expectRoute: string }>} */
async function buildRequestBody() {
  let body = {
    prompt,
    responseStyle: "overlay",
    ...(scenario.category === "active_listening"
      ? { session: buildActiveListeningSession(scenario) }
      : {}),
  };
  let expectRoute = "glass_direct";

  if (scenario.testKind === "controlled_visual_fixture" && scenario.fixturePage) {
    const fix = FIXTURE_PAGES[scenario.fixturePage];
    const fixPath = join(GLASS_ROOT, fix.path);
    if (existsSync(fixPath)) {
      const imageDataUrl = await renderFixtureScreenshot(fixPath);
      body = {
        prompt: `${scenario.userPrompt} What do you see on this screen?`,
        visualIntent: true,
        latestScreenshot: {
          imageDataUrl,
          label: `Fixture: ${fix.label}`,
          capturedAt: new Date().toISOString(),
          fixturePage: scenario.fixturePage,
        },
        responseStyle: "overlay",
      };
      expectRoute = "glass_visual_direct";
    }
  }

  return { body, expectRoute };
}

/** @param {object} body @param {string} expectRoute */
async function executeLiveAsk(body, expectRoute) {
  const res = await fetch(`${apiUrl}/api/glass/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const httpStatus = res.status;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    /** @type {Error & { httpStatus?: number, data?: object }} */ (err).httpStatus = httpStatus;
    /** @type {Error & { httpStatus?: number, data?: object }} */ (err).data = data;
    throw err;
  }

  if (scenario.testKind === "controlled_visual_fixture") {
    assertVisualFixtureAnswer(data.answer);
  } else {
    assertAnswer(data.answer);
    if (/couldn't capture the screen/i.test(data.answer ?? "")) {
      throw new Error("Accidental capture-first response for text scenario");
    }
  }

  if (data.routeUsed !== expectRoute && expectRoute === "glass_direct") {
    if (data.routeUsed !== "glass_visual_direct" && data.routeUsed !== "glass_direct") {
      throw new Error(`Bad route ${data.routeUsed}`);
    }
  }
  if (expectRoute === "glass_direct" && /couldn't capture/i.test(data.answer ?? "")) {
    throw new Error("Text scenario routed to capture-first");
  }

  return { data, httpStatus };
}

/** @param {unknown} err */
function errorHttpStatus(err) {
  return /** @type {{ httpStatus?: number }} */ (err)?.httpStatus ?? 0;
}

/** @param {unknown} err */
function errorData(err) {
  return /** @type {{ data?: object }} */ (err)?.data ?? {};
}

/** @param {string} reason */
function isTimeoutFailure(reason) {
  const lower = reason.toLowerCase();
  return lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort");
}

const started = Date.now();
const { body, expectRoute } = await buildRequestBody();

/** @type {{ data: object, httpStatus: number, attempt: number, transientRecovered: boolean, firstFailReason?: string }} */
let result = { data: {}, httpStatus: 0, attempt: 0, transientRecovered: false };

for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const out = await executeLiveAsk(body, expectRoute);
    result = {
      data: out.data,
      httpStatus: out.httpStatus,
      attempt,
      transientRecovered: attempt === 1,
      firstFailReason: result.firstFailReason,
    };
    break;
  } catch (err) {
    const httpStatus = errorHttpStatus(err);
    const failReason = err instanceof Error ? err.message : String(err);
    if (attempt === 0 && shouldRetryLiveAsk(err, httpStatus, attempt)) {
      result.firstFailReason = failReason;
      console.warn(`RETRY ${scenarioId}: transient ${failReason} — retrying once…`);
      continue;
    }

    appendResult({
      scenarioId,
      category: scenario.category,
      testKind: scenario.testKind,
      promptPreview: sanitizeText(scenario.userPrompt, 200),
      contextSummary: contextSummary(scenario),
      routeUsed: errorData(err).routeUsed ?? null,
      model: errorData(err).modelUsed ?? errorData(err).model ?? null,
      latencyMs: Date.now() - started,
      pass: false,
      failReason,
      transientRecovered: false,
      timeoutUnrecovered: isTimeoutFailure(failReason),
      attempts: attempt + 1,
      finishedAt: new Date().toISOString(),
    });
    console.error(`FAIL ${scenarioId}: ${failReason}`);
    process.exit(1);
  }
}

const ms = Date.now() - started;
const data = result.data;
const answerPreview = sanitizeText(data.answer, 500);
const shortAnswer = sanitizeText(data.shortAnswer ?? data.answer?.slice(0, 200), 200);
const qualityFlags = scoreGlassAnswerQuality({
  answer: data.answer,
  contextSummary: contextSummary(scenario),
  routeUsed: data.routeUsed,
  expectedRoute: expectRoute,
  contextKeywords: scenario.fixtureExpectedKeywords,
});

const meeting =
  scenario.category === "meeting_call"
    ? scoreMeetingAnswer({ answer: data.answer, scenario })
    : null;

const categoryGrade = CATEGORY_GRADED.has(scenario.category)
  ? scenario.category === "active_listening"
    ? scoreActiveListeningAnswer({ answer: data.answer, scenario })
    : scoreCategoryAnswer({ answer: data.answer, scenario })
  : null;

appendResult({
  scenarioId,
  category: scenario.category,
  testKind: scenario.testKind,
  promptPreview: sanitizeText(scenario.userPrompt, 200),
  contextSummary: contextSummary(scenario),
  routeUsed: data.routeUsed,
  model: data.modelUsed ?? data.model ?? null,
  modelRequested: data.modelRequested ?? null,
  modelUsed: data.modelUsed ?? data.model ?? null,
  fallbackUsed: data.fallbackUsed ?? false,
  latencyMs: ms,
  answerPreview,
  shortAnswer,
  qualityFlags,
  ...(meeting
    ? {
        meetingVerdict: meeting.verdict,
        meetingMissingFields: meeting.missingFields,
        meetingMissingCalledOut: meeting.missingCalledOut,
        meetingHallucinatedOwner: meeting.hallucinatedOwner,
        meetingMentionedAnchors: meeting.mentionedAnchors,
      }
    : {}),
  ...(categoryGrade
    ? {
        categoryVerdict: categoryGrade.verdict,
        categoryThin: categoryGrade.thin,
        categoryGeneric: categoryGrade.genericFlag,
        categoryMissingCalledOut: categoryGrade.missingCalledOut,
        categoryMentionedAnchors: categoryGrade.mentionedAnchors,
        categoryMissingFields: categoryGrade.missingFields,
      }
    : {}),
  pass: true,
  transientRecovered: result.transientRecovered,
  firstFailReason: result.firstFailReason ?? null,
  attempts: result.attempt + 1,
  finishedAt: new Date().toISOString(),
});

if (result.transientRecovered) {
  console.warn(
    `RECOVERED ${scenarioId}: transient ${result.firstFailReason} — passed on retry (${ms}ms)`,
  );
}

console.log(
  `OK live scenario ${scenarioId} [${scenario.testKind}] · ${data.routeUsed} · ${data.modelUsed ?? data.model ?? "unknown-model"}${data.fallbackUsed ? " (fallback)" : ""} · ${ms}ms · category=${scenario.category}${result.transientRecovered ? " · transient_recovered" : ""}`,
);
console.log(`answer: ${sanitizeText(shortAnswer || answerPreview, 160)}`);
process.exit(0);

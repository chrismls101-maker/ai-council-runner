/**
 * Live Listen QA harness — pure helpers for moment-driven questions, grading,
 * and report building. Shared by the live QA script and unit tests.
 */

import {
  decideListenCardSurface,
  initialListenCardRuntimeState,
  type ListenCardRuntimeState,
} from "./listenCardState.ts";
import { isActionFirstListenCard } from "./listenInsightQuality.ts";
import { countDuplicateTranscriptLines } from "./transcriptDedupe.ts";
import {
  evaluateListenMoments,
  generateListenThought,
  pickBestListenMomentForSurface,
} from "./listenMomentIntelligence.ts";
import {
  countSurfacesInLast10Min,
  LISTEN_MIN_TRANSCRIPT_CHARS,
  shouldSurfaceListenMoment,
} from "./listenMomentTiming.ts";
import { DEFAULT_LISTEN_WARMUP_MS } from "./listenMomentTypes.ts";
import { classifyListenSegment, type ListenSegmentKind } from "./listenSegmentClassifier.ts";
import {
  buildListenThoughtFeedContent,
  listenCardTextIsVague,
} from "./listenThoughtCards.ts";
import { buildListenLiveNotes } from "./listenLiveNotes.ts";
import {
  buildListenReportMarkdown,
  buildListenReportSections,
} from "./listenReport.ts";
import type { ListenAttentionLevel, ListenMoment } from "./listenMomentTypes.ts";
import type { MediaContext } from "./mediaContextTypes.ts";
import { answerClaimsFacialRecognition, answerClaimsFakeAudio } from "./mediaContextExtract.ts";
import type { ListenEnduranceConfig } from "./listenEnduranceConfig.ts";
import {
  parseListenEnduranceCli,
  formatEnduranceConfig,
  effectiveMaxListeningMinutes,
  validateEnduranceConfig,
} from "./listenEnduranceConfig.ts";

export {
  parseListenEnduranceCli,
  formatEnduranceConfig,
  effectiveMaxListeningMinutes,
  validateEnduranceConfig,
};
export type { ListenEnduranceConfig };

export const STUB_CANARY = "IIVO Glass is working";
export const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
];

export const LISTEN_INTERRUPT_QA_QUESTIONS = [
  "What are your thoughts on what he just said?",
  "How does that work?",
  "Turn that into action steps.",
  "Create a quick prompt from that.",
  "What did I miss?",
] as const;

/** Fallback questions — only used when no moment-driven question is viable. */
export const CONTEXT_FALLBACK_QUESTIONS = [
  "What is the main idea from the last few minutes?",
  "What did I miss?",
  "What should I remember from this part?",
  "Turn that into action steps.",
  "How would I use this for sales or business?",
  "Create a quick prompt from that.",
  "Give me the report so far.",
] as const;

export const HARNESS_SURFACE_MIN_INTERVAL_MS = 90_000;
export const HARNESS_MAX_SURFACES_PER_10_MIN = 3;

export interface ServerPreflightResult {
  ok: boolean;
  health?: Record<string, unknown>;
  failures: Array<{ category: string; cause: string; fix: string }>;
}

export interface GeneratedQuestion {
  question: string;
  momentId?: string;
  momentType?: string;
  reasonSelected: string;
  transcriptAnchors: string[];
  expectedAnswerAnchors: string[];
  disposition: "ask_now" | "deferred" | "none";
  source: "moment" | "fallback" | "report" | "interrupt";
}

export interface ListenHarnessRuntime {
  attentionLevel: ListenAttentionLevel;
  lastSurfaceMs?: number;
  surfaceTimestamps: number[];
  recentSurfacedTexts: string[];
  recentQuestionTypes: string[];
  surfacedMoments: ListenMoment[];
  savedSilently: ListenMoment[];
  staleMoments: ListenMoment[];
  suppressedMoments: Array<{ reason: string; thought?: string; segmentKind?: ListenSegmentKind }>;
  segmentCounts: Partial<Record<ListenSegmentKind, number>>;
  listenStartedMs?: number;
  firstProactiveCardMs?: number;
  generatedThoughts: Array<{
    momentId: string;
    thought: string;
    disposition: "surfaced" | "saved_silently" | "deferred";
    reasonSelected: string;
    at: string;
    cardPreview?: string;
    cardVague?: boolean;
    hasFullText?: boolean;
    actionFirst?: boolean;
    anchorCount?: number;
  }>;
  listenCardRuntime: ListenCardRuntimeState;
  maxSimultaneousCards: number;
  cardsSurfaced: number;
  actionFirstCardCount: number;
  vagueCardCount: number;
  liveNotesUpdates: number;
  noAudioPromptsCount: number;
  listeningLimitFired: boolean;
  listeningLimitFiredAtMs?: number;
  warmupRespected: boolean;
}

export function createListenHarnessRuntime(
  attentionLevel: ListenAttentionLevel = "balanced",
): ListenHarnessRuntime {
  return {
    attentionLevel,
    surfaceTimestamps: [],
    recentSurfacedTexts: [],
    recentQuestionTypes: [],
    surfacedMoments: [],
    savedSilently: [],
    staleMoments: [],
    suppressedMoments: [],
    segmentCounts: {},
    generatedThoughts: [],
    listenCardRuntime: initialListenCardRuntimeState(),
    maxSimultaneousCards: 0,
    cardsSurfaced: 0,
    actionFirstCardCount: 0,
    vagueCardCount: 0,
    liveNotesUpdates: 0,
    noAudioPromptsCount: 0,
    listeningLimitFired: false,
    warmupRespected: true,
  };
}

export function parseListenLiveMinutes(argv: string[]): number {
  let minutes = 60;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--minutes" && argv[i + 1]) {
      minutes = Math.max(1, Number(argv[++i]) || 60);
    }
  }
  return minutes;
}

export interface ListenLiveCliOptions extends ListenEnduranceConfig {
  warmupSeconds?: number;
  /** YouTube/video URL to open for the live run (not hardcoded proof). */
  videoUrl?: string;
  /** Attempt harness recovery when transcript stalls or listening drops. */
  autoFix: boolean;
}

function parseStringFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1].trim() || undefined;
  return undefined;
}

export function parseListenLiveCli(argv: string[] = process.argv.slice(2)): ListenLiveCliOptions {
  const base = parseListenEnduranceCli(argv);
  let warmupSeconds: number | undefined;
  const i = argv.indexOf("--warmup-seconds");
  if (i >= 0 && argv[i + 1]) {
    warmupSeconds = Math.max(0, Number(argv[i + 1]) || 0);
  }
  return {
    ...base,
    warmupSeconds,
    videoUrl: parseStringFlag(argv, "--url"),
    autoFix: argv.includes("--auto-fix"),
  };
}

export async function runServerPreflight(apiUrl: string): Promise<ServerPreflightResult> {
  const failures: ServerPreflightResult["failures"] = [];
  let health: Record<string, unknown> | undefined;

  try {
    const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
    health = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !health.ok) {
      failures.push({
        category: "server_offline",
        cause: "Server health check failed or API keys missing.",
        fix: "Run `npm run dev` and ensure OPENAI_API_KEY is set.",
      });
    }
  } catch (err) {
    failures.push({
      category: "server_offline",
      cause: err instanceof Error ? err.message : String(err),
      fix: `Start the server at ${apiUrl} before running live Listen QA.`,
    });
    return { ok: false, failures };
  }

  const stt = health.stt as { configured?: boolean; enabled?: boolean; reason?: string } | undefined;
  if (!stt?.configured || !stt?.enabled) {
    failures.push({
      category: "stt_missing",
      cause: stt?.reason ?? "STT not configured on server.",
      fix: "Set OPENAI_API_KEY on the server for /api/transcribe-audio.",
    });
  }

  const vision = health.vision as { configured?: boolean; reason?: string } | undefined;
  if (!vision?.configured) {
    failures.push({
      category: "vision_not_configured",
      cause: vision?.reason ?? "Vision not configured (optional for Listen).",
      fix: "Set vision model env vars if screen text extraction is needed.",
    });
  }

  const glassModels = health.glassModels as { defaultModel?: string; text?: { primary?: string } } | undefined;
  const primary = glassModels?.text?.primary ?? glassModels?.defaultModel ?? "";
  if (!/gpt-5\.5/i.test(primary)) {
    failures.push({
      category: "gpt55_not_configured",
      cause: `Primary glass model is "${primary || "unknown"}", expected GPT-5.5.`,
      fix: "Set IIVO_GLASS_OPENAI_MODEL=gpt-5.5 or ensure default is gpt-5.5.",
    });
  }

  const critical = failures.filter((f) => f.category !== "vision_not_configured");
  return { ok: critical.length === 0, health, failures };
}

export function summarizeMomentStats(moments: ListenMoment[]) {
  return {
    detected: moments.length,
    developing: moments.filter((m) => m.status === "pending" || m.status === "developing").length,
    ready: moments.filter((m) => m.status === "ready").length,
    surfaced: moments.filter((m) => m.status === "surfaced").length,
    savedSilently: moments.filter((m) => m.status === "saved_silently").length,
    stale: moments.filter((m) => m.status === "stale").length,
    dismissed: moments.filter((m) => m.status === "dismissed").length,
  };
}

export interface HarnessMomentAnalysis {
  candidate: ListenMoment | null;
  decision: string;
  reason: string;
  thought?: string;
}

export function analyzeListenMomentWithHarness(opts: {
  moments: ListenMoment[];
  runtime: ListenHarnessRuntime;
  recentTranscriptChars: number;
  lastChunkMs?: number;
  userReceivingAnswer?: boolean;
  nowMs?: number;
  listenWarmupMs?: number;
  segmentKind?: ListenSegmentKind;
  segmentSuppressProactive?: boolean;
  newTranscript?: string;
  visibleText?: string;
  mediaTitle?: string;
}): HarnessMomentAnalysis {
  const nowMs = opts.nowMs ?? Date.now();
  if (!opts.runtime.listenStartedMs) opts.runtime.listenStartedMs = nowMs;

  if (opts.newTranscript) {
    const segment = classifyListenSegment({
      transcript: opts.newTranscript,
      visibleText: opts.visibleText,
      mediaTitle: opts.mediaTitle,
    });
    opts.runtime.segmentCounts[segment.kind] = (opts.runtime.segmentCounts[segment.kind] ?? 0) + 1;
    opts.segmentKind = segment.kind;
    opts.segmentSuppressProactive = segment.suppressProactive;
  }

  const candidate = pickBestListenMomentForSurface(opts.moments);
  if (!candidate) {
    return { candidate: null, decision: "do_nothing", reason: "No candidate moment." };
  }

  const surfacesInLast10Min = countSurfacesInLast10Min(opts.runtime.surfaceTimestamps, nowMs);
  const { decision, reason } = shouldSurfaceListenMoment(candidate, {
    attentionLevel: opts.runtime.attentionLevel,
    nowMs,
    lastSurfaceMs: opts.runtime.lastSurfaceMs,
    lastChunkMs: opts.lastChunkMs,
    recentTranscriptChars: opts.recentTranscriptChars,
    recentSurfacedTexts: opts.runtime.recentSurfacedTexts,
    userReceivingAnswer: opts.userReceivingAnswer ?? false,
    muteSuggestions: false,
    surfacesInLast10Min,
    listenStartedMs: opts.runtime.listenStartedMs,
    listenWarmupMs: opts.listenWarmupMs ?? DEFAULT_LISTEN_WARMUP_MS,
    segmentKind: opts.segmentKind,
    segmentSuppressProactive: opts.segmentSuppressProactive,
    liveThoughtsEnabled: opts.runtime.attentionLevel === "active",
  });

  let effectiveDecision = decision;
  let effectiveReason = reason;

  if (decision === "surface_now") {
    if (
      opts.runtime.lastSurfaceMs != null &&
      nowMs - opts.runtime.lastSurfaceMs < HARNESS_SURFACE_MIN_INTERVAL_MS
    ) {
      effectiveDecision = "save_silently";
      effectiveReason = "Harness: min 90s between surfaced thoughts.";
    } else if (surfacesInLast10Min >= HARNESS_MAX_SURFACES_PER_10_MIN) {
      effectiveDecision = "save_silently";
      effectiveReason = "Harness: max 3 surfaced thoughts per 10 minutes.";
    }
  }

  const thought = candidate.suggestedThought ?? generateListenThought(candidate).suggestedThought;

  return {
    candidate,
    decision: effectiveDecision,
    reason: effectiveReason,
    thought,
  };
}

export function applyHarnessMomentDecision(
  analysis: HarnessMomentAnalysis,
  runtime: ListenHarnessRuntime,
  nowMs = Date.now(),
): void {
  if (!analysis.candidate) return;
  const moment = analysis.candidate;
  const thought = analysis.thought ?? moment.suggestedThought ?? moment.summary;

  if (analysis.decision === "surface_now") {
    const activeMoment = runtime.surfacedMoments.find(
      (m) => m.id === runtime.listenCardRuntime.activeMomentId,
    );
    const cardDecision = decideListenCardSurface({
      runtime: runtime.listenCardRuntime,
      moment: { ...moment, suggestedThought: thought },
      hasVisibleListenCard: Boolean(runtime.listenCardRuntime.activeCardId),
      activeMoment,
    });

    if (cardDecision === "save_silently" || cardDecision === "queue_silent") {
      runtime.savedSilently.push({ ...moment, status: "saved_silently", disposition: "saved_silently" });
      runtime.suppressedMoments.push({
        reason: `One-card rule: ${cardDecision}`,
        thought,
        segmentKind: moment.segmentKind,
      });
      runtime.generatedThoughts.push({
        momentId: moment.id,
        thought,
        disposition: "saved_silently",
        reasonSelected: `One-card rule (${cardDecision})`,
        at: new Date(nowMs).toISOString(),
      });
      runtime.listenCardRuntime = {
        ...runtime.listenCardRuntime,
        queuedMomentIds: [...runtime.listenCardRuntime.queuedMomentIds, moment.id].slice(-20),
      };
      return;
    }

    runtime.lastSurfaceMs = nowMs;
    runtime.surfaceTimestamps.push(nowMs);
    if (runtime.firstProactiveCardMs == null) {
      runtime.firstProactiveCardMs = nowMs - (runtime.listenStartedMs ?? nowMs);
    }
    runtime.recentSurfacedTexts.push(thought);
    if (runtime.recentSurfacedTexts.length > 12) runtime.recentSurfacedTexts.shift();
    const feed = buildListenThoughtFeedContent({ ...moment, suggestedThought: thought });
    const cardVague = listenCardTextIsVague(`${feed.title} ${feed.body}`);
    const actionFirst = isActionFirstListenCard(`${feed.title} ${feed.body}`);
    const cardId = runtime.listenCardRuntime.activeCardId ?? `card-${moment.id}`;
    runtime.listenCardRuntime = {
      activeCardId: cardId,
      activeMomentId: moment.id,
      queuedMomentIds: runtime.listenCardRuntime.queuedMomentIds.filter((id) => id !== moment.id),
    };
    runtime.maxSimultaneousCards = Math.max(runtime.maxSimultaneousCards, 1);
    runtime.cardsSurfaced += cardDecision === "surface_new" ? 1 : 0;
    if (cardVague) runtime.vagueCardCount += 1;
    if (actionFirst) runtime.actionFirstCardCount += 1;
    runtime.surfacedMoments.push({ ...moment, status: "surfaced", disposition: "surfaced" });
    runtime.generatedThoughts.push({
      momentId: moment.id,
      thought,
      disposition: "surfaced",
      reasonSelected: analysis.reason,
      at: new Date(nowMs).toISOString(),
      cardPreview: feed.body,
      cardVague,
      hasFullText: Boolean(feed.fullBody && feed.fullBody.length > feed.body.length),
      actionFirst,
      anchorCount: moment.transcriptAnchors.length,
    });
  } else if (analysis.decision === "save_silently") {
    runtime.liveNotesUpdates += 1;
    runtime.savedSilently.push({ ...moment, status: "saved_silently", disposition: "saved_silently" });
    runtime.suppressedMoments.push({
      reason: analysis.reason,
      thought,
      segmentKind: moment.segmentKind,
    });
    runtime.generatedThoughts.push({
      momentId: moment.id,
      thought,
      disposition: "saved_silently",
      reasonSelected: analysis.reason,
      at: new Date(nowMs).toISOString(),
    });
  } else if (analysis.decision === "mark_stale") {
    runtime.staleMoments.push({ ...moment, status: "stale" });
  }
}

function extractConceptPhrase(anchor: string): string {
  const words = anchor.replace(/\s+/g, " ").trim().split(" ").slice(0, 8);
  return words.join(" ");
}

export function generateQuestionFromMoment(moment: ListenMoment): GeneratedQuestion | null {
  const anchor = moment.transcriptAnchors[0] ?? moment.summary;
  if (!anchor || anchor.length < 20) return null;

  const expectedAnswerAnchors = [anchor.slice(0, 80)];
  let question: string;

  switch (moment.type) {
    case "framework":
    case "confusing_concept":
      question = `How does ${extractConceptPhrase(anchor)} work?`;
      break;
    case "tactic":
      question = "How could someone apply this tactic?";
      break;
    case "claim":
      question = "What assumption is behind this claim?";
      break;
    case "sales_tactic":
    case "business_opportunity":
      question = "How could this be used in sales or business?";
      break;
    case "implementation_idea":
    case "prompt_idea":
      question = "Create a quick prompt from this.";
      break;
    case "action_step":
      question = "Turn that into action steps.";
      break;
    case "key_idea":
      question = "What is the main idea from the last few minutes?";
      break;
    default:
      question = "What should I remember from this part?";
  }

  return {
    question,
    momentId: moment.id,
    momentType: moment.type,
    reasonSelected: moment.reasonSelected ?? `Moment type ${moment.type} ready for follow-up.`,
    transcriptAnchors: moment.transcriptAnchors,
    expectedAnswerAnchors,
    disposition: "ask_now",
    source: "moment",
  };
}

export function questionRequiresRecentContext(question: string): boolean {
  const q = question.toLowerCase();
  return (
    q.includes("how does that work") ||
    q.includes("turn that into") ||
    q.includes("from that") ||
    q.includes("this tactic") ||
    q.includes("this claim") ||
    q.includes("from this")
  );
}

export function hasEnoughTranscriptForQuestion(
  question: string,
  transcriptText: string,
  minChars = LISTEN_MIN_TRANSCRIPT_CHARS,
): boolean {
  if (transcriptText.trim().length < minChars) return false;
  if (questionRequiresRecentContext(question) && transcriptText.trim().length < minChars + 40) {
    return false;
  }
  return true;
}

export function pickContextAwareQuestion(opts: {
  moments: ListenMoment[];
  transcriptText: string;
  runtime: ListenHarnessRuntime;
  allowReport?: boolean;
  fallbackIndex?: number;
}): GeneratedQuestion | null {
  const { moments, transcriptText, runtime, allowReport } = opts;

  const ready = moments.filter((m) => m.status === "ready" || m.status === "developing");
  for (const moment of ready.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.importance] - rank[a.importance] || b.confidence - a.confidence;
  })) {
    if (runtime.recentQuestionTypes.includes(moment.type)) continue;
    const generated = generateQuestionFromMoment(moment);
    if (!generated) continue;
    if (!hasEnoughTranscriptForQuestion(generated.question, transcriptText)) continue;
    runtime.recentQuestionTypes.push(moment.type);
    if (runtime.recentQuestionTypes.length > 6) runtime.recentQuestionTypes.shift();
    return generated;
  }

  if (allowReport && transcriptText.length >= LISTEN_MIN_TRANSCRIPT_CHARS) {
    return {
      question: "Give me the report so far.",
      reasonSelected: "End-of-run Listen Report request.",
      transcriptAnchors: [transcriptText.slice(-200)],
      expectedAnswerAnchors: [],
      disposition: "ask_now",
      source: "report",
    };
  }

  const fallbackIdx = opts.fallbackIndex ?? 0;
  const fallback = CONTEXT_FALLBACK_QUESTIONS[fallbackIdx % CONTEXT_FALLBACK_QUESTIONS.length];
  if (!hasEnoughTranscriptForQuestion(fallback, transcriptText)) return null;

  return {
    question: fallback,
    reasonSelected: "No ready moment — using context-aware fallback.",
    transcriptAnchors: [transcriptText.slice(-150)],
    expectedAnswerAnchors: [transcriptText.slice(-80)],
    disposition: "ask_now",
    source: "fallback",
  };
}

export function evaluateListenMomentsFromTranscript(
  chunks: Array<{ text?: string; title?: string }>,
  existingMoments: ListenMoment[] = [],
  mediaTitle?: string,
): ListenMoment[] {
  const text = chunks.map((c) => (c.text ?? c.title ?? "").trim()).join(" ");
  const last = chunks.at(-1);
  const newText = (last?.text ?? last?.title ?? "").trim();
  const segment = classifyListenSegment({ transcript: newText, mediaTitle });
  return evaluateListenMoments({
    newText,
    recentTranscript: text,
    existingMoments,
    nowMs: Date.now(),
    segmentKind: segment.kind,
  });
}

export interface GradeListenAnswerInput {
  answer: string;
  routeUsed?: string;
  modelUsed?: string;
  hasTranscript: boolean;
  mediaContext?: MediaContext | null;
  question?: GeneratedQuestion | null;
  transcriptText?: string;
}

export function gradeListenLiveAnswer(input: GradeListenAnswerInput): {
  flags: string[];
  verdict: "strong" | "acceptable" | "weak";
} {
  const { answer, routeUsed, modelUsed, hasTranscript, mediaContext, question, transcriptText } = input;
  const flags: string[] = [];

  if (!answer?.trim()) flags.push("empty_answer");
  if (answer?.includes(STUB_CANARY)) flags.push("stub_text");
  for (const m of COUNCIL_MARKERS) {
    if (answer?.includes(m)) flags.push("council_format");
  }
  if (modelUsed && !/gpt-5\.5/i.test(modelUsed)) flags.push("not_gpt55");
  if (routeUsed && !["glass_direct", "glass_visual_direct"].includes(routeUsed)) {
    flags.push("bad_route");
  }
  if (answerClaimsFacialRecognition(answer ?? "")) flags.push("facial_recognition_claim");
  if (answerClaimsFakeAudio(answer ?? "", hasTranscript)) flags.push("fake_audio_claim");
  if (!hasTranscript) flags.push("no_transcript_backing");

  if (question?.expectedAnswerAnchors?.length && transcriptText) {
    const overlap = question.expectedAnswerAnchors.some((anchor) => {
      const words = anchor.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const hit = words.filter((w) => answer.toLowerCase().includes(w));
      return hit.length >= Math.min(2, words.length);
    });
    if (!overlap && question.source === "moment") flags.push("ignores_transcript_anchors");
  }

  if (mediaContext?.title) {
    const token = mediaContext.title.split(/\s+/).find((w) => w.length > 4)?.toLowerCase();
    if (token && !answer.toLowerCase().includes(token)) {
      flags.push("missing_media_context");
    }
  }

  const genericPatterns = [
    /here are some general tips/i,
    /without more context/i,
    /I don't have access/i,
    /as an AI language model/i,
  ];
  if (genericPatterns.some((re) => re.test(answer))) flags.push("generic_answer");

  const weak = flags.some((f) =>
    [
      "empty_answer",
      "stub_text",
      "council_format",
      "fake_audio_claim",
      "facial_recognition_claim",
      "ignores_transcript_anchors",
      "generic_answer",
      "no_transcript_backing",
    ].includes(f),
  );
  const verdict = weak ? "weak" : flags.length > 2 ? "acceptable" : "strong";
  return { flags, verdict };
}

export function gradeMediaExtraction(media: MediaContext | null | undefined): {
  captured: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  if (!media) {
    notes.push("Media context not extracted — window title/URL may be unavailable.");
    return { captured: false, notes };
  }
  if (media.sourceType === "youtube") notes.push("YouTube detected from window/URL.");
  else notes.push(`Source type: ${media.sourceType}`);
  if (media.title) notes.push(`Title extracted: ${media.title.slice(0, 80)}`);
  else notes.push("Title not visible in window title — may need frontmost video tab.");
  if (media.channelOrSource) notes.push(`Channel/source: ${media.channelOrSource}`);
  else notes.push("Channel not extracted — only present if visible on page/window.");
  if (media.durationLabel) notes.push(`Duration: ${media.durationLabel}`);
  if (media.url) notes.push(`URL: ${media.url}`);
  if (media.extractionNotes?.length) notes.push(...media.extractionNotes);
  return { captured: true, notes };
}

export function buildHarnessListenReport(opts: {
  moments: ListenMoment[];
  mediaContext?: MediaContext | null;
  transcriptText: string;
  sessionTitle?: string;
}): string {
  const session = {
    id: "live-qa",
    title: opts.sessionTitle ?? "Live Listen QA",
    status: "ended" as const,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
    insights: [],
  };
  const sections = buildListenReportSections({
    session,
    moments: opts.moments,
    mediaContext: opts.mediaContext,
  });
  if (opts.transcriptText.trim() && sections[1]) {
    sections[1].items = [opts.transcriptText.slice(-300) || sections[1].items[0]!];
  }
  return buildListenReportMarkdown(sections);
}

export function sessionHasRawAudioOrBase64(session: unknown): boolean {
  const raw = JSON.stringify(session ?? {});
  return /base64|audio\/wav|data:image/i.test(raw);
}

export interface ListenHarnessQualityResult {
  failures: string[];
  warnings: string[];
  warmupDurationMs: number;
  firstProactiveCardMs?: number;
  cardTooEarly: boolean;
  anyVagueCard: boolean;
  cardFullTextAccessible: boolean;
  maxSimultaneousCards: number;
  duplicateTranscriptLines: number;
  listeningLimitFiredEarly: boolean;
  actionFirstCardCount: number;
  micChunksInListen: number;
}

const DUPLICATE_TRANSCRIPT_THRESHOLD = 3;

/** Grade live Listen QA for warm-up, segment, card, dedupe, and limit gates. */
export function gradeListenHarnessQuality(opts: {
  runtime: ListenHarnessRuntime;
  listenWarmupMs?: number;
  userAskTimestamps?: number[];
  duplicateTranscriptLines?: number;
  listeningLimitFired?: boolean;
  listeningElapsedMs?: number;
  maxListeningMin?: number;
  micChunks?: number;
  transcriptChunkCount?: number;
  liveNotesEntryCount?: number;
}): ListenHarnessQualityResult {
  const warmupDurationMs = opts.listenWarmupMs ?? DEFAULT_LISTEN_WARMUP_MS;
  const failures: string[] = [];
  const warnings: string[] = [];
  const duplicateTranscriptLines = opts.duplicateTranscriptLines ?? 0;
  const maxListeningMin = opts.maxListeningMin ?? 120;
  const listeningElapsedMs = opts.listeningElapsedMs ?? 0;

  const firstProactive = opts.runtime.firstProactiveCardMs;
  const cardTooEarly =
    firstProactive != null && firstProactive < warmupDurationMs && !opts.userAskTimestamps?.length;
  if (cardTooEarly) {
    failures.push(
      `Proactive card appeared at ${Math.round(firstProactive / 1000)}s before warm-up (${warmupDurationMs / 1000}s).`,
    );
  }

  if (opts.runtime.maxSimultaneousCards > 1) {
    failures.push(`Max simultaneous cards ${opts.runtime.maxSimultaneousCards} — expected 1.`);
  }

  if (duplicateTranscriptLines > DUPLICATE_TRANSCRIPT_THRESHOLD) {
    failures.push(
      `Duplicate transcript repetition ${duplicateTranscriptLines} exceeds threshold ${DUPLICATE_TRANSCRIPT_THRESHOLD}.`,
    );
  }

  const limitEnabled = maxListeningMin > 0;
  const limitMs = maxListeningMin * 60_000;
  const listeningLimitFiredEarly =
    Boolean(opts.listeningLimitFired) && limitEnabled && listeningElapsedMs < limitMs * 0.9;
  if (listeningLimitFiredEarly) {
    failures.push(
      `Listening limit fired at ${Math.round(listeningElapsedMs / 1000)}s with ${maxListeningMin} min configured.`,
    );
  }

  const surfaced = opts.runtime.generatedThoughts.filter((t) => t.disposition === "surfaced");
  const anyVagueCard = surfaced.some((t) => t.cardVague === true);
  if (anyVagueCard) failures.push("Surfaced card used vague copy without enough context.");

  const actionFirstCardCount = opts.runtime.actionFirstCardCount;
  if (actionFirstCardCount > 0) {
    failures.push(`${actionFirstCardCount} action-first card(s) surfaced before maturity.`);
  }

  if (opts.runtime.attentionLevel === "balanced" && opts.runtime.cardsSurfaced > 0) {
    failures.push(
      `Balanced Listen surfaced ${opts.runtime.cardsSurfaced} proactive card(s) — expected note-first silence.`,
    );
  }

  if (
    opts.transcriptChunkCount != null &&
    opts.transcriptChunkCount > 0 &&
    (opts.liveNotesEntryCount ?? 0) === 0 &&
    opts.runtime.savedSilently.length === 0
  ) {
    failures.push("Transcript chunks received but Live Notes are missing.");
  }

  for (const t of surfaced) {
    if (t.anchorCount != null && t.anchorCount < 1) {
      failures.push("Surfaced card missing transcript anchor.");
    }
  }

  const cardFullTextAccessible =
    surfaced.length === 0 || surfaced.every((t) => t.hasFullText !== false);
  if (!cardFullTextAccessible) failures.push("Surfaced card missing expandable full text.");

  for (const s of opts.runtime.suppressedMoments) {
    if (
      s.segmentKind &&
      ["ad", "sponsor", "intro"].includes(s.segmentKind) &&
      s.reason.includes("surface_now")
    ) {
      failures.push(`Ad/intro/sponsor segment triggered surface: ${s.segmentKind}`);
    }
  }

  const micChunksInListen = opts.micChunks ?? 0;
  if (micChunksInListen > 0) {
    failures.push(`${micChunksInListen} microphone chunk(s) detected during Listen mode.`);
  }

  return {
    failures,
    warnings,
    warmupDurationMs,
    firstProactiveCardMs: firstProactive,
    cardTooEarly,
    anyVagueCard,
    cardFullTextAccessible,
    maxSimultaneousCards: opts.runtime.maxSimultaneousCards,
    duplicateTranscriptLines,
    listeningLimitFiredEarly,
    actionFirstCardCount,
    micChunksInListen,
  };
}

/** Metrics for live Listen QA report. */
export function buildListenHarnessNoteMetrics(opts: {
  moments: ListenMoment[];
  transcriptChunks: string[];
  runtime: ListenHarnessRuntime;
}): {
  transcriptChunksReceived: number;
  duplicateTranscriptCount: number;
  liveNotesCreated: number;
  noteUpdates: number;
  actionCardsShown: number;
  stackedCardsCount: number;
  noAudioPromptsCount: number;
  noteExamples: string[];
  userInterruptedTooMuch: boolean;
} {
  const notes = buildListenLiveNotes({
    moments: opts.moments,
    transcriptChunks: opts.transcriptChunks,
  });
  const examples = notes.entries
    .filter((e) => e.status === "mature")
    .slice(0, 3)
    .map((e) => `[${e.section}] ${e.text.slice(0, 120)}`);
  return {
    transcriptChunksReceived: opts.transcriptChunks.length,
    duplicateTranscriptCount: notes.duplicateTranscriptCount,
    liveNotesCreated: notes.entries.length,
    noteUpdates: opts.runtime.liveNotesUpdates,
    actionCardsShown: opts.runtime.actionFirstCardCount,
    stackedCardsCount: Math.max(0, opts.runtime.maxSimultaneousCards - 1),
    noAudioPromptsCount: opts.runtime.noAudioPromptsCount,
    noteExamples: examples,
    userInterruptedTooMuch:
      opts.runtime.cardsSurfaced > 1 ||
      opts.runtime.actionFirstCardCount > 0 ||
      opts.runtime.maxSimultaneousCards > 1,
  };
}

export { classifyListenSegment, listenCardTextIsVague, buildListenThoughtFeedContent, countDuplicateTranscriptLines };

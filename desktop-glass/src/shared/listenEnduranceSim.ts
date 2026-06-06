/**
 * Fast Listen Mode endurance simulation — no real audio.
 * Validates memory, dedupe, cards, checkpoints, and report for multi-hour runs.
 */

import { appendTranscriptDeduped, countDuplicateTranscriptLines, isDuplicateTranscriptChunk } from "./transcriptDedupe.ts";
import {
  buildListenCheckpointSummary,
  shouldWriteListenCheckpoint,
  type ListenCheckpointSummary,
} from "./listenCheckpoint.ts";
import {
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  createListenHarnessRuntime,
  gradeListenHarnessQuality,
  type ListenHarnessRuntime,
} from "./listenLiveHarness.ts";
import type { ListenEnduranceConfig } from "./listenEnduranceConfig.ts";
import { effectiveMaxListeningMinutes } from "./listenEnduranceConfig.ts";
import {
  createGptCallBudgetState,
  canMakeGptCall,
  recordGptCall,
  type GptCallBudgetState,
} from "./listenGptCallBudget.ts";
import { evaluateListenMoments } from "./listenMomentIntelligence.ts";
import { buildListenReportMarkdown, buildListenReportSections } from "./listenReport.ts";
import {
  combinedTranscriptText,
  pruneRunningTranscript,
  pruneTranscriptSessionEvents,
  MAX_RUNNING_TRANSCRIPT_CHARS,
  MAX_TRANSCRIPT_EVENTS_IN_SESSION,
} from "./listenSessionRetention.ts";
import { shouldTriggerListeningLimit } from "./listeningLimit.ts";
import type { GlassSessionEvent } from "./sessionTypes.ts";
import type { ListenMoment } from "./listenMomentTypes.ts";
import { clearListenModeRuntime, prepareListenModeSession } from "./listenModeRuntime.ts";

export const ENDURANCE_SIM_TICK_MS = 60_000;
export const ENDURANCE_SIM_FAST_MS_PER_TICK = 60_000;

const CONTENT_LINES = [
  "Distribution beats pure software speed when you are an early-stage founder building in public.",
  "The speaker explains go-to-market before product polish and why audience matters more than features early on.",
  "A practical framework: find one channel, repeat the message, measure conversion weekly.",
  "Warning: scaling ads before product-market fit burns runway without learning signal.",
  "Example: a solo founder grew to ten thousand users through community posts before launching paid tiers.",
];

const AD_LINES = [
  "This episode is sponsored by Acme Cloud — use code PODCAST for twenty percent off.",
  "We'll be right back after this quick message from our partner.",
];

const INTRO_LINES = [
  "Welcome back to the show — today we're diving into founder distribution strategies.",
];

export interface EnduranceSimStats {
  simulatedHours: number;
  ticks: number;
  chunksIngested: number;
  duplicateBursts: number;
  maxRunningTranscriptChars: number;
  maxSessionEvents: number;
  checkpointsWritten: number;
  cardsSurfaced: number;
  gptCalls: number;
  gptCappedSkips: number;
  listeningLimitTriggered: boolean;
}

export interface EnduranceSimResult {
  ok: boolean;
  simulatedOnly: true;
  failures: string[];
  warnings: string[];
  stats: EnduranceSimStats;
  checkpoints: ListenCheckpointSummary[];
  finalReport: string;
  harnessRuntime: ListenHarnessRuntime;
}

function makeEvent(text: string, timestamp: string, tags: string[] = ["system_audio"]): GlassSessionEvent {
  return {
    id: `ev-${timestamp}`,
    sessionId: "sim",
    kind: "transcript_note",
    timestamp,
    title: text.slice(0, 70),
    text,
    tags,
  };
}

function appendSimTranscriptEvent(
  sessionEvents: GlassSessionEvent[],
  text: string,
  timestamp: string,
  tags: string[],
): boolean {
  const recent = sessionEvents.filter((e) => e.kind === "transcript_note").slice(-40);
  if (isDuplicateTranscriptChunk(text, "system_audio", recent)) return false;
  sessionEvents.push(makeEvent(text, timestamp, tags));
  return true;
}

function chunkForTick(tickIndex: number, totalTicks: number): { text: string; tags: string[]; segment: string } {
  const phase = tickIndex / totalTicks;
  if (phase < 0.02) {
    return { text: INTRO_LINES[tickIndex % INTRO_LINES.length]!, tags: ["system_audio"], segment: "intro" };
  }
  if (tickIndex % 47 === 0) {
    return { text: AD_LINES[tickIndex % AD_LINES.length]!, tags: ["system_audio"], segment: "ad" };
  }
  if (tickIndex % 19 === 0) {
    const line = CONTENT_LINES[tickIndex % CONTENT_LINES.length]!;
    return { text: line, tags: ["system_audio"], segment: "content-dup" };
  }
  const line = CONTENT_LINES[tickIndex % CONTENT_LINES.length]!;
  return { text: `${line} Segment ${tickIndex}.`, tags: ["system_audio"], segment: "content" };
}

/** Run fast 6-hour Listen simulation (no real audio). */
export function runListenEnduranceSim(config: ListenEnduranceConfig): EnduranceSimResult {
  const hours = config.hours ?? config.minutes / 60;
  const totalTicks = Math.max(1, Math.round(hours * 60));
  const listenStartedMs = 1_000_000;
  const failures: string[] = [];
  const warnings: string[] = [];

  let runningTranscript = "";
  let sessionEvents: GlassSessionEvent[] = [];
  let moments: ListenMoment[] = [];
  let listenRuntime = prepareListenModeSession(clearListenModeRuntime(), listenStartedMs);
  const harnessRuntime = createListenHarnessRuntime(config.attention);
  harnessRuntime.listenStartedMs = listenStartedMs;

  let gptBudget: GptCallBudgetState = createGptCallBudgetState(config.maxGptCallsPerHour, listenStartedMs);
  let lastCheckpointIndex = 0;
  const checkpoints: ListenCheckpointSummary[] = [];
  let duplicateBursts = 0;
  let chunksIngested = 0;
  let listeningLimitTriggered = false;

  const maxListeningMin = effectiveMaxListeningMinutes(config);
  let limitReached = false;

  for (let tick = 0; tick < totalTicks; tick++) {
    const nowMs = listenStartedMs + (tick + 1) * ENDURANCE_SIM_FAST_MS_PER_TICK;
    const elapsedMs = nowMs - listenStartedMs;

    if (
      shouldTriggerListeningLimit({
        elapsedMs,
        maxListeningMin,
        extensionMs: 0,
        limitReached,
        listening: true,
      })
    ) {
      listeningLimitTriggered = true;
      limitReached = true;
      if (config.minutes >= 360 && maxListeningMin === 0) {
        failures.push(`Listening limit triggered at tick ${tick} with limit disabled.`);
      }
    }

    const { text, tags, segment } = chunkForTick(tick, totalTicks);

    if (segment === "content-dup") {
      duplicateBursts += 1;
      for (let r = 0; r < 5; r++) {
        runningTranscript = appendTranscriptDeduped(runningTranscript, text);
        if (appendSimTranscriptEvent(sessionEvents, text, new Date(nowMs).toISOString(), tags)) {
          chunksIngested += 1;
        }
      }
    } else {
      runningTranscript = appendTranscriptDeduped(runningTranscript, text);
      if (appendSimTranscriptEvent(sessionEvents, text, new Date(nowMs).toISOString(), tags)) {
        chunksIngested += 1;
      }
    }

    runningTranscript = pruneRunningTranscript(runningTranscript, MAX_RUNNING_TRANSCRIPT_CHARS);
    sessionEvents = pruneTranscriptSessionEvents(sessionEvents, {
      maxTranscriptEvents: MAX_TRANSCRIPT_EVENTS_IN_SESSION,
    });

    const recentTranscript = combinedTranscriptText(sessionEvents, 6000);
    moments = evaluateListenMoments({
      newText: text,
      recentTranscript,
      existingMoments: moments,
      nowMs,
      idFactory: () => `sim-${tick}-${Math.random().toString(36).slice(2, 6)}`,
      segmentKind: segment === "ad" ? "ad" : segment === "intro" ? "intro" : "content",
    });
    listenRuntime = { ...listenRuntime, moments };

    if (nowMs - listenStartedMs >= config.warmupMinutes * 60_000) {
      const analysis = analyzeListenMomentWithHarness({
        moments,
        runtime: harnessRuntime,
        recentTranscriptChars: recentTranscript.length,
        lastChunkMs: nowMs,
        nowMs,
        listenWarmupMs: config.warmupMinutes * 60_000,
      });
      if (analysis.candidate) {
        applyHarnessMomentDecision(analysis, harnessRuntime, nowMs);
      }
    }

    const cp = shouldWriteListenCheckpoint({
      listenStartedMs,
      nowMs,
      lastCheckpointIndex,
      checkpointMinutes: config.checkpointMinutes,
    });
    if (cp.write) {
      lastCheckpointIndex = cp.checkpointIndex;
      const summary = buildListenCheckpointSummary({
        checkpointIndex: cp.checkpointIndex,
        listenStartedMs,
        nowMs,
        moments,
        checkpointMinutes: config.checkpointMinutes,
      });
      checkpoints.push(summary);
    }

    if (canMakeGptCall(gptBudget, nowMs) && tick % 30 === 0 && recentTranscript.length > 120) {
      gptBudget = recordGptCall(gptBudget, nowMs);
    }
  }

  const dupLines = countDuplicateTranscriptLines(
    sessionEvents
      .filter((e) => e.kind === "transcript_note")
      .map((e) => ({ text: e.text ?? e.title ?? "" })),
  );
  if (config.failOnDuplicateTranscriptSpam && dupLines > 3) {
    failures.push(`Duplicate transcript lines ${dupLines} exceed threshold.`);
  }

  if (runningTranscript.length > MAX_RUNNING_TRANSCRIPT_CHARS) {
    failures.push(`Running transcript exceeded cap (${runningTranscript.length}).`);
  }

  if (sessionEvents.filter((e) => e.kind === "transcript_note").length > MAX_TRANSCRIPT_EVENTS_IN_SESSION) {
    failures.push("Session transcript events exceeded retention cap.");
  }

  const quality = gradeListenHarnessQuality({
    runtime: harnessRuntime,
    listenWarmupMs: config.warmupMinutes * 60_000,
    duplicateTranscriptLines: dupLines,
    listeningLimitFired: listeningLimitTriggered,
    listeningElapsedMs: totalTicks * ENDURANCE_SIM_FAST_MS_PER_TICK,
    maxListeningMin,
    micChunks: 0,
  });
  failures.push(...quality.failures);

  if (checkpoints.length < Math.max(1, Math.floor(hours * 60 / config.checkpointMinutes) - 1)) {
    warnings.push(
      `Expected ~${Math.floor(hours * 60 / config.checkpointMinutes)} checkpoints, got ${checkpoints.length}.`,
    );
  }

  const reportSections = buildListenReportSections({
    session: {
      id: "sim",
      title: "Endurance simulation",
      status: "ended",
      startedAt: new Date(listenStartedMs).toISOString(),
      updatedAt: new Date().toISOString(),
      events: sessionEvents,
      insights: [],
    },
    moments,
    checkpoints,
  });
  const finalReport = buildListenReportMarkdown(reportSections);

  listenRuntime = clearListenModeRuntime();
  const postClearMoments = listenRuntime.moments.length;
  if (postClearMoments !== 0) {
    failures.push("Stop Everything cleanup did not clear listen runtime moments.");
  }

  const stats: EnduranceSimStats = {
    simulatedHours: hours,
    ticks: totalTicks,
    chunksIngested,
    duplicateBursts,
    maxRunningTranscriptChars: runningTranscript.length,
    maxSessionEvents: sessionEvents.length,
    checkpointsWritten: checkpoints.length,
    cardsSurfaced: harnessRuntime.cardsSurfaced,
    gptCalls: gptBudget.totalCalls,
    gptCappedSkips: gptBudget.cappedSkips,
    listeningLimitTriggered,
  };

  if (hours >= 6 && maxListeningMin === 0 && listeningLimitTriggered) {
    failures.push("6-hour sim with limit off still hit listening limit.");
  }

  return {
    ok: failures.length === 0,
    simulatedOnly: true,
    failures,
    warnings,
    stats,
    checkpoints,
    finalReport,
    harnessRuntime,
  };
}

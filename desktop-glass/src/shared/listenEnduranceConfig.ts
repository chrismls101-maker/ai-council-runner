/**
 * Listen Mode endurance run configuration — 6-hour overnight prep.
 * Pure CLI parsing and validation; no electron / fs.
 */

import type { ListenAttentionLevel } from "./listenMomentTypes.ts";
import { isListeningLimitEnabled } from "./listeningLimit.ts";

export const ENDURANCE_MIN_MINUTES = 360;
export const DEFAULT_CHECKPOINT_MINUTES = 30;
export const DEFAULT_MAX_GPT_CALLS_PER_HOUR = 12;
export const DEFAULT_CONTEXT_WINDOW_MINUTES = 5;
export const DEFAULT_WARMUP_MINUTES = 2;

export interface ListenEnduranceConfig {
  minutes: number;
  maxListeningMinutes: number;
  checkpointMinutes: number;
  maxGptCallsPerHour: number;
  contextWindowMinutes: number;
  warmupMinutes: number;
  attention: ListenAttentionLevel;
  realAudioRequired: boolean;
  recordAnswers: boolean;
  recordThoughts: boolean;
  failOnMicChunks: boolean;
  failOnDuplicateTranscriptSpam: boolean;
  reportEveryCheckpoint: boolean;
  manual: boolean;
  attach: boolean;
  keepGlass: boolean;
  /** Simulation only */
  hours?: number;
  speed?: "fast" | "realtime";
}

export function defaultListenEnduranceConfig(
  overrides: Partial<ListenEnduranceConfig> = {},
): ListenEnduranceConfig {
  return {
    minutes: 60,
    maxListeningMinutes: 0,
    checkpointMinutes: DEFAULT_CHECKPOINT_MINUTES,
    maxGptCallsPerHour: DEFAULT_MAX_GPT_CALLS_PER_HOUR,
    contextWindowMinutes: DEFAULT_CONTEXT_WINDOW_MINUTES,
    warmupMinutes: DEFAULT_WARMUP_MINUTES,
    attention: "balanced",
    realAudioRequired: false,
    recordAnswers: false,
    recordThoughts: false,
    failOnMicChunks: true,
    failOnDuplicateTranscriptSpam: true,
    reportEveryCheckpoint: false,
    manual: false,
    attach: false,
    keepGlass: false,
    ...overrides,
  };
}

function parseFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseNumberFlag(argv: string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] != null) {
    const n = Number(argv[i + 1]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function parseAttention(argv: string[]): ListenAttentionLevel {
  const i = argv.indexOf("--attention");
  if (i >= 0 && argv[i + 1]) {
    const v = argv[i + 1] as ListenAttentionLevel;
    if (v === "quiet" || v === "balanced" || v === "active") return v;
  }
  return "balanced";
}

/** Parse endurance + live QA CLI flags from argv. */
export function parseListenEnduranceCli(argv: string[] = process.argv.slice(2)): ListenEnduranceConfig {
  const hoursFlag = parseNumberFlag(argv, "--hours", 0);
  const minutesFlag = parseNumberFlag(argv, "--minutes", hoursFlag > 0 ? hoursFlag * 60 : 60);

  let speed: "fast" | "realtime" | undefined;
  const speedIdx = argv.indexOf("--speed");
  if (speedIdx >= 0 && argv[speedIdx + 1] === "fast") speed = "fast";
  else if (speedIdx >= 0 && argv[speedIdx + 1] === "realtime") speed = "realtime";

  return defaultListenEnduranceConfig({
    minutes: Math.max(1, minutesFlag),
    hours: hoursFlag > 0 ? hoursFlag : undefined,
    speed,
    maxListeningMinutes: parseNumberFlag(argv, "--max-listening-minutes", 0),
    checkpointMinutes: parseNumberFlag(argv, "--checkpoint-minutes", DEFAULT_CHECKPOINT_MINUTES),
    maxGptCallsPerHour: parseNumberFlag(argv, "--max-gpt-calls-per-hour", DEFAULT_MAX_GPT_CALLS_PER_HOUR),
    contextWindowMinutes: parseNumberFlag(argv, "--context-window-minutes", DEFAULT_CONTEXT_WINDOW_MINUTES),
    warmupMinutes: parseNumberFlag(argv, "--warmup-minutes", DEFAULT_WARMUP_MINUTES),
    attention: parseAttention(argv),
    realAudioRequired: parseFlag(argv, "--real-audio-required"),
    recordAnswers: parseFlag(argv, "--record-answers"),
    recordThoughts: parseFlag(argv, "--record-thoughts"),
    failOnMicChunks: !parseFlag(argv, "--allow-mic-chunks"),
    failOnDuplicateTranscriptSpam: !parseFlag(argv, "--allow-duplicate-spam"),
    reportEveryCheckpoint: parseFlag(argv, "--report-every-checkpoint"),
    manual: parseFlag(argv, "--manual"),
    attach: parseFlag(argv, "--attach"),
    keepGlass: parseFlag(argv, "--keep-glass"),
  });
}

export function effectiveMaxListeningMinutes(config: ListenEnduranceConfig): number {
  if (config.maxListeningMinutes === 0) return 0;
  if (config.minutes >= ENDURANCE_MIN_MINUTES) {
    return Math.max(config.maxListeningMinutes, ENDURANCE_MIN_MINUTES);
  }
  return config.maxListeningMinutes;
}

export function validateEnduranceConfig(config: ListenEnduranceConfig): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.minutes >= ENDURANCE_MIN_MINUTES) {
    const effective = effectiveMaxListeningMinutes(config);
    if (isListeningLimitEnabled(effective) && effective < ENDURANCE_MIN_MINUTES) {
      errors.push(
        `Listening limit ${effective} min is below ${ENDURANCE_MIN_MINUTES} min required for a ${config.minutes}-minute run. Use --max-listening-minutes 0 or >= ${ENDURANCE_MIN_MINUTES}.`,
      );
    }
  }

  if (config.checkpointMinutes < 5 || config.checkpointMinutes > 120) {
    warnings.push(`checkpoint-minutes=${config.checkpointMinutes} is unusual; expected 5–120.`);
  }

  if (config.contextWindowMinutes < 2 || config.contextWindowMinutes > 5) {
    warnings.push(`context-window-minutes=${config.contextWindowMinutes}; recommended 2–5 for current-moment asks.`);
  }

  if (config.maxGptCallsPerHour < 1) {
    errors.push("max-gpt-calls-per-hour must be >= 1.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function formatEnduranceConfig(config: ListenEnduranceConfig): string {
  const effectiveLimit = effectiveMaxListeningMinutes(config);
  const limitLabel = effectiveLimit === 0 ? "off (no limit)" : `${effectiveLimit} min`;
  const lines = [
    "Listen endurance effective config:",
    `  minutes: ${config.minutes}`,
    `  max-listening-minutes: ${limitLabel}`,
    `  checkpoint-minutes: ${config.checkpointMinutes}`,
    `  max-gpt-calls-per-hour: ${config.maxGptCallsPerHour}`,
    `  context-window-minutes: ${config.contextWindowMinutes}`,
    `  warmup-minutes: ${config.warmupMinutes}`,
    `  attention: ${config.attention}`,
    `  real-audio-required: ${config.realAudioRequired}`,
    `  record-answers: ${config.recordAnswers}`,
    `  record-thoughts: ${config.recordThoughts}`,
    `  fail-on-mic-chunks: ${config.failOnMicChunks}`,
    `  fail-on-duplicate-transcript-spam: ${config.failOnDuplicateTranscriptSpam}`,
    `  report-every-checkpoint: ${config.reportEveryCheckpoint}`,
  ];
  if (config.hours != null) lines.push(`  hours (sim): ${config.hours}`);
  if (config.speed) lines.push(`  speed: ${config.speed}`);
  return lines.join("\n");
}

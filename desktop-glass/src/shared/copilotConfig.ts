/**
 * Session Copilot configuration parsing, clamping, and "offer" logic.
 * Pure functions — no electron / fs.
 */

import {
  COPILOT_INTERVAL_OPTIONS,
  COPILOT_MODE_LABELS,
  DEFAULT_COPILOT_CONFIG,
  type GlassCopilotConfig,
  type GlassCopilotMode,
} from "./copilotTypes.ts";

const VALID_MODES = new Set<GlassCopilotMode>(["off", "passive", "coaching", "diagnostic"]);

export function isCopilotMode(value: unknown): value is GlassCopilotMode {
  return typeof value === "string" && VALID_MODES.has(value as GlassCopilotMode);
}

export function parseCopilotMode(value: unknown): GlassCopilotMode {
  return isCopilotMode(value) ? value : DEFAULT_COPILOT_CONFIG.mode;
}

/** Snap an arbitrary number to the nearest allowed interval (60/90/120). */
export function clampCopilotInterval(value: unknown): 60 | 90 | 120 {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_COPILOT_CONFIG.intervalSec;
  let best: 60 | 90 | 120 = DEFAULT_COPILOT_CONFIG.intervalSec;
  let bestDelta = Infinity;
  for (const option of COPILOT_INTERVAL_OPTIONS) {
    const delta = Math.abs(option - n);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option;
    }
  }
  return best;
}

function clampMinutes(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Build a validated config from an untrusted (persisted/IPC) partial. */
export function parseCopilotConfig(raw: unknown): GlassCopilotConfig {
  const record = (raw && typeof raw === "object" ? raw : {}) as Partial<GlassCopilotConfig>;
  return {
    mode: parseCopilotMode(record.mode),
    intervalSec: clampCopilotInterval(record.intervalSec),
    showOverlaySuggestions: parseBool(record.showOverlaySuggestions, DEFAULT_COPILOT_CONFIG.showOverlaySuggestions),
    autoDebriefOnEnd: parseBool(record.autoDebriefOnEnd, DEFAULT_COPILOT_CONFIG.autoDebriefOnEnd),
    silenceTimeoutMin: clampMinutes(record.silenceTimeoutMin, DEFAULT_COPILOT_CONFIG.silenceTimeoutMin, 1, 60),
    maxListeningMin: clampMinutes(record.maxListeningMin, DEFAULT_COPILOT_CONFIG.maxListeningMin, 5, 480),
    muteSuggestions: parseBool(record.muteSuggestions, DEFAULT_COPILOT_CONFIG.muteSuggestions),
  };
}

export function copilotStatusLabel(mode: GlassCopilotMode): string {
  return COPILOT_MODE_LABELS[mode];
}

/**
 * Whether to surface the "Turn on Session Copilot?" offer. Triggered when the
 * user starts system audio inside a live session while copilot is off and the
 * offer has not already been shown/declined this session.
 */
export function shouldOfferCopilot(opts: {
  mode: GlassCopilotMode;
  sessionLive: boolean;
  systemAudioActive: boolean;
  alreadyOffered: boolean;
}): boolean {
  return (
    opts.mode === "off" &&
    opts.sessionLive &&
    opts.systemAudioActive &&
    !opts.alreadyOffered
  );
}

/** Apply a single config field change with validation, returning a new config. */
export function withCopilotConfig(
  current: GlassCopilotConfig,
  patch: Partial<GlassCopilotConfig>,
): GlassCopilotConfig {
  return parseCopilotConfig({ ...current, ...patch });
}

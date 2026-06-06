/**
 * IIVO Glass — simple one-click mode presets.
 *
 * Each user-facing mode (Listen / Meetings / Work / Fix) maps to the right
 * internal Session Copilot + transcription settings so users never configure an
 * engine. Voice is a separate interaction loop (not one of these cards) and is
 * intentionally excluded from this preset list.
 *
 * Pure data + mapping only — no electron / fs / React, so it stays unit-testable
 * and shareable across main + renderer + tests.
 */

import type { GlassCopilotMode } from "./copilotTypes.ts";
import type { GlassCopilotSessionTypeSetting } from "./copilotSessionType.ts";
import type { CopilotInputSource } from "./copilotPanelModel.ts";

/** User-facing simple mode ids (Voice is handled separately). */
export type GlassModeId = "listen" | "meetings" | "work" | "fix" | "translate";

export interface GlassModePreset {
  id: GlassModeId;
  /** Short, simple user-facing name. */
  label: string;
  /** One short sentence describing the mode. */
  description: string;
  /** Examples of when to use it (for tooltip / advanced help). */
  examples: string;
  /** Internal Session Copilot mode this preset turns on. */
  copilotMode: GlassCopilotMode;
  /** Internal session focus (session type setting). */
  sessionFocus: GlassCopilotSessionTypeSetting;
  /** Preferred input source. "ask" = prompt the user to choose. */
  preferredInputSource: CopilotInputSource | "ask";
  /** Whether the mode requires system audio to be configured before listening. */
  requiresSystemAudio: boolean;
  /** Whether the mode needs any audio at all. */
  requiresAudio: boolean;
  /** Always starts a local session when activated. */
  startsSession: boolean;
  /** Starts listening automatically *only* when the source is ready + permitted. */
  startsListeningIfReady: boolean;
  /** Meeting intelligence extraction enabled. */
  meetingIntelligence: boolean;
  /** Debrief generation enabled for this mode. */
  debriefEnabled: boolean;
  /** Active Listening context + interruption routing enabled. */
  activeListeningEnabled: boolean;
}

export const GLASS_MODE_PRESETS: Record<GlassModeId, GlassModePreset> = {
  listen: {
    id: "listen",
    label: "Listen",
    description: "Capture key ideas from anything playing on your computer.",
    examples: "Videos, podcasts, courses, webinars, browser audio, sales videos, AI tutorials, product demos.",
    copilotMode: "coaching",
    sessionFocus: "video_learning",
    preferredInputSource: "system_audio",
    requiresSystemAudio: true,
    requiresAudio: true,
    startsSession: true,
    startsListeningIfReady: true,
    meetingIntelligence: false,
    debriefEnabled: true,
    activeListeningEnabled: true,
  },
  meetings: {
    id: "meetings",
    label: "Meetings",
    description: "Track decisions, owners, blockers, risks, and follow-ups.",
    examples: "Zoom, Meet, sales calls, customer calls, standups, investor calls, team calls.",
    copilotMode: "coaching",
    sessionFocus: "meeting_call",
    preferredInputSource: "ask",
    requiresSystemAudio: false,
    requiresAudio: true,
    startsSession: true,
    startsListeningIfReady: false,
    meetingIntelligence: true,
    debriefEnabled: true,
    activeListeningEnabled: true,
  },
  work: {
    id: "work",
    label: "Work",
    description: "Help while you work, plan, research, write, or build.",
    examples: "Coding, research, planning, writing, strategy, documents, sales work, studying.",
    copilotMode: "coaching",
    sessionFocus: "auto",
    preferredInputSource: "none",
    requiresSystemAudio: false,
    requiresAudio: false,
    startsSession: true,
    startsListeningIfReady: false,
    meetingIntelligence: false,
    debriefEnabled: true,
    activeListeningEnabled: true,
  },
  fix: {
    id: "fix",
    label: "Fix",
    description: "Watch what's stuck and help diagnose it.",
    examples: "Bugs, setup loops, repeated errors, confusion, failed builds, stuck workflows.",
    copilotMode: "diagnostic",
    sessionFocus: "auto",
    preferredInputSource: "none",
    requiresSystemAudio: false,
    requiresAudio: false,
    startsSession: true,
    startsListeningIfReady: false,
    meetingIntelligence: false,
    debriefEnabled: true,
    activeListeningEnabled: true,
  },
  translate: {
    id: "translate",
    label: "Translate",
    description: "Live captions in another language from computer audio or microphone.",
    examples: "YouTube videos, podcasts, Zoom/WhatsApp calls, courses, webinars, bilingual conversations.",
    copilotMode: "coaching",
    sessionFocus: "auto",
    preferredInputSource: "ask",
    requiresSystemAudio: false,
    requiresAudio: true,
    startsSession: true,
    startsListeningIfReady: false,
    meetingIntelligence: false,
    debriefEnabled: false,
    activeListeningEnabled: false,
  },
};

/** Voice is a separate primary action, not a Copilot card. */
export const VOICE_MODE_COPY = "Talk to IIVO hands-free.";

export const GLASS_MODE_ORDER: GlassModeId[] = ["listen", "meetings", "work", "fix"];

/** Quick Tools — universal capabilities outside the main mode grid. */
export type GlassQuickToolId = "voice" | "translate";

export const GLASS_QUICK_TOOLS: GlassQuickToolId[] = ["voice", "translate"];

export const GLASS_QUICK_TOOL_LABELS: Record<GlassQuickToolId, string> = {
  voice: "Voice",
  translate: "Translate",
};

export const GLASS_QUICK_TOOL_COPY: Record<GlassQuickToolId, string> = {
  voice: VOICE_MODE_COPY,
  translate: "Live captions for media, calls, and conversations.",
};

export function getModePreset(id: GlassModeId): GlassModePreset {
  return GLASS_MODE_PRESETS[id];
}

/** Compact privacy reassurances shown under the mode cards. */
export const MODE_PRIVACY_NOTES: string[] = [
  "No audio starts until you choose it.",
  "Raw audio is not stored by default.",
  "Screens are only captured when you ask.",
  "Stop Everything ends all active sources.",
];

export type GlassModeStatus =
  | "ready"
  | "needs_setup"
  | "active"
  | "listening"
  | "error";

export const MODE_STATUS_LABELS: Record<GlassModeStatus, string> = {
  ready: "Ready",
  needs_setup: "Needs setup",
  active: "Active",
  listening: "Listening",
  error: "Error",
};

export interface ModeRuntimeSignals {
  /** The currently active simple mode, if any. */
  activeMode: GlassModeId | null;
  systemAudioReady: boolean;
  listening: boolean;
  hasError: boolean;
}

/** Derive the per-card status badge from runtime signals. */
export function resolveModeStatus(
  preset: GlassModePreset,
  signals: ModeRuntimeSignals,
): GlassModeStatus {
  const isActive = signals.activeMode === preset.id;
  if (isActive && signals.hasError) return "error";
  if (isActive && signals.listening) return "listening";
  if (isActive) return "active";
  if (preset.requiresSystemAudio && !signals.systemAudioReady) return "needs_setup";
  return "ready";
}

/** Primary action label for a mode card given its status. */
export function modePrimaryActionLabel(
  preset: GlassModePreset,
  status: GlassModeStatus,
): string {
  if (status === "active" || status === "listening") return "Active";
  if (status === "needs_setup") return "Configure Audio";
  if (preset.id === "listen") return "Start Listening";
  if (preset.id === "meetings") return "Start Meeting";
  if (preset.id === "translate") return "Start Translate";
  return `Start ${preset.label}`;
}

export interface ModeActivationPlan {
  startSession: boolean;
  copilotMode: GlassCopilotMode;
  sessionFocus: GlassCopilotSessionTypeSetting;
  /** When true, the UI must ask the user how to listen before starting. */
  needsSourceChoice: boolean;
  /** When true, show the compact "system audio setup needed" card. */
  needsSystemAudioSetup: boolean;
  /** Start listening now (source ready + allowed). Never true on launch. */
  startListening: boolean;
  preferredInputSource: CopilotInputSource | "ask";
}

/**
 * Build the activation plan for a clicked mode. Never starts capture on launch:
 * listening only begins when the source is ready and the preset allows it.
 */
export function planModeActivation(
  preset: GlassModePreset,
  signals: { systemAudioReady: boolean; chosenSource?: CopilotInputSource | null },
): ModeActivationPlan {
  const needsSystemAudioSetup = preset.requiresSystemAudio && !signals.systemAudioReady;
  const needsSourceChoice =
    preset.preferredInputSource === "ask" && !signals.chosenSource;

  const startListening =
    preset.startsListeningIfReady &&
    preset.requiresSystemAudio &&
    signals.systemAudioReady;

  return {
    startSession: preset.startsSession,
    copilotMode: preset.copilotMode,
    sessionFocus: preset.sessionFocus,
    needsSourceChoice,
    needsSystemAudioSetup,
    startListening,
    preferredInputSource: preset.preferredInputSource,
  };
}

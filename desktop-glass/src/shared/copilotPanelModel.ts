/**
 * User-facing Session Copilot panel model.
 *
 * Maps clean UI labels (Session Focus, Input Source) to existing internal
 * copilot + transcription settings without changing backend behavior.
 */

import type { TranscriptionMode } from "./audioCaptureTypes.ts";
import type { GlassCopilotSessionTypeSetting } from "./copilotSessionType.ts";

/** Copilot analysis mode — mirrors GlassCopilotMode. */
export type CopilotPanelMode = "off" | "passive" | "coaching" | "diagnostic";

/** User-facing session focus options (pins internal session type when not Auto). */
export interface SessionFocusOption {
  value: GlassCopilotSessionTypeSetting;
  label: string;
}

export const SESSION_FOCUS_OPTIONS: SessionFocusOption[] = [
  { value: "auto", label: "Auto" },
  { value: "meeting_call", label: "Meeting / Call" },
  { value: "video_learning", label: "Listening / Media" },
  { value: "coding_building", label: "Coding / Building" },
  { value: "research", label: "Research" },
  { value: "sales_review", label: "Sales" },
  { value: "studying", label: "Studying" },
  { value: "business_strategy", label: "Strategy" },
  { value: "general_workflow", label: "General Workflow" },
];

/** Input source for listening / context capture (user-facing). */
export type CopilotInputSource = "none" | "microphone" | "system_audio" | "screen" | "mixed";

export interface InputSourceOption {
  value: CopilotInputSource;
  label: string;
  hint: string;
}

export const INPUT_SOURCE_OPTIONS: InputSourceOption[] = [
  { value: "none", label: "None", hint: "Manual paste or typed transcript only." },
  {
    value: "microphone",
    label: "Microphone",
    hint: "Dictate from your mic. Starts only when you press Start Listening.",
  },
  {
    value: "system_audio",
    label: "System Audio",
    hint: "YouTube, podcasts, webinars, courses, and browser audio via BlackHole/Loopback.",
  },
  {
    value: "screen",
    label: "Screen / Visual",
    hint: "Visual asks use the command bar. Screen capture never starts on launch.",
  },
  {
    value: "mixed",
    label: "Mixed context",
    hint: "Active when listening plus screen/session context is present.",
  },
];

export function sessionFocusLabel(value: GlassCopilotSessionTypeSetting): string {
  return SESSION_FOCUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isListeningMediaFocus(value: GlassCopilotSessionTypeSetting): boolean {
  return value === "video_learning";
}

/** Map user input source → transcription mode. Never auto-starts listening. */
export function inputSourceToTranscriptionMode(
  source: CopilotInputSource,
  micMode: TranscriptionMode = "microphone_web_speech",
): TranscriptionMode {
  switch (source) {
    case "microphone":
      return micMode === "microphone_media_recorder" ? micMode : "microphone_web_speech";
    case "system_audio":
      return "system_audio";
    case "screen":
    case "mixed":
    case "none":
    default:
      return "manual";
  }
}

/** Resolve the panel input source from runtime transcription + privacy flags. */
export function resolveInputSource(params: {
  transcriptionMode: TranscriptionMode;
  listening: boolean;
  capturing: boolean;
  hasSessionContext: boolean;
}): CopilotInputSource {
  const { transcriptionMode, listening, capturing, hasSessionContext } = params;
  const micActive =
    listening &&
    (transcriptionMode === "microphone_web_speech" ||
      transcriptionMode === "microphone_media_recorder");
  const sysActive = listening && transcriptionMode === "system_audio";

  if ((micActive || sysActive) && (capturing || hasSessionContext)) return "mixed";
  if (sysActive || transcriptionMode === "system_audio") return "system_audio";
  if (
    micActive ||
    transcriptionMode === "microphone_web_speech" ||
    transcriptionMode === "microphone_media_recorder"
  ) {
    return "microphone";
  }
  if (capturing) return "screen";
  return "none";
}

export function inputSourceStatusLabel(source: CopilotInputSource, listening: boolean): string {
  if (source === "none") return "Not listening";
  if (source === "mixed") return listening ? "Listening · mixed context" : "Mixed context";
  if (source === "microphone") return listening ? "Listening · microphone" : "Microphone ready";
  if (source === "system_audio") return listening ? "Listening · system audio" : "System audio ready";
  if (source === "screen") return "Visual / screen context";
  return "—";
}

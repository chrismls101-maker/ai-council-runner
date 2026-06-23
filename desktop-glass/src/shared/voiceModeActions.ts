/**
 * IIVO Glass — Voice Mode action mapping (pure).
 *
 * Translates a resolved {@link VoiceRoute} into the concrete IPC commands the
 * renderer must send, and maps machine status to a human label. Kept pure so the
 * wiring is fully unit-testable without React/Electron.
 *
 * Routing reuses the existing pipeline:
 * - direct / visual → `submit-command` (the main process auto-captures the
 *   screen when the phrase is visual, via shouldCaptureScreenForGlassAsk).
 * - debrief         → `copilot-generate-debrief`.
 */

import type { GlassCommand } from "./ipc.ts";
import type { VoiceModeStatus, VoiceRoute } from "./voiceModeState.ts";
import { resolveVoiceRoute } from "./voiceModeState.ts";
import { isCoderIntent } from "./voiceCoderIntent.ts";

/** Commands to issue for a finished transcript on a given route. */
export function voiceRouteToCommands(route: VoiceRoute, transcript: string): GlassCommand[] {
  const text = transcript.trim();
  if (!text) return [];
  switch (route) {
    case "debrief":
      return [{ type: "copilot-generate-debrief" }];
    case "visual":
    case "direct":
    default:
      // Main detects visual intent on the text and captures the screen itself.
      return [{ type: "submit-command", text }];
  }
}

/** Full submit plan for a transcript: the chosen route plus the commands. */
export function voiceSubmitPlan(
  transcript: string,
  voiceCoderEnabled = true,
): {
  route: VoiceRoute | "voice_coder";
  commands: GlassCommand[];
} {
  if (voiceCoderEnabled && isCoderIntent(transcript)) {
    return {
      route: "voice_coder",
      commands: [{
        type: "open-coder-with-prompt",
        prompt: transcript.trim(),
      }],
    };
  }
  const route = resolveVoiceRoute(transcript);
  return { route, commands: voiceRouteToCommands(route, transcript) };
}

/** Stop Everything tears down mic, system audio, capture, pending ask, and state. */
export function stopEverythingCommand(): GlassCommand {
  return { type: "stop-everything" };
}

/** Cancel only the in-flight ask (keeps Voice Mode listening). */
export function cancelAskCommand(): GlassCommand {
  return { type: "cancel-glass-ask" };
}

const STATUS_LABELS: Record<VoiceModeStatus, string> = {
  idle: "",
  listening: "Listening…",
  transcribing: "Transcribing…",
  deciding: "Deciding route…",
  looking: "Looking…",
  thinking: "Thinking…",
  answering: "Answering…",
  error: "Error",
  stopped: "Stopped",
};

/** Human-readable label for the current Voice Mode status. */
export function voiceModeStatusLabel(status: VoiceModeStatus): string {
  return STATUS_LABELS[status] ?? "";
}

/** Short label for the route, for display/telemetry. */
export function voiceRouteLabel(route: VoiceRoute): string {
  switch (route) {
    case "visual":
      return "Screen ask";
    case "debrief":
      return "Debrief";
    case "direct":
    default:
      return "Direct ask";
  }
}

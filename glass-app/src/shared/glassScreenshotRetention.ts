/**
 * Native Glass screenshot retention policy (shared, no Electron).
 *
 * Where pixels go:
 * - Manual session Capture → local disk (session-screenshots/) + timeline event
 * - Visual Ask (session + save on) → same as manual session capture
 * - Visual Ask (no session or save off) → RAM only for /api/glass/ask, then discarded
 * - OpenAI vision → image in HTTP body only (never in session JSON)
 * - Context Bridge → only when user opens/saves or auto-upload setting is on
 */

import type { GlassUserSettings } from "./glassSettings.ts";

/** Auto-hide "Screen used for this answer" after the response is shown. */
export const VISUAL_ASK_RETENTION_DISMISS_MS = 10_000;

export type GlassScreenshotRetentionKind =
  | "none"
  | "used_ephemeral"
  | "saved_session"
  | "not_saved"
  | "uploaded_context";

export interface GlassVisualAskRetention {
  kind: GlassScreenshotRetentionKind;
  /** Primary line for command bar / overlay, e.g. "Screen used for this answer" */
  label: string;
  /** Secondary line, e.g. "Not saved" */
  detail?: string;
  usedForAnswer: boolean;
  savedToSession: boolean;
  uploadedToContext: boolean;
}

export interface EphemeralVisualCapture {
  imageDataUrl: string;
  capturedAt: string;
  displayLabel?: string;
  displayId?: number;
  sourceTitle?: string;
  sessionId?: string;
  eventId?: string;
}

export function shouldPersistVisualAskToSession(
  settings: GlassUserSettings,
  sessionLive: boolean,
): boolean {
  return sessionLive && settings.saveVisualAsksToSession !== false;
}

export function shouldAutoUploadCapturesToContext(settings: GlassUserSettings): boolean {
  return settings.autoUploadCapturesToContext === true;
}

export function buildVisualAskRetentionStatus(input: {
  usedForAnswer: boolean;
  savedToSession: boolean;
  uploadedToContext: boolean;
}): GlassVisualAskRetention {
  const { usedForAnswer, savedToSession, uploadedToContext } = input;

  if (!usedForAnswer) {
    return {
      kind: "none",
      label: "",
      usedForAnswer: false,
      savedToSession: false,
      uploadedToContext: false,
    };
  }

  if (uploadedToContext) {
    return {
      kind: "uploaded_context",
      label: "Screen used for this answer",
      detail: savedToSession ? "Saved to session · Uploaded to Studio" : "Uploaded to Studio",
      usedForAnswer: true,
      savedToSession,
      uploadedToContext: true,
    };
  }

  if (savedToSession) {
    return {
      kind: "saved_session",
      label: "Screen used for this answer",
      detail: "Saved to session",
      usedForAnswer: true,
      savedToSession: true,
      uploadedToContext: false,
    };
  }

  return {
    kind: "not_saved",
    label: "Screen used for this answer",
    detail: "Not saved",
    usedForAnswer: true,
    savedToSession: false,
    uploadedToContext: false,
  };
}

/** After a non-persisted visual ask, drop in-memory screenshot bytes. */
export function shouldDiscardEphemeralAfterAsk(
  settings: GlassUserSettings,
  sessionLive: boolean,
  savedToSession: boolean,
): boolean {
  if (savedToSession) return false;
  return !shouldPersistVisualAskToSession(settings, sessionLive);
}

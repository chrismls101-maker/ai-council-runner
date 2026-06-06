/**
 * IIVO Glass — Live Translate types.
 * Reusable across media, calls, Listen, and Meetings. Pure — no electron / fs.
 */

export type LiveTranslateSource = "system_audio" | "microphone" | "both";

export type LiveTranslateLanguage =
  | "auto"
  | "en"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "other";

export type LiveTranslateTargetLanguage = Exclude<LiveTranslateLanguage, "auto">;

export type LiveTranslateDisplayMode = "translation_only" | "original_and_translation";

export type LiveTranslateCaptionPosition = "bottom_center" | "panel" | "both";

export type LiveTranslateSaveMode = "private_no_save" | "save_transcript" | "save_translation";

export interface LiveTranslateConfig {
  enabled: boolean;
  source: LiveTranslateSource;
  sourceLanguage: LiveTranslateLanguage;
  targetLanguage: LiveTranslateTargetLanguage;
  displayMode: LiveTranslateDisplayMode;
  captionPosition: LiveTranslateCaptionPosition;
  saveMode: LiveTranslateSaveMode;
}

export type LiveTranslateStatus = "idle" | "starting" | "active" | "paused" | "error";

export interface LiveTranslateCaptionLine {
  id: string;
  original: string;
  translated: string;
  interim: boolean;
  detectedLanguage?: LiveTranslateLanguage;
  languageUncertain?: boolean;
  alreadyTargetLanguage?: boolean;
  updatedAt: string;
}

export interface LiveTranslateCaptionsState {
  lines: LiveTranslateCaptionLine[];
  /** Current on-screen caption (max 2 lines worth of text). */
  current?: LiveTranslateCaptionLine;
  languagePairLabel: string;
}

export interface LiveTranslateRuntimeState {
  active: boolean;
  status: LiveTranslateStatus;
  config: LiveTranslateConfig;
  captions: LiveTranslateCaptionsState;
  captionsVisible: boolean;
  detectedSourceLanguage?: LiveTranslateLanguage;
  languageUncertain?: boolean;
  micExplicitlyEnabled: boolean;
  lastError?: string;
  lastUpdatedAt?: string;
}

export const LIVE_TRANSLATE_LANGUAGE_LABELS: Record<LiveTranslateLanguage, string> = {
  auto: "Auto-detect",
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  other: "Other",
};

export function liveTranslateLanguagePairLabel(
  source: LiveTranslateLanguage,
  target: LiveTranslateTargetLanguage,
  detected?: LiveTranslateLanguage,
): string {
  const from =
    source === "auto"
      ? detected && detected !== "auto"
        ? LIVE_TRANSLATE_LANGUAGE_LABELS[detected]
        : "Auto"
      : LIVE_TRANSLATE_LANGUAGE_LABELS[source];
  return `${from} → ${LIVE_TRANSLATE_LANGUAGE_LABELS[target]}`;
}

/**
 * IIVO Glass — Live Translate caption line management.
 * Interim updates in place; finals replace interim; dedupe repeated captions.
 */

import { isDuplicateText } from "./sessionIntelligence.ts";
import type {
  LiveTranslateCaptionLine,
  LiveTranslateCaptionsState,
  LiveTranslateConfig,
  LiveTranslateLanguage,
} from "./liveTranslateTypes.ts";
import {
  LIVE_TRANSLATE_LANGUAGE_CODES,
  liveTranslateLanguagePairLabel,
} from "./liveTranslateTypes.ts";

const MAX_HISTORY = 12;
const MAX_VISIBLE_CHARS = 220;

export function initialLiveTranslateCaptions(config: LiveTranslateConfig): LiveTranslateCaptionsState {
  return {
    lines: [],
    current: undefined,
    languagePairLabel: liveTranslateLanguagePairLabel(config.sourceLanguage, config.targetLanguage),
  };
}

function normalizeCaptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function captionKey(original: string, translated: string): string {
  return `${normalizeCaptionText(original).toLowerCase()}|${normalizeCaptionText(translated).toLowerCase()}`;
}

/** Reject duplicate consecutive captions. */
export function isDuplicateCaption(
  state: LiveTranslateCaptionsState,
  original: string,
  translated: string,
): boolean {
  const key = captionKey(original, translated);
  const current = state.current;
  if (current && captionKey(current.original, current.translated) === key) return true;
  const last = state.lines.at(-1);
  if (last && captionKey(last.original, last.translated) === key) return true;
  if (current && isDuplicateText(current.translated, translated)) return true;
  return false;
}

export interface ApplyCaptionChunkInput {
  original: string;
  translated: string;
  interim?: boolean;
  id?: string;
  detectedLanguage?: LiveTranslateLanguage;
  languageUncertain?: boolean;
  alreadyTargetLanguage?: boolean;
  nowIso?: string;
}

/** Update captions — interim replaces current; final commits line. */
export function applyCaptionChunk(
  state: LiveTranslateCaptionsState,
  input: ApplyCaptionChunkInput,
): LiveTranslateCaptionsState {
  const original = normalizeCaptionText(input.original);
  const translated = normalizeCaptionText(input.translated);
  if (!original && !translated) return state;

  const nowIso = input.nowIso ?? new Date().toISOString();
  const finalizeInterim =
    !input.interim &&
    Boolean(input.id && state.current?.interim && state.current.id === input.id);

  if (!finalizeInterim && isDuplicateCaption(state, original, translated)) return state;

  const line: LiveTranslateCaptionLine = {
    id: input.id ?? `cap-${nowIso}`,
    original,
    translated: translated || original,
    interim: input.interim === true,
    detectedLanguage: input.detectedLanguage,
    languageUncertain: input.languageUncertain,
    alreadyTargetLanguage: input.alreadyTargetLanguage,
    updatedAt: nowIso,
  };

  if (finalizeInterim) {
    const finalized = { ...line, interim: false };
    const lines = [...state.lines, finalized].slice(-MAX_HISTORY);
    return { ...state, lines, current: finalized };
  }

  if (input.interim) {
    return {
      ...state,
      current: line,
    };
  }

  const lines = [...state.lines, line].slice(-MAX_HISTORY);
  return {
    ...state,
    lines,
    current: line,
  };
}

function shortLanguageCode(
  lang: LiveTranslateLanguage | undefined,
  fallback: string,
): string {
  if (lang && lang !== "auto" && lang !== "other") {
    return LIVE_TRANSLATE_LANGUAGE_CODES[lang] ?? fallback;
  }
  return fallback;
}

/** Format caption for bottom-center overlay (max ~2 lines). */
export function formatCaptionForOverlay(
  line: LiveTranslateCaptionLine | undefined,
  displayMode: LiveTranslateConfig["displayMode"],
  languageLabels: {
    original?: string;
    translated?: string;
    originalCode?: string;
    translatedCode?: string;
  } = {},
): { primary: string; secondary?: string; note?: string; interim?: boolean } | null {
  if (!line) return null;

  if (line.alreadyTargetLanguage) {
    return {
      primary: line.original.slice(0, MAX_VISIBLE_CHARS),
      note: `Already ${languageLabels.translated ?? "target language"}`,
      interim: line.interim,
    };
  }

  if (displayMode === "original_and_translation") {
    const origLabel = languageLabels.originalCode ?? languageLabels.original ?? "Original";
    const transLabel = languageLabels.translatedCode ?? languageLabels.translated ?? "Translation";
    const orig = line.original.slice(0, MAX_VISIBLE_CHARS);
    const trans = line.translated.slice(0, MAX_VISIBLE_CHARS);
    return {
      primary: `${transLabel}: ${trans}`,
      secondary: `${origLabel}: ${orig}`,
      interim: line.interim,
    };
  }

  return {
    primary: line.translated.slice(0, MAX_VISIBLE_CHARS),
    secondary: line.languageUncertain ? "Language detection uncertain…" : undefined,
    interim: line.interim,
  };
}

export { shortLanguageCode };

/** Hide overlay captions without stopping translation engine. */
export function hideCaptionsOverlay(state: LiveTranslateCaptionsState): LiveTranslateCaptionsState {
  return { ...state };
}

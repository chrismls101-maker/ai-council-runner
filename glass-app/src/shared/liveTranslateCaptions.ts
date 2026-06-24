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

/** Strip model/mock language tags like `[en]` or `EN:` from translated caption text. */
function stripCaptionLanguagePrefix(text: string): string {
  return text
    .replace(/^\[(?:[a-z]{2,3}(?:-[a-z]{2})?)\]\s*/i, "")
    .replace(/^[A-Za-z]{2,3}:\s*/, "")
    .trim();
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
  /**
   * Groups chunks from the same continuous utterance (resets on UtteranceEnd / long silence).
   * Chunks sharing a sentenceId are APPENDED to the current caption line rather than replacing it,
   * producing YouTube-style captions that build up word by word within a sentence.
   */
  sentenceId?: string;
  detectedLanguage?: LiveTranslateLanguage;
  languageUncertain?: boolean;
  alreadyTargetLanguage?: boolean;
  nowIso?: string;
}

/** Update captions — interim replaces current; final appends within sentence, rolls on new sentence. */
export function applyCaptionChunk(
  state: LiveTranslateCaptionsState,
  input: ApplyCaptionChunkInput,
): LiveTranslateCaptionsState {
  const original = normalizeCaptionText(input.original);
  const translated = stripCaptionLanguagePrefix(normalizeCaptionText(input.translated));
  if (!original && !translated) return state;

  const nowIso = input.nowIso ?? new Date().toISOString();
  const finalizeInterim =
    !input.interim &&
    Boolean(input.id && state.current?.interim && state.current.id === input.id);

  if (!finalizeInterim && isDuplicateCaption(state, original, translated)) return state;

  // --- Interim: update current in place, no history push ---
  if (input.interim) {
    return {
      ...state,
      current: {
        id: input.id ?? `cap-${nowIso}`,
        sentenceId: input.sentenceId,
        original,
        translated: translated || original,
        interim: true,
        detectedLanguage: input.detectedLanguage,
        languageUncertain: input.languageUncertain,
        alreadyTargetLanguage: input.alreadyTargetLanguage,
        updatedAt: nowIso,
      },
    };
  }

  // --- Finalize interim: promote current interim to final ---
  if (finalizeInterim) {
    const finalized: LiveTranslateCaptionLine = {
      id: input.id!,
      sentenceId: input.sentenceId ?? state.current?.sentenceId,
      original,
      translated: translated || original,
      interim: false,
      detectedLanguage: input.detectedLanguage,
      languageUncertain: input.languageUncertain,
      alreadyTargetLanguage: input.alreadyTargetLanguage,
      updatedAt: nowIso,
    };
    const lines = [...state.lines, finalized].slice(-MAX_HISTORY);
    return { ...state, lines, current: finalized };
  }

  // --- Final chunk: append within sentence or start a new line ---
  const sameSentence =
    input.sentenceId &&
    state.current &&
    !state.current.interim &&
    state.current.sentenceId === input.sentenceId;

  if (sameSentence && state.current) {
    // Append to current sentence — builds up like YouTube captions.
    // Trim accumulated text to MAX_VISIBLE_CHARS so one very long sentence doesn't overflow.
    const appendedOriginal = normalizeCaptionText(`${state.current.original} ${original}`).slice(0, MAX_VISIBLE_CHARS);
    const appendedTranslated = normalizeCaptionText(`${state.current.translated} ${translated}`).slice(0, MAX_VISIBLE_CHARS);
    return {
      ...state,
      current: {
        ...state.current,
        original: appendedOriginal,
        translated: appendedTranslated,
        updatedAt: nowIso,
      },
    };
  }

  // New sentence — commit previous current to history, start fresh.
  const newLine: LiveTranslateCaptionLine = {
    id: input.id ?? `cap-${nowIso}`,
    sentenceId: input.sentenceId,
    original,
    translated: translated || original,
    interim: false,
    detectedLanguage: input.detectedLanguage,
    languageUncertain: input.languageUncertain,
    alreadyTargetLanguage: input.alreadyTargetLanguage,
    updatedAt: nowIso,
  };

  // If current was a completed (non-interim) sentence, push it to history.
  const prevLine = state.current && !state.current.interim ? state.current : null;
  const lines = prevLine
    ? [...state.lines, prevLine].slice(-MAX_HISTORY)
    : state.lines;

  return { ...state, lines, current: newLine };
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
      interim: line.interim,
    };
  }

  if (displayMode === "original_and_translation") {
    const orig = line.original.slice(0, MAX_VISIBLE_CHARS);
    const trans = stripCaptionLanguagePrefix(line.translated).slice(0, MAX_VISIBLE_CHARS);
    return {
      primary: trans,
      secondary: orig,
      interim: line.interim,
    };
  }

  return {
    primary: stripCaptionLanguagePrefix(line.translated).slice(0, MAX_VISIBLE_CHARS),
    interim: line.interim,
  };
}

export { shortLanguageCode };

/** Hide overlay captions without stopping translation engine. */
export function hideCaptionsOverlay(state: LiveTranslateCaptionsState): LiveTranslateCaptionsState {
  return { ...state };
}

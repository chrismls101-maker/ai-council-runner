/**
 * Live Translate — config normalization, mode defaults, glossary.
 */

import type {
  LiveTranslateConfig,
  LiveTranslateGlossaryTerm,
  LiveTranslateSaveMode,
  LiveTranslateTargetLanguage,
  LiveTranslateWorkflowMode,
} from "./liveTranslateTypes.ts";

/** Shorter STT segments for system-audio Live Translate (BlackHole / loopback). */
export const LIVE_TRANSLATE_CHUNK_MS = 1_500;

export const DEFAULT_GLOSSARY_TERMS: LiveTranslateGlossaryTerm[] = [
  { source: "IIVO", preserve: true },
  { source: "IIVO Glass", preserve: true },
];

/** Normalize legacy save_transcript → save_original_and_translation. */
export function normalizeSaveMode(saveMode: string | undefined): LiveTranslateSaveMode {
  if (saveMode === "save_transcript") return "save_original_and_translation";
  if (
    saveMode === "save_translation" ||
    saveMode === "save_original_and_translation" ||
    saveMode === "private_no_save"
  ) {
    return saveMode;
  }
  return "private_no_save";
}

export function configDefaultsForMode(mode: LiveTranslateWorkflowMode): Partial<LiveTranslateConfig> {
  const shared = {
    source: "system_audio" as const,
    sourceLanguage: "auto" as const,
    captionPosition: "bottom_center" as const,
    saveMode: "private_no_save" as const,
    latencyMode: "balanced" as const,
    glossaryTerms: DEFAULT_GLOSSARY_TERMS,
  };
  if (mode === "media") {
    return {
      ...shared,
      mode: "media",
      displayMode: "translation_only",
    };
  }
  return {
    ...shared,
    mode: "conversation",
    displayMode: "original_and_translation",
  };
}

export const DEFAULT_LIVE_TRANSLATE_CONFIG: LiveTranslateConfig = {
  enabled: false,
  ...configDefaultsForMode("media"),
  targetLanguage: "en",
} as LiveTranslateConfig;

export function normalizeLiveTranslateConfig(
  patch: Partial<LiveTranslateConfig> & { saveMode?: string },
): LiveTranslateConfig {
  const mode = patch.mode ?? DEFAULT_LIVE_TRANSLATE_CONFIG.mode;
  const modeDefaults = configDefaultsForMode(mode);
  const merged = {
    ...DEFAULT_LIVE_TRANSLATE_CONFIG,
    ...modeDefaults,
    ...patch,
    mode,
  };
  return {
    ...merged,
    saveMode: normalizeSaveMode(patch.saveMode ?? merged.saveMode),
    captionPosition: merged.captionPosition === "panel" ? "bottom_center" : merged.captionPosition,
    glossaryTerms: patch.glossaryTerms ?? merged.glossaryTerms ?? DEFAULT_GLOSSARY_TERMS,
  };
}

export function buildTranslateStartPatch(
  mode: LiveTranslateWorkflowMode,
  target: LiveTranslateTargetLanguage,
  saveMode: LiveTranslateSaveMode = "private_no_save",
): Partial<LiveTranslateConfig> & { enabled: boolean } {
  const defaults = configDefaultsForMode(mode);
  return {
    enabled: true,
    ...defaults,
    source: defaults.source ?? "system_audio",
    targetLanguage: target,
    displayMode: defaults.displayMode ?? "translation_only",
    saveMode,
    sourceLanguage: "auto",
  };
}

export function saveModeStatusLabel(saveMode: LiveTranslateSaveMode): string {
  switch (normalizeSaveMode(saveMode)) {
    case "save_translation":
      return "Save: Translation only";
    case "save_original_and_translation":
      return "Save: Original + translation";
    default:
      return "Save: Off";
  }
}

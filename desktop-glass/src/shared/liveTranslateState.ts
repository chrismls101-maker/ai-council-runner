/**
 * IIVO Glass — Live Translate runtime state helpers.
 */

import {
  type LiveTranslateConfig,
  type LiveTranslateRuntimeState,
  liveTranslateLanguagePairLabel,
} from "./liveTranslateTypes.ts";
import {
  DEFAULT_LIVE_TRANSLATE_CONFIG,
  normalizeLiveTranslateConfig,
  normalizeSaveMode,
  saveModeStatusLabel,
} from "./liveTranslateConfig.ts";
import { initialLiveTranslateCaptions } from "./liveTranslateCaptions.ts";

export { DEFAULT_LIVE_TRANSLATE_CONFIG };

export function initialLiveTranslateRuntime(
  overrides: Partial<LiveTranslateConfig> = {},
): LiveTranslateRuntimeState {
  const config = normalizeLiveTranslateConfig(overrides);
  return {
    active: false,
    status: "idle",
    config,
    captions: initialLiveTranslateCaptions(config),
    captionsVisible: true,
    micExplicitlyEnabled: false,
  };
}

export function startLiveTranslate(
  runtime: LiveTranslateRuntimeState,
  patch: Partial<LiveTranslateConfig> = {},
): LiveTranslateRuntimeState {
  const config = normalizeLiveTranslateConfig({ ...runtime.config, ...patch, enabled: true });
  return {
    ...runtime,
    active: true,
    status: "starting",
    config,
    captions: initialLiveTranslateCaptions(config),
    captionsVisible: true,
    lastError: undefined,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function stopLiveTranslate(runtime: LiveTranslateRuntimeState): LiveTranslateRuntimeState {
  return {
    ...initialLiveTranslateRuntime({ ...runtime.config, enabled: false }),
    captionsVisible: false,
  };
}

export function updateLiveTranslateConfig(
  runtime: LiveTranslateRuntimeState,
  patch: Partial<LiveTranslateConfig>,
): LiveTranslateRuntimeState {
  const config = normalizeLiveTranslateConfig({ ...runtime.config, ...patch });
  return {
    ...runtime,
    config,
    captions: {
      ...runtime.captions,
      languagePairLabel: liveTranslateLanguagePairLabel(
        config.sourceLanguage,
        config.targetLanguage,
        runtime.detectedSourceLanguage,
      ),
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function setLiveTranslateStatus(
  runtime: LiveTranslateRuntimeState,
  status: LiveTranslateRuntimeState["status"],
): LiveTranslateRuntimeState {
  return { ...runtime, status, lastUpdatedAt: new Date().toISOString() };
}

/** Private mode default — do not persist transcript/translation to session. */
export function shouldPersistTranslateChunk(config: LiveTranslateConfig): boolean {
  return normalizeSaveMode(config.saveMode) !== "private_no_save";
}

export function shouldPersistTranslationOnly(config: LiveTranslateConfig): boolean {
  return normalizeSaveMode(config.saveMode) === "save_translation";
}

/** Mic only after explicit user opt-in for conversation translation. */
export function translateAllowsMicrophone(
  config: LiveTranslateConfig,
  micExplicitlyEnabled: boolean,
): boolean {
  if (!micExplicitlyEnabled) return false;
  return config.source === "microphone" || config.source === "both";
}

export function translateRequiresSystemAudio(config: LiveTranslateConfig): boolean {
  return config.source === "system_audio" || config.source === "both";
}

export function translateSourceStatusLabel(
  runtime: LiveTranslateRuntimeState,
  micOn: boolean,
): { translationActive: string; source: string; mic: string; save: string } {
  const source =
    runtime.config.source === "system_audio"
      ? "Computer Audio"
      : runtime.config.source === "microphone"
        ? "Microphone"
        : "Computer Audio + Microphone";
  return {
    translationActive: runtime.active && runtime.config.enabled ? "Translation Active" : "Translation Off",
    source: `Source: ${source}`,
    mic: micOn && translateAllowsMicrophone(runtime.config, runtime.micExplicitlyEnabled)
      ? "Mic: On"
      : "Mic: Off",
    save: saveModeStatusLabel(runtime.config.saveMode),
  };
}

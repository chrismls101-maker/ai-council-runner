import type { GlassSttState } from "./sttTypes.ts";

export type DeepgramWhisperFallbackScope =
  | "translate"
  | "listen"
  | "meetings"
  | "watch"
  | "companion";

export interface DeepgramWhisperFallbackPlan {
  stopTranslateDeepgram: boolean;
  stopCompanionDeepgram: boolean;
  stopListenDeepgram: boolean;
  nextStt: GlassSttState;
  activateTranslateFallback: boolean;
  activateListenFallback: boolean;
  activateMeetingsFallback: boolean;
  activateWatchFallback: boolean;
}

export function planDeepgramWhisperFallback(
  scope: DeepgramWhisperFallbackScope,
  stt: GlassSttState,
  translateFallbackAlreadyActive: boolean,
): DeepgramWhisperFallbackPlan | null {
  if (scope === "translate" && translateFallbackAlreadyActive) return null;

  if (scope === "translate") {
    return {
      stopTranslateDeepgram: true,
      stopCompanionDeepgram: false,
      stopListenDeepgram: false,
      nextStt: stt.deepgramEnabled === false ? stt : { ...stt, deepgramEnabled: false },
      activateTranslateFallback: true,
      activateListenFallback: false,
      activateMeetingsFallback: false,
      activateWatchFallback: false,
    };
  }

  if (scope === "companion") {
    return {
      stopTranslateDeepgram: false,
      stopCompanionDeepgram: true,
      stopListenDeepgram: false,
      nextStt: stt,
      activateTranslateFallback: false,
      activateListenFallback: false,
      activateMeetingsFallback: false,
      activateWatchFallback: false,
    };
  }

  if (scope === "listen") {
    return {
      stopTranslateDeepgram: false,
      stopCompanionDeepgram: false,
      stopListenDeepgram: true,
      nextStt: stt,
      activateTranslateFallback: false,
      activateListenFallback: true,
      activateMeetingsFallback: false,
      activateWatchFallback: false,
    };
  }

  if (scope === "meetings") {
    return {
      stopTranslateDeepgram: false,
      stopCompanionDeepgram: false,
      stopListenDeepgram: true,
      nextStt: stt,
      activateTranslateFallback: false,
      activateListenFallback: false,
      activateMeetingsFallback: true,
      activateWatchFallback: false,
    };
  }

  if (scope === "watch") {
    return {
      stopTranslateDeepgram: false,
      stopCompanionDeepgram: false,
      stopListenDeepgram: true,
      nextStt: stt,
      activateTranslateFallback: false,
      activateListenFallback: false,
      activateMeetingsFallback: false,
      activateWatchFallback: true,
    };
  }

  return null;
}

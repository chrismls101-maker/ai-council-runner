import type { GlassSttState } from "./sttTypes.ts";

export type DeepgramWhisperFallbackScope = "translate" | "listen" | "companion";

export interface DeepgramWhisperFallbackPlan {
  stopTranslateDeepgram: boolean;
  stopCompanionDeepgram: boolean;
  nextStt: GlassSttState;
  activateTranslateFallback: boolean;
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
      nextStt: stt.deepgramEnabled === false ? stt : { ...stt, deepgramEnabled: false },
      activateTranslateFallback: true,
    };
  }

  if (scope === "companion") {
    return {
      stopTranslateDeepgram: false,
      stopCompanionDeepgram: true,
      nextStt: stt,
      activateTranslateFallback: false,
    };
  }

  return null;
}

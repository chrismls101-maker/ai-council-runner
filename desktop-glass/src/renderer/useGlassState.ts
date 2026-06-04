import { useEffect, useState } from "react";
import type { GlassState } from "../shared/ipc.ts";
import { emptyNotes } from "../shared/noteExtraction.ts";
import { initialPrivacyState } from "../shared/privacyState.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import { WINDOW_CONTEXT_UNAVAILABLE_MESSAGE } from "../shared/windowContextTypes.ts";

import type { GlassSttState } from "../shared/sttTypes.ts";

const fallbackStt: GlassSttState = {
  provider: "none",
  status: "disabled",
  model: "gpt-4o-mini-transcribe",
  enabled: false,
  chunkMs: 20_000,
  autoStopEnabled: false,
  autoStopMs: 30 * 60 * 1000,
};

const fallbackState: GlassState = {
  privacy: initialPrivacyState,
  transcript: "",
  notes: emptyNotes(),
  moments: [],
  panelTab: "summary",
  config: DEFAULT_CONFIG,
  session: null,
  sessionSummary: "",
  sessionActionStatus: "idle",
  transcriptionMode: "manual",
  systemAudioStatus: "requires_permission",
  windowContext: { status: "unavailable", reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE },
  iivoAnalysis: { status: "idle" },
  stt: fallbackStt,
};

export function useGlassState(): GlassState {
  const [state, setState] = useState<GlassState>(fallbackState);

  useEffect(() => {
    let active = true;
    void window.glass.getState().then((snapshot) => {
      if (active) setState(snapshot);
    });
    const unsubscribe = window.glass.onState((next) => setState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function send(command: Parameters<typeof window.glass.send>[0]): void {
  window.glass.send(command);
}

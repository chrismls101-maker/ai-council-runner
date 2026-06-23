/**
 * Overlay hooks for Extract & Build Mode — transcript feed + debounced detection.
 */

import { useEffect, useRef } from "react";
import type { GlassState } from "../../shared/ipc.ts";
import {
  EXTRACT_DETECT_DEBOUNCE_MS,
  shouldRunExtractDetect,
} from "../../shared/extractModeLogic.ts";
import {
  getExtractModeState,
  setExtractModeState,
  subscribeExtractMode,
} from "./extractModeStore.ts";

/** Keep renderer store aligned with main-process extract capture flag. */
export function useExtractModeMainSync(): void {
  useEffect(() => {
    const sync = (glassState: GlassState): void => {
      const em = getExtractModeState();
      if (glassState.extractBuildModeActive && !em.active) {
        setExtractModeState({ active: true });
      } else if (!glassState.extractBuildModeActive && em.active) {
        setExtractModeState({ active: false });
      }
    };
    void window.glass.getState().then(sync);
    return window.glass.onState(sync);
  }, []);
}

/** Mirror main-process system-audio STT into the extract transcript store. */
export function useExtractModeTranscript(): void {
  useEffect(() => {
    return window.glass.onExtractModeTranscript((text) => {
      setExtractModeState({ transcript: text });
    });
  }, []);
}

async function runExtractDetect(transcript: string): Promise<void> {
  const trimmed = transcript.trim();
  if (!trimmed || !getExtractModeState().active) return;

  setExtractModeState({ detecting: true });
  try {
    const res = await window.glass.extractDetect({ transcript: trimmed });
    if (!getExtractModeState().active) return;
    if (res.error) return;
    if (res.label) {
      setExtractModeState({ detectedLabel: res.label });
    }
  } catch {
    /* best-effort */
  } finally {
    if (getExtractModeState().active) {
      setExtractModeState({ detecting: false });
    }
  }
}

/** Debounced stage-1 detection while Extract mode is active. */
export function useExtractBuildDetection(): void {
  const lastDetectAtRef = useRef(0);
  const lastDetectLenRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const scheduleFromState = (): void => {
      const em = getExtractModeState();
      if (!em.active) {
        lastDetectAtRef.current = 0;
        lastDetectLenRef.current = 0;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        return;
      }

      const transcript = em.transcript.trim();
      const nowMs = Date.now();
      const input = {
        active: em.active,
        transcriptLength: transcript.length,
        lastDetectAt: lastDetectAtRef.current,
        lastDetectTranscriptLength: lastDetectLenRef.current,
        nowMs,
      };

      const fireDetect = (): void => {
        if (inFlightRef.current || !transcript) return;
        inFlightRef.current = true;
        void runExtractDetect(transcript).finally(() => {
          inFlightRef.current = false;
          lastDetectAtRef.current = Date.now();
          lastDetectLenRef.current = transcript.length;
        });
      };

      if (shouldRunExtractDetect(input)) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        fireDetect();
        return;
      }

      if (transcript.length < input.transcriptLength) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest = getExtractModeState();
        if (!latest.active) return;
        const latestText = latest.transcript.trim();
        if (
          shouldRunExtractDetect({
            active: true,
            transcriptLength: latestText.length,
            lastDetectAt: lastDetectAtRef.current,
            lastDetectTranscriptLength: lastDetectLenRef.current,
            nowMs: Date.now(),
          })
        ) {
          fireDetect();
        }
      }, EXTRACT_DETECT_DEBOUNCE_MS);
    };

    scheduleFromState();
    return subscribeExtractMode(scheduleFromState);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
}

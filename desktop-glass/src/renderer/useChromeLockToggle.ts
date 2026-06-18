import { useCallback } from "react";
import { playChromeLockToggleSound } from "./chromeLockSound.ts";
import { send, useGlassState } from "./useGlassState.ts";

/** Toggle dock / command-bar layout lock with audible feedback. */
export function useChromeLockToggle(): () => void {
  const state = useGlassState();
  const chromeLocked = state.glassSettings.chromeLayoutLocked !== false;

  return useCallback(() => {
    const nextLocked = !chromeLocked;
    playChromeLockToggleSound(nextLocked);
    send({ type: "set-chrome-layout-locked", locked: nextLocked });
  }, [chromeLocked]);
}

/** Command bar window is always interactive — kept for call sites that run on unlock. */
export function ensureCommandBarClickable(): void {
  /* click-through is no longer toggled at runtime */
}

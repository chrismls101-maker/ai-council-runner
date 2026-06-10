import { useCallback } from "react";
import { playChromeLockToggleSound } from "./chromeLockSound.ts";
import { syncGlassClickThrough } from "./glassTextInteraction.ts";
import { send } from "./useGlassState.ts";

/** Toggle dock / command-bar layout lock with audible feedback. */
export function useChromeLockToggle(chromeLocked: boolean): () => void {
  return useCallback(() => {
    const nextLocked = !chromeLocked;
    playChromeLockToggleSound(nextLocked);
    send({ type: "set-chrome-layout-locked", locked: nextLocked });
  }, [chromeLocked]);
}

/** Command bar window is always interactive — kept for call sites that run on unlock. */
export function ensureCommandBarClickable(): void {
  syncGlassClickThrough(false);
}

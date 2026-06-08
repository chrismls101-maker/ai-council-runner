import { useCallback } from "react";
import { playChromeLockToggleSound } from "./chromeLockSound.ts";
import { send } from "./useGlassState.ts";

/** Toggle dock / command-bar layout lock with audible feedback. */
export function useChromeLockToggle(chromeLocked: boolean): () => void {
  return useCallback(() => {
    const nextLocked = !chromeLocked;
    playChromeLockToggleSound(nextLocked);
    send({ type: "set-chrome-layout-locked", locked: nextLocked });
  }, [chromeLocked]);
}

/** Command bar sits on a click-through window; ensure controls receive clicks. */
export function ensureCommandBarClickable(): void {
  syncGlassClickThrough(false);
}

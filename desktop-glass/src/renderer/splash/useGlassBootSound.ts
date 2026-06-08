import { useEffect } from "react";
import {
  onGlassBootFinishing,
  parseBootSoundEnabledFromLocation,
  startGlassBootSound,
  stopGlassBootSound,
} from "./glassBootSound.ts";

/** Play lift riser WAV on mount; fade when splash finishes. */
export function useGlassBootSound(): void {
  useEffect(() => {
    const enabled = parseBootSoundEnabledFromLocation(window.location.search);
    void startGlassBootSound(enabled);

    const onFinishing = (): void => {
      if (!enabled) return;
      onGlassBootFinishing();
    };

    const observer = new MutationObserver(() => {
      if (document.body.classList.contains("is-finishing")) {
        onFinishing();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (document.body.classList.contains("is-finishing")) {
      onFinishing();
    }

    return () => {
      observer.disconnect();
      stopGlassBootSound();
    };
  }, []);
}

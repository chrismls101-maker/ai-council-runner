/**
 * IIVO Glass boot audio — procedural official cue (WAV fallback only if synth unavailable).
 */

import { GLASS_BOOT_SOUND_ENABLED, GLASS_BOOT_SOUND_FADE_MS } from "../../shared/bootSound.ts";
import {
  playGlassBootCompleteSound as playGlassBootCompleteSynth,
  playGlassBootSoundSynth,
  type SynthBootHandle,
} from "./glassBootSoundSynth.ts";

import bootWavUrl from "../assets/iivo-glass-boot.wav?url";

export type GlassBootSoundHandle = {
  fadeOut: (ms?: number) => void;
  stop: () => void;
};

let activeHandle: GlassBootSoundHandle | null = null;

/** Prefer live synth — placeholder WAV is not production quality. */
const PREFER_BOOT_SYNTH = true;

function wireGlobalHook(handle: GlassBootSoundHandle | null): void {
  if (typeof window === "undefined") return;
  if (handle) {
    window.__iivoGlassBootSound = {
      fadeOut: (ms = GLASS_BOOT_SOUND_FADE_MS) => handle.fadeOut(ms),
      playComplete: () => {
        handle.fadeOut(GLASS_BOOT_SOUND_FADE_MS);
        void playGlassBootCompleteSynth();
      },
    };
  } else {
    delete window.__iivoGlassBootSound;
  }
}

function playFromFile(url: string): Promise<GlassBootSoundHandle | null> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.loop = false;
      audio.volume = 1;

      let fadeTimer: ReturnType<typeof setInterval> | null = null;
      let ended = false;

      const cleanup = (): void => {
        if (fadeTimer) clearInterval(fadeTimer);
        audio.pause();
        audio.src = "";
      };

      const fadeOut = (ms = GLASS_BOOT_SOUND_FADE_MS): void => {
        if (ended) return;
        const startVol = audio.volume;
        const steps = 14;
        const stepMs = Math.max(16, ms / steps);
        let step = 0;
        if (fadeTimer) clearInterval(fadeTimer);
        fadeTimer = setInterval(() => {
          step += 1;
          audio.volume = Math.max(0, startVol * (1 - step / steps));
          if (step >= steps) {
            if (fadeTimer) clearInterval(fadeTimer);
            ended = true;
            cleanup();
            if (activeHandle === handle) {
              activeHandle = null;
              wireGlobalHook(null);
            }
          }
        }, stepMs);
      };

      const stop = (): void => {
        ended = true;
        cleanup();
        if (activeHandle === handle) {
          activeHandle = null;
          wireGlobalHook(null);
        }
      };

      const handle: GlassBootSoundHandle = { fadeOut, stop };

      audio.addEventListener("ended", () => { if (!ended) stop(); }, { once: true });
      audio.addEventListener("error", () => resolve(null), { once: true });

      void audio.play().then(
        () => resolve(handle),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

export async function startGlassBootSound(enabled: boolean): Promise<void> {
  if (!GLASS_BOOT_SOUND_ENABLED || !enabled) return;
  stopGlassBootSound();

  if (PREFER_BOOT_SYNTH) {
    const synthHandle = await playGlassBootSoundSynth();
    if (synthHandle) {
      activeHandle = synthHandle;
      wireGlobalHook(synthHandle);
      return;
    }
  }

  const fileHandle = await playFromFile(bootWavUrl);
  if (fileHandle) {
    activeHandle = fileHandle;
    wireGlobalHook(fileHandle);
  }
}

export function fadeOutGlassBootSound(ms = GLASS_BOOT_SOUND_FADE_MS): void {
  activeHandle?.fadeOut(ms);
}

export function stopGlassBootSound(): void {
  activeHandle?.stop();
  activeHandle = null;
  wireGlobalHook(null);
}

export function playGlassBootCompleteSound(): void {
  void playGlassBootCompleteSynth();
}

export function onGlassBootFinishing(): void {
  if (!GLASS_BOOT_SOUND_ENABLED) return;
  fadeOutGlassBootSound(GLASS_BOOT_SOUND_FADE_MS);
  void playGlassBootCompleteSynth();
}

export function parseBootSoundEnabledFromLocation(search: string): boolean {
  const value = new URLSearchParams(search).get("bootSound");
  if (value === "0" || value === "false") return false;
  return true;
}

declare global {
  interface Window {
    __iivoGlassBootSound?: {
      fadeOut: (ms?: number) => void;
      playComplete: () => void;
    };
  }
}

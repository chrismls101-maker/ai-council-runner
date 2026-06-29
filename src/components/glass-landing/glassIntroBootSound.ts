const INTRO_MUSIC_SRC = "/audio/glass-intro-boot.mp3";

let audio: HTMLAudioElement | null = null;
let fadeInterval: number | null = null;
let fadeRaf: number | null = null;
let audioUnlocked = false;
let introMusicPermanentlyEnded = false;

export function isIntroMusicEnded(): boolean {
  return introMusicPermanentlyEnded;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearFade(): void {
  if (fadeInterval != null) {
    window.clearInterval(fadeInterval);
    fadeInterval = null;
  }
  if (fadeRaf != null) {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = null;
  }
}

function rampVolume(from: number, to: number, durationMs: number, onDone?: () => void): void {
  clearFade();
  if (!audio) return;
  const start = performance.now();
  const tick = (now: number): void => {
    if (!audio) return;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - (1 - t) ** 2;
    audio.volume = from + (to - from) * eased;
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick);
    } else {
      fadeRaf = null;
      onDone?.();
    }
  };
  fadeRaf = requestAnimationFrame(tick);
}

const INTRO_MUSIC_TARGET = 0.58;

function ensureAudioElement(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(INTRO_MUSIC_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

/** Call on user gesture — unlocks music bed for autoplay policies. */
export function unlockIntroAudio(): void {
  if (typeof window === "undefined" || prefersReducedMotion() || introMusicPermanentlyEnded) return;

  const el = ensureAudioElement();
  audioUnlocked = true;

  if (el.paused) {
    void el.play().then(() => {
      rampVolume(el.volume > 0.02 ? el.volume : 0, INTRO_MUSIC_TARGET, audioUnlocked ? 900 : 1800);
    }).catch(() => {
      /* retry on next gesture */
    });
  } else if (el.volume < INTRO_MUSIC_TARGET * 0.5) {
    rampVolume(el.volume, INTRO_MUSIC_TARGET, 800);
  }
}

export function isIntroAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Loop intro bed — survives mute/restore cycles until explicit stop. */
export function startIntroMusic(): void {
  if (typeof window === "undefined" || prefersReducedMotion() || introMusicPermanentlyEnded) return;
  ensureAudioElement();
  if (audioUnlocked) {
    unlockIntroAudio();
    return;
  }
  void audio!.play().then(() => {
    rampVolume(audio!.volume, INTRO_MUSIC_TARGET, 1800);
    audioUnlocked = true;
  }).catch(() => {
    /* blocked until unlockIntroAudio on gesture */
  });
}

/** Retry after user gesture if autoplay was blocked. */
export function ensureIntroMusicPlaying(): void {
  if (introMusicPermanentlyEnded) return;
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  unlockIntroAudio();
}

/** Fade to silence but keep the loop alive for restore. */
export function muteIntroMusic(durationMs = 700): void {
  if (!audio) return;
  rampVolume(audio.volume, 0.02, durationMs);
}

/** Smooth fade timed for final handoff only. */
export function fadeOutIntroMusic(durationMs = 2800): void {
  if (!audio) return;
  const current = audio.volume;
  if (current <= 0.001) {
    stopIntroMusic();
    return;
  }
  rampVolume(current, 0, durationMs, stopIntroMusic);
}

export function stopIntroMusic(): void {
  clearFade();
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  audioUnlocked = false;
}

/** Duck intro bed while Aletheia speaks. */
export function duckIntroMusic(to = 0.16, durationMs = 700): void {
  if (!audio) return;
  rampVolume(audio.volume, to, durationMs);
}

/** Silence intro bed completely — use during Aletheia voice lines. */
export function silenceIntroMusic(durationMs = 350): void {
  if (!audio) return;
  rampVolume(audio.volume, 0, durationMs);
}

/** Bring intro bed back after terminal / Aletheia. */
export function restoreIntroMusic(durationMs = 1400): void {
  if (introMusicPermanentlyEnded) return;
  if (!audio) {
    ensureAudioElement();
  }
  unlockIntroAudio();
  if (audio) {
    rampVolume(audio.volume, INTRO_MUSIC_TARGET, durationMs);
  }
}

/** Fade out and never resume — used before final Glass welcome voice lines. */
export function endIntroMusicPermanently(durationMs = 700): void {
  introMusicPermanentlyEnded = true;
  if (!audio) return;
  const current = audio.volume;
  if (current <= 0.001) {
    stopIntroMusic();
    return;
  }
  rampVolume(current, 0, durationMs, stopIntroMusic);
}

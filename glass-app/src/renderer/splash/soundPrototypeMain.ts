/**
 * Boot sound lab — DEV ONLY. Not an electron-vite renderer entry; open manually
 * for synth tuning. Production splash uses splash.html → main.tsx.
 */

import "./soundPrototype.css";
import {
  GLASS_BOOT_SOUND_DURATION_MS,
  GLASS_BOOT_SOUND_FADE_MS,
} from "../../shared/bootSound.ts";
import { playChromeLockSound, playChromeUnlockSound } from "../chromeLockSound.ts";
import bootWavUrl from "../assets/iivo-glass-boot.wav?url";
import { playGlassBootSoundSynth, type SynthBootHandle } from "./glassBootSoundSynth.ts";
import { onGlassBootFinishing } from "./glassBootSound.ts";

const DURATION_SEC = GLASS_BOOT_SOUND_DURATION_MS / 1000;

let bootHandle: SynthBootHandle | null = null;
let sequenceTimer: ReturnType<typeof setTimeout> | null = null;
let wavAudio: HTMLAudioElement | null = null;

function setStatus(text: string, playing = false): void {
  const el = document.getElementById("sound-lab-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("sound-lab__status--playing", playing);
}

function clearSequenceTimer(): void {
  if (sequenceTimer) {
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }
}

function stopBoot(): void {
  clearSequenceTimer();
  bootHandle?.stop();
  bootHandle = null;
  wavAudio?.pause();
  if (wavAudio) {
    wavAudio.currentTime = 0;
  }
}

async function playBootSynth(): Promise<void> {
  stopBoot();
  const handle = await playGlassBootSoundSynth();
  if (!handle) {
    setStatus("Could not start Web Audio — click the page once, then try again.");
    return;
  }
  bootHandle = handle;
  setStatus(`Playing ${DURATION_SEC}s boot bed (synth)…`, true);
  sequenceTimer = setTimeout(() => {
    if (bootHandle === handle) {
      setStatus("Boot bed ended. Play confirmation or full sequence.");
    }
  }, GLASS_BOOT_SOUND_DURATION_MS + 200);
}

function playBootWav(): void {
  stopBoot();
  wavAudio = new Audio(bootWavUrl);
  wavAudio.volume = 1;
  void wavAudio.play().then(
    () => setStatus(`Playing ${DURATION_SEC}s boot bed (WAV asset)…`, true),
    () => setStatus("WAV playback blocked or missing — run npm run glass:boot-sound"),
  );
  wavAudio.addEventListener("ended", () => setStatus("WAV ended."));
}

function playComplete(): void {
  onGlassBootFinishing();
  setStatus("Playing ready finish (synth)…", true);
  setTimeout(() => setStatus("Finish ended."), 1400);
}

function simulateSplashFinish(): void {
  onGlassBootFinishing();
  bootHandle = null;
  setStatus(`Splash finish: fade boot (${GLASS_BOOT_SOUND_FADE_MS}ms) + ready chime…`, true);
  setTimeout(() => setStatus("Splash finish simulated."), 1500);
}

async function playFullSequence(): Promise<void> {
  stopBoot();
  await playBootSynth();
  sequenceTimer = setTimeout(() => {
    simulateSplashFinish();
  }, GLASS_BOOT_SOUND_DURATION_MS);
  setStatus(`Full sequence: ${DURATION_SEC}s bed then confirmation…`, true);
}

function mount(): void {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div class="sound-lab">
      <header class="sound-lab__header">
        <h1 class="sound-lab__title">IIVO Glass — Boot Sound Lab</h1>
        <p class="sound-lab__sub">
          Edits to <code>glassBootSoundSynth.ts</code> play here and in the real splash.
          When it sounds right, you are done — no separate migration step.
        </p>
      </header>

      <section class="sound-lab__panel">
        <h2 class="sound-lab__panel-title">Playback</h2>
        <div class="sound-lab__actions">
          <button type="button" class="sound-lab__btn sound-lab__btn--primary" data-action="boot-synth">
            Play 10s boot (synth)
          </button>
          <button type="button" class="sound-lab__btn" data-action="boot-wav">Play 10s boot (WAV)</button>
          <button type="button" class="sound-lab__btn" data-action="complete">Confirmation chime</button>
          <button type="button" class="sound-lab__btn sound-lab__btn--primary" data-action="sequence">
            Full sequence (10s + chime)
          </button>
          <button type="button" class="sound-lab__btn" data-action="finish">Simulate splash finish</button>
          <button type="button" class="sound-lab__btn sound-lab__btn--danger" data-action="stop">Stop</button>
        </div>
        <p id="sound-lab-status" class="sound-lab__status">Ready — click a control (audio needs a user gesture).</p>
      </section>

      <section class="sound-lab__panel">
        <h2 class="sound-lab__panel-title">Digital boot (synth)</h2>
        <ul class="sound-lab__timeline">
          <li><span class="sound-lab__time">0s</span> Sub hit + digital whoosh</li>
          <li><span class="sound-lab__time">~2.3s</span> Emblem engage hit</li>
          <li><span class="sound-lab__time">~3–7s</span> Digital body</li>
          <li><span class="sound-lab__time">100%</span> Metallic online finish</li>
        </ul>
      </section>

      <section class="sound-lab__panel">
        <h2 class="sound-lab__panel-title">Chrome lock cues</h2>
        <div class="sound-lab__actions">
          <button type="button" class="sound-lab__btn" data-action="lock">Lock sound</button>
          <button type="button" class="sound-lab__btn" data-action="unlock">Unlock sound</button>
        </div>
      </section>

      <section class="sound-lab__panel">
        <h2 class="sound-lab__panel-title">Source files</h2>
        <ul class="sound-lab__files">
          <li><code>src/renderer/splash/glassBootSoundSynth.ts</code> — boot + confirmation</li>
          <li><code>src/renderer/chromeLockSound.ts</code> — lock / unlock</li>
          <li><code>scripts/generate-glass-boot-wav.mjs</code> — offline WAV</li>
        </ul>
        <p class="sound-lab__hint">
          Regenerate WAV after long changes: <code>npm run glass:boot-sound</code>.
          Run <code>npm run glass:sound-lab</code> (port 5174) or, while
          <code>npm run glass:dev</code> is running, open <code>/sound-prototype.html</code> on that Vite URL.
        </p>
      </section>
    </div>
  `;

  const actions: Record<string, () => void | Promise<void>> = {
    "boot-synth": () => void playBootSynth(),
    "boot-wav": playBootWav,
    complete: playComplete,
    sequence: () => void playFullSequence(),
    finish: simulateSplashFinish,
    stop: () => {
      stopBoot();
      setStatus("Stopped.");
    },
    lock: () => {
      playChromeLockSound();
      setStatus("Lock cue.");
    },
    unlock: () => {
      playChromeUnlockSound();
      setStatus("Unlock cue.");
    },
  };

  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = (btn as HTMLElement).dataset.action;
      if (key && actions[key]) actions[key]();
    });
  });
}

mount();

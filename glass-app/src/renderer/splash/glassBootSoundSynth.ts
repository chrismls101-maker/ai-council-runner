/**
 * IIVO Glass boot — punchy digital intelligence (not soft harmonic pads).
 * Boot: engine rise + system pulses. Finish: sharp “online” lock.
 */

import { GLASS_BOOT_SOUND_DURATION_MS } from "../../shared/bootSound.ts";

let audioCtx: AudioContext | null = null;

async function getAudioContext(): Promise<AudioContext> {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  return audioCtx;
}

function connectPan(input: AudioNode, dest: AudioNode, pan: number): void {
  const ctx = input.context as AudioContext;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  input.connect(p);
  p.connect(dest);
}

/** Saw/square through lowpass — digital body, not soft sine pad. */
function digitalVoice(
  ctx: AudioContext,
  dest: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType = "sawtooth",
  filterCutoff = 2200,
  attack = 0.012,
  pan = 0,
): void {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterCutoff * 0.4, start);
  filter.frequency.exponentialRampToValueAtTime(filterCutoff, start + duration * 0.7);
  filter.Q.value = 1.2;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0003), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter);
  filter.connect(gain);
  connectPan(gain, dest, pan);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function digitalSweep(
  ctx: AudioContext,
  dest: AudioNode,
  f0: number,
  f1: number,
  start: number,
  duration: number,
  peak: number,
  pan = 0,
): void {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), start + duration * 0.92);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(600, start);
  filter.frequency.exponentialRampToValueAtTime(4800, start + duration * 0.85);
  filter.Q.value = 0.9;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter);
  filter.connect(gain);
  connectPan(gain, dest, pan);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  start: number,
  duration: number,
  peak: number,
  fLow: number,
  fHigh: number,
  pan = 0,
): void {
  const n = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(fLow, start);
  filter.frequency.exponentialRampToValueAtTime(fHigh, start + duration * 0.8);
  filter.Q.value = 1.1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  connectPan(gain, dest, pan);
  src.start(start);
  src.stop(start + duration + 0.02);
}

function subHit(ctx: AudioContext, dest: AudioNode, start: number, peak: number): void {
  const osc = ctx.createOscillator();
  const hp = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(58, start);
  osc.frequency.exponentialRampToValueAtTime(48, start + 0.16);
  hp.type = "highpass";
  hp.frequency.value = 52;
  hp.Q.value = 0.7;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
  osc.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + 0.28);
}

function createMasterBus(ctx: AudioContext, t0: number, end: number): GainNode {
  const master = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 52;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 14000;
  lp.Q.value = 0.2;

  master.gain.setValueAtTime(0.55, t0);
  master.gain.setValueAtTime(0.72, t0 + 0.15);
  master.gain.setValueAtTime(0.68, end - 0.35);
  master.connect(hp);
  hp.connect(comp);
  comp.connect(lp);
  lp.connect(ctx.destination);
  return master;
}

function scheduleBoot(ctx: AudioContext, dest: AudioNode, t0: number, dur: number): void {
  const end = t0 + dur;

  // Immediate presence — not a whisper fade-in
  subHit(ctx, dest, t0, 0.11);
  noiseBurst(ctx, dest, t0, 0.35, 0.14, 400, 6000, 0);
  digitalSweep(ctx, dest, 120, 520, t0 + 0.05, 3.8, 0.1, -0.25);
  digitalSweep(ctx, dest, 180, 1400, t0 + 0.8, 7.5, 0.085, 0.2);

  // Grit layer under the rise
  noiseBurst(ctx, dest, t0 + 0.2, dur * 0.88, 0.055, 200, 3200, 0.15);

  // Emblem / core engage — sharp, not pretty bells
  subHit(ctx, dest, t0 + 2.25, 0.08);
  noiseBurst(ctx, dest, t0 + 2.28, 0.14, 0.12, 1200, 9000, 0);
  digitalVoice(ctx, dest, 280, t0 + 2.3, 0.35, 0.1, "square", 1800, 0.005, 0);

  // Mid section — steady digital body (no rhythmic pulse)
  digitalVoice(ctx, dest, 220, t0 + 3.5, 4.5, 0.065, "sawtooth", 900, 0.08, -0.3);
  digitalVoice(ctx, dest, 330, t0 + 4, 4, 0.055, "sawtooth", 1200, 0.1, 0.28);

  // Tension climb to handoff
  digitalSweep(ctx, dest, 400, 2200, t0 + 7.2, 2.4, 0.07, 0);
  noiseBurst(ctx, dest, t0 + 7.5, 2, 0.045, 800, 7000, 0);
  subHit(ctx, dest, t0 + 8.6, 0.12);

  // Avoid late sparse sine pings — keep energy until finish takes over
  digitalVoice(ctx, dest, 440, t0 + 8.8, Math.min(1.1, end - t0 - 8.8), 0.05, "sawtooth", 2400, 0.06, 0);
}

export type SynthBootHandle = {
  fadeOut: (ms?: number) => void;
  stop: () => void;
};

export async function playGlassBootSoundSynth(): Promise<SynthBootHandle | null> {
  try {
    const ctx = await getAudioContext();
    const t0 = ctx.currentTime;
    const dur = GLASS_BOOT_SOUND_DURATION_MS / 1000;
    const end = t0 + dur;
    const master = createMasterBus(ctx, t0, end);
    scheduleBoot(ctx, master, t0, dur);

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    const fadeOut = (ms = 480): void => {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        try {
          void ctx.close();
        } catch {
          // ignore
        }
        audioCtx = null;
      }, ms + 100);
    };

    const stop = (): void => {
      if (fadeTimer) clearTimeout(fadeTimer);
      try {
        void ctx.close();
      } catch {
        // ignore
      }
      audioCtx = null;
    };

    return { fadeOut, stop };
  } catch {
    return null;
  }
}

/** Sharp “systems online” finish — metallic, confident. */
export async function playGlassBootCompleteSound(): Promise<void> {
  try {
    const ctx = new AudioContext();
    await ctx.resume();
    const t = ctx.currentTime;

    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.1;
    master.gain.setValueAtTime(0.75, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    master.connect(comp);
    comp.connect(ctx.destination);

    subHit(ctx, master, t, 0.09);
    noiseBurst(ctx, master, t + 0.01, 0.08, 0.2, 2500, 11000, 0);
    digitalSweep(ctx, master, 320, 1400, t + 0.04, 0.22, 0.14, 0);
    digitalVoice(ctx, master, 880, t + 0.12, 0.55, 0.16, "square", 3200, 0.008, 0);
    digitalVoice(ctx, master, 1174.66, t + 0.18, 0.45, 0.1, "sawtooth", 5000, 0.01, 0.15);
    noiseBurst(ctx, master, t + 0.2, 0.35, 0.08, 4000, 12000, 0.2);

    setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    }, 1100);
  } catch {
    // ignore
  }
}

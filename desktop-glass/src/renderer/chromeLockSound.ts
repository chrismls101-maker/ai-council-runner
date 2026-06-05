/** Lock / unlock cues — glass latch + release (Web Audio). */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType = "sine",
  attack = 0.012,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function toneSweep(
  ctx: AudioContext,
  dest: AudioNode,
  f0: number,
  f1: number,
  start: number,
  duration: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), start + duration * 0.92);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function clickTransient(ctx: AudioContext, dest: AudioNode, start: number, peak: number): void {
  const duration = 0.045;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const env = 1 - i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2800;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(start);
  src.stop(start + duration + 0.02);
}

function glassDyad(
  ctx: AudioContext,
  dest: AudioNode,
  f1: number,
  f2: number,
  start: number,
  duration: number,
  peak: number,
): void {
  tone(ctx, dest, f1, start, duration, peak * 0.55, "sine", 0.008);
  tone(ctx, dest, f2, start + 0.018, duration * 0.92, peak * 0.45, "sine", 0.01);
}

/** Settled latch — soft click + descending glass fifth. */
export function playChromeLockSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.36, t + 0.006);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    master.connect(ctx.destination);

    clickTransient(ctx, master, t, 0.14);
    tone(ctx, master, 117.5, t + 0.03, 0.1, 0.09, "sine", 0.004);
    glassDyad(ctx, master, 440, 329.63, t + 0.04, 0.2, 0.16);
    tone(ctx, master, 220, t + 0.1, 0.14, 0.07, "triangle", 0.015);
    tone(ctx, master, 880, t + 0.06, 0.12, 0.04, "sine", 0.02);
  } catch {
    // Audio may be unavailable in headless / restricted environments.
  }
}

/** Airy release — upward sweep + bright ascending glass notes. */
export function playChromeUnlockSound(): void {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.38, t + 0.008);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    master.connect(ctx.destination);

    clickTransient(ctx, master, t, 0.1);
    toneSweep(ctx, master, 260, 620, t + 0.01, 0.14, 0.09);

    const unlockNotes = [392, 523.25, 659.25, 783.99, 987.77];
    unlockNotes.forEach((freq, i) => {
      tone(ctx, master, freq, t + 0.06 + i * 0.052, 0.26, 0.11 - i * 0.012, "sine", 0.01);
    });
    tone(ctx, master, 1318.51, t + 0.34, 0.22, 0.05, "sine", 0.015);
  } catch {
    // ignore
  }
}

export function playChromeLockToggleSound(locked: boolean): void {
  if (locked) {
    playChromeLockSound();
  } else {
    playChromeUnlockSound();
  }
}

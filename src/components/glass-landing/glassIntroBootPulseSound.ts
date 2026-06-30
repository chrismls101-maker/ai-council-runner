/** Overlay activation pulse — same click every refresh, locked to boot timeline. */

let pulseCtx: AudioContext | null = null;

async function getPulseCtx(): Promise<AudioContext | null> {
  try {
    if (!pulseCtx) {
      // @ts-expect-error webkit prefix
      pulseCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (pulseCtx.state === "suspended") {
      await pulseCtx.resume();
    }
    return pulseCtx.state === "running" ? pulseCtx : null;
  } catch {
    return null;
  }
}

/** Sharp teal lock — visual frame pulse + Aletheia “Glass is live”. */
export async function playOverlayActivationPulse(): Promise<void> {
  const ctx = await getPulseCtx();
  if (!ctx) return;

  const t = ctx.currentTime;

  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4.5;
  comp.attack.value = 0.0015;
  comp.release.value = 0.09;
  master.gain.setValueAtTime(0.82, t);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
  master.connect(comp);
  comp.connect(ctx.destination);

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(62, t);
  sub.frequency.exponentialRampToValueAtTime(48, t + 0.14);
  subGain.gain.setValueAtTime(0.0001, t);
  subGain.gain.exponentialRampToValueAtTime(0.14, t + 0.008);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(t);
  sub.stop(t + 0.22);

  const noiseLen = Math.floor(ctx.sampleRate * 0.09);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i += 1) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.setValueAtTime(2800, t);
  noiseFilter.Q.value = 1.4;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t);
  noise.stop(t + 0.1);

  const sweep = ctx.createOscillator();
  const sweepFilter = ctx.createBiquadFilter();
  const sweepGain = ctx.createGain();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(380, t + 0.01);
  sweep.frequency.exponentialRampToValueAtTime(1680, t + 0.16);
  sweepFilter.type = "lowpass";
  sweepFilter.frequency.setValueAtTime(900, t);
  sweepFilter.frequency.exponentialRampToValueAtTime(5200, t + 0.14);
  sweepGain.gain.setValueAtTime(0.0001, t + 0.01);
  sweepGain.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
  sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  sweep.connect(sweepFilter);
  sweepFilter.connect(sweepGain);
  sweepGain.connect(master);
  sweep.start(t + 0.01);
  sweep.stop(t + 0.24);

  const chime = ctx.createOscillator();
  const chimeGain = ctx.createGain();
  chime.type = "square";
  chime.frequency.setValueAtTime(880, t + 0.055);
  chimeGain.gain.setValueAtTime(0.0001, t + 0.055);
  chimeGain.gain.exponentialRampToValueAtTime(0.09, t + 0.065);
  chimeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  chime.connect(chimeGain);
  chimeGain.connect(master);
  chime.start(t + 0.055);
  chime.stop(t + 0.42);
}

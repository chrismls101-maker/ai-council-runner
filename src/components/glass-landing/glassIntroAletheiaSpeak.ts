/** Aletheia intro line — ElevenLabs Matilda via /api/tts + Glass voice FX (chorus + reverb). */

const PLAYBACK_RATE = 0.9;
/** Matches SWARM_CONFIG.voiceCharacter — chorus shimmer + vast reverb echo. */
const VOICE_CHARACTER = 0.55;

export const ALETHEIA_TERMINAL_DEMO =
  "Find what's using port three thousand, kill it, restart npm dev, and open localhost.";

export const ALETHEIA_GLASS_LINE_1 = "This is the next layer of AI native computing.";
export const ALETHEIA_GLASS_LINE_2 = "Welcome to Glass.";

/** @deprecated Use ALETHEIA_GLASS_LINE_1 + ALETHEIA_GLASS_LINE_2 */
export const ALETHEIA_GLASS_WELCOME = ALETHEIA_GLASS_LINE_1;

let busy = false;
let audioCtx: AudioContext | null = null;
let fxInput: GainNode | null = null;
let stopRef: (() => void) | null = null;

function ensureCtx(): AudioContext {
  if (!audioCtx) {
    // @ts-expect-error webkit prefix for older Safari
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function makeImpulseResponse(ctx: AudioContext, seconds = 2.2, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
  }
  return buf;
}

function ensureVoiceFx(ctx: AudioContext): GainNode {
  if (fxInput) return fxInput;

  const c = Math.max(0, Math.min(1, VOICE_CHARACTER));
  const input = ctx.createGain();
  const out = ctx.createGain();

  const dry = ctx.createGain();
  dry.gain.value = 1 - 0.25 * c;
  input.connect(dry);
  dry.connect(out);

  const mkChorus = (time: number, rate: number, depth: number): void => {
    const delay = ctx.createDelay();
    delay.delayTime.value = time;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();
    const wet = ctx.createGain();
    wet.gain.value = 0.5 * c;
    input.connect(delay);
    delay.connect(wet);
    wet.connect(out);
  };
  mkChorus(0.018, 0.13, 0.004);
  mkChorus(0.027, 0.19, 0.005);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx);
  const reverb = ctx.createGain();
  reverb.gain.value = 0.42 * c;
  out.connect(convolver);
  convolver.connect(reverb);

  const echoDelay = ctx.createDelay();
  echoDelay.delayTime.value = 0.14;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0.22 * c;
  out.connect(echoDelay);
  echoDelay.connect(echoWet);

  const master = ctx.createGain();
  out.connect(master);
  reverb.connect(master);
  echoWet.connect(master);
  master.connect(ctx.destination);

  fxInput = input;
  return input;
}

async function playBuffer(buffer: AudioBuffer): Promise<void> {
  const ctx = ensureCtx();
  if (ctx.state === "suspended") await ctx.resume();

  const input = ensureVoiceFx(ctx);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = PLAYBACK_RATE;
  source.connect(input);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      stopRef = null;
      resolve();
    };
    stopRef = () => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      finish();
    };
    source.onended = finish;
    try {
      source.start(0);
    } catch (err) {
      stopRef = null;
      reject(err);
    }
  });
}

export function stopAletheiaSpeak(): void {
  stopRef?.();
  stopRef = null;
  busy = false;
}

/** Resume Web Audio after autoplay policies — call on user gesture and before TTS. */
export async function unlockAletheiaAudio(): Promise<void> {
  const ctx = ensureCtx();
  if (ctx.state === "suspended") await ctx.resume();
}

export async function speakAletheiaLine(text: string): Promise<void> {
  if (busy || !text.trim()) return;
  busy = true;
  try {
    await unlockAletheiaAudio();
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const ctx = ensureCtx();
      const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      await playBuffer(buffer);
      return;
    }
    console.warn("[Glass intro] Aletheia TTS unavailable, using browser voice", await response.text());
    await speakWithBrowserVoice(text);
  } catch (error) {
    console.warn("[Glass intro] Aletheia TTS failed, using browser voice", error);
    await speakWithBrowserVoice(text);
  } finally {
    busy = false;
  }
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /samantha|matilda|karen|moira|serena/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en") && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

function speakWithBrowserVoice(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.02;
    const voice = pickBrowserVoice();
    if (voice) utterance.voice = voice;

    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      stopRef = null;
      resolve();
    };

    stopRef = () => {
      window.speechSynthesis.cancel();
      finish();
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakAletheiaWelcome(text = ALETHEIA_GLASS_WELCOME): Promise<void> {
  return speakAletheiaLine(text);
}

/** Speak intro closing lines in order — one TTS request per line. */
export async function speakAletheiaLines(lines: string[]): Promise<void> {
  for (const line of lines) {
    if (!line.trim()) continue;
    await speakAletheiaLine(line);
  }
}

export function isAletheiaSpeaking(): boolean {
  return busy;
}

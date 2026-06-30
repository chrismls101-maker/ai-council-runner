/** Aletheia intro line — ElevenLabs Matilda via /api/tts + Glass voice FX (chorus + reverb). */

import {
  ALETHEIA_CINEMA_AUDIO_BASE,
  ALETHEIA_CINEMA_BAKED_CLIP_MAP,
} from "./aletheiaCinemaAudioManifest";

/** Slightly above 1:1 — slow playback deepens Matilda; keep her register light. */
const PLAYBACK_RATE = 0.97;
/** Chorus shimmer + reverb — landing cinema presenter signature. */
const VOICE_CHARACTER = 0.72;

export const ALETHEIA_TERMINAL_DEMO =
  "Find what's using port three thousand, kill it, restart npm dev, and open localhost.";

/** @deprecated Use ALETHEIA_CINEMA_FINALE_LINES */
export const ALETHEIA_CINEMA_FINALE_SPEAK = "Intelligence.";

/** ElevenLabs voice_settings presets — landing cinema keeps Glass FX on the client. */
export const ALETHEIA_VOICE_PROFILES = {
  /** Default cinematic read — warm, present, natural cadence. */
  cinema: { stability: 0.56, similarity_boost: 0.88, style: 0.12, use_speaker_boost: true },
  /** Short beat words — quick, light labels (Agents, Memory., Voice.). */
  cinemaSoft: { stability: 0.62, similarity_boost: 0.9, style: 0.06, use_speaker_boost: true },
  /** Emotional beats — measured, intentional. */
  cinemaFelt: { stability: 0.5, similarity_boost: 0.9, style: 0.14, use_speaker_boost: true },
  /** Payoff lines — edge, weight, deliberate emphasis. */
  cinemaEmphasis: { stability: 0.44, similarity_boost: 0.92, style: 0.2, use_speaker_boost: true },
  /** Finale title — grounded warmth with authority. */
  cinemaFinale: { stability: 0.46, similarity_boost: 0.91, style: 0.18, use_speaker_boost: true },
  /** Boot activation pulse. */
  boot: { stability: 0.44, similarity_boost: 0.9, style: 0.22, use_speaker_boost: true },
} as const;

export type AletheiaVoiceProfile = keyof typeof ALETHEIA_VOICE_PROFILES;

export type AletheiaSpeakOptions = {
  text: string;
  profile?: AletheiaVoiceProfile;
  playbackRate?: number;
  /** 0–1: slower delivery + presence lift on payoffs. */
  emphasis?: number;
  /** Baked clip id — loads /audio/aletheia-cinema/{id}.mp3 when present. */
  audioId?: string;
};

/** Finale voice — spoken over INTELLIGENT GLASS on screen. */
export const ALETHEIA_CINEMA_FINALE_LINES = [
  { text: "Intelligent glass.", profile: "cinemaFinale" },
] as const satisfies readonly AletheiaSpeakOptions[];

const PROFILE_PLAYBACK: Partial<Record<AletheiaVoiceProfile, number>> = {
  cinemaSoft: 0.978,
  cinemaFelt: 0.968,
  cinemaEmphasis: 0.952,
  cinemaFinale: 0.948,
  cinema: 0.97,
  boot: 0.958,
};

function resolvePlaybackRate(
  profile: AletheiaVoiceProfile,
  playbackRate?: number,
  emphasis = 0,
): number {
  const base = playbackRate ?? PROFILE_PLAYBACK[profile] ?? PLAYBACK_RATE;
  return emphasis > 0 ? base - emphasis * 0.016 : base;
}

function resolveEmphasisGain(emphasis = 0): number {
  return 1 + Math.max(0, Math.min(1, emphasis)) * 0.26;
}

/** Scene-indexed lines for hero cinema (after boot when startSceneIndex > 0). */
export const ALETHEIA_CINEMA_SCENE_LINES: Partial<Record<number, string>> = {};

/** Spoken in the gap after "One layer." — before Agents appear. */
export const ALETHEIA_CINEMA_BRIDGE_AFTER_LAYER = "Above it all.";

export const ALETHEIA_BOOT_ACTIVATE = "Glass... is live.";
export const ALETHEIA_GLASS_LINE_1 = "This is the next layer... of AI-native computing.";
export const ALETHEIA_GLASS_LINE_2 = "Welcome... to Glass.";

/** @deprecated Use ALETHEIA_GLASS_LINE_1 + ALETHEIA_GLASS_LINE_2 */
export const ALETHEIA_GLASS_WELCOME = ALETHEIA_GLASS_LINE_1;

const TTS_FETCH_TIMEOUT_MS = 12000;
const TTS_MAX_ATTEMPTS = 3;
const PRESENTATION_BREATH_GAP_MS = 72;

let busy = false;
let audioCtx: AudioContext | null = null;
let fxInput: GainNode | null = null;
let stopRef: (() => void) | null = null;
let speakChain: Promise<void> = Promise.resolve();
let audioUnlocked = false;
let lastSpokenText = "";

let speakGeneration = 0;

type TtsContext = {
  previous_text?: string;
  next_text?: string;
};

const prefetchCache = new Map<string, Promise<AudioBuffer>>();

function ttsCacheKey(
  text: string,
  profile: AletheiaVoiceProfile,
  context: TtsContext = {},
): string {
  return `${profile}::${text}::p:${context.previous_text ?? ""}::n:${context.next_text ?? ""}`;
}

function isSpeakCancelled(generation: number): boolean {
  return generation !== speakGeneration;
}

async function fetchTtsAudio(
  text: string,
  profile: AletheiaVoiceProfile,
  context: TtsContext = {},
): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          voice_settings: ALETHEIA_VOICE_PROFILES[profile],
          language_code: "en",
          ...(context.previous_text ? { previous_text: context.previous_text } : {}),
          ...(context.next_text ? { next_text: context.next_text } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = await response.text();
        await delay(280 * (attempt + 1));
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("audio") && !contentType.includes("mpeg")) {
        lastError = `unexpected content-type: ${contentType}`;
        await delay(280 * (attempt + 1));
        continue;
      }
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      await delay(280 * (attempt + 1));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resumeAletheiaAudio(): Promise<boolean> {
  const ctx = ensureCtx();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === "running";
}

function normalizeSpeakInput(input: string | AletheiaSpeakOptions): Required<AletheiaSpeakOptions> {
  if (typeof input === "string") {
    return { text: input, profile: "cinema", playbackRate: PLAYBACK_RATE, emphasis: 0, audioId: "" };
  }
  const profile = input.profile ?? "cinema";
  const emphasis = input.emphasis ?? 0;
  return {
    text: input.text,
    profile,
    emphasis,
    playbackRate: input.playbackRate ?? resolvePlaybackRate(profile, undefined, emphasis),
    audioId: input.audioId ?? "",
  };
}

function contextForLines(
  lines: readonly Required<AletheiaSpeakOptions>[],
  index: number,
  carryFromLast = true,
): TtsContext {
  return {
    previous_text:
      index > 0
        ? lines[index - 1]?.text
        : carryFromLast && lastSpokenText
          ? lastSpokenText
          : undefined,
    next_text: index < lines.length - 1 ? lines[index + 1]?.text : undefined,
  };
}

async function decodeTtsAudio(
  text: string,
  profile: AletheiaVoiceProfile,
  context: TtsContext = {},
): Promise<AudioBuffer> {
  const ctx = ensureCtx();
  const arrayBuffer = await fetchTtsAudio(text, profile, context);
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeError) {
    console.warn("[Glass intro] Aletheia decode failed, retrying TTS", decodeError);
    const retryBuffer = await fetchTtsAudio(text, profile, context);
    return ctx.decodeAudioData(retryBuffer.slice(0));
  }
}

function lineCacheKey(line: Required<AletheiaSpeakOptions>, context: TtsContext = {}): string {
  if (line.audioId) return `baked::${line.audioId}`;
  return ttsCacheKey(line.text, line.profile, context);
}

async function loadBakedBuffer(audioId: string): Promise<AudioBuffer | null> {
  if (!ALETHEIA_CINEMA_BAKED_CLIP_MAP[audioId]) return null;
  const url = `${ALETHEIA_CINEMA_AUDIO_BASE}/${audioId}.mp3`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const ctx = ensureCtx();
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    return null;
  }
}

async function loadAletheiaBufferWithRetry(
  line: Required<AletheiaSpeakOptions>,
  context: TtsContext,
): Promise<AudioBuffer> {
  const key = lineCacheKey(line, context);
  const cached = prefetchCache.get(key);
  if (cached) {
    prefetchCache.delete(key);
    try {
      return await cached;
    } catch (error) {
      console.warn("[Glass intro] Aletheia prefetch failed, refetching", error);
    }
  }

  if (line.audioId) {
    const baked = await loadBakedBuffer(line.audioId);
    if (baked) return baked;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await decodeTtsAudio(line.text, line.profile, {});
    } catch (error) {
      lastError = error;
      await delay(320 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadAletheiaBuffer(
  line: Required<AletheiaSpeakOptions>,
  context: TtsContext,
): Promise<AudioBuffer> {
  return loadAletheiaBufferWithRetry(line, context);
}

function warmAletheiaBuffer(line: Required<AletheiaSpeakOptions>, context: TtsContext): void {
  const key = lineCacheKey(line, context);
  if (prefetchCache.has(key)) return;
  prefetchCache.set(
    key,
    loadAletheiaBufferWithRetry(line, context).catch((error) => {
      prefetchCache.delete(key);
      throw error;
    }),
  );
}

/** Warm the first upcoming line — one request at a time, no API flood. */
export function prefetchAletheiaLines(
  lines: Array<string | AletheiaSpeakOptions>,
  opts: { carryFromLast?: boolean } = {},
): void {
  const normalized = lines.map(normalizeSpeakInput).filter((line) => line.text.trim());
  if (normalized.length === 0) return;
  warmAletheiaBuffer(
    normalized[0],
    contextForLines(normalized, 0, opts.carryFromLast !== false),
  );
}

export type AletheiaSequenceItem = AletheiaSpeakOptions & {
  /** Fires immediately before this line's audio starts. */
  onStart?: () => void;
};

async function speakAletheiaLineInner(
  input: string | AletheiaSpeakOptions,
  context: TtsContext = {},
  generation = speakGeneration,
): Promise<void> {
  const normalized = normalizeSpeakInput(input);
  const { text, playbackRate, emphasis } = normalized;
  if (!text.trim() || isSpeakCancelled(generation)) return;
  busy = true;
  try {
    if (!audioUnlocked) {
      await resumeAletheiaAudio();
    } else {
      await unlockAletheiaAudio();
    }
    if (isSpeakCancelled(generation)) return;

    let buffer: AudioBuffer | null = null;
    for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt += 1) {
      if (isSpeakCancelled(generation)) return;
      try {
        buffer = await loadAletheiaBufferWithRetry(normalized, context);
        break;
      } catch (error) {
        console.warn("[Glass intro] Aletheia line retry", text, attempt + 1, error);
        await delay(320 * (attempt + 1));
      }
    }
    if (!buffer || isSpeakCancelled(generation)) return;

    if (!(await resumeAletheiaAudio())) {
      console.warn("[Glass intro] Aletheia audio locked — click the page to enable voice");
      return;
    }

    await playBuffer(buffer, playbackRate, generation, emphasis);
    if (!isSpeakCancelled(generation)) {
      lastSpokenText = text;
    }
  } catch (error) {
    console.warn("[Glass intro] Aletheia TTS failed", error);
  } finally {
    busy = false;
  }
}

async function speakAletheiaSequenceInner(
  items: readonly AletheiaSequenceItem[],
  breathGapMs = PRESENTATION_BREATH_GAP_MS,
  generation = speakGeneration,
): Promise<void> {
  const steps = items
    .map((item) => ({
      line: normalizeSpeakInput(item),
      onStart: item.onStart,
    }))
    .filter((step) => step.line.text.trim());
  if (steps.length === 0 || isSpeakCancelled(generation)) return;

  busy = true;
  try {
    if (!audioUnlocked) {
      await resumeAletheiaAudio();
    } else {
      await unlockAletheiaAudio();
    }
    if (isSpeakCancelled(generation)) return;
    if (!(await resumeAletheiaAudio())) {
      console.warn("[Glass intro] Aletheia audio locked — click the page to enable voice");
      return;
    }

    const normalized = steps.map((step) => step.line);

    for (let index = 0; index < steps.length; index += 1) {
      if (isSpeakCancelled(generation)) return;

      const { line, onStart } = steps[index];
      const context = contextForLines(normalized, index);

      if (index + 1 < steps.length) {
        const nextContext = contextForLines(normalized, index + 1);
        warmAletheiaBuffer(steps[index + 1].line, nextContext);
      }

      let buffer: AudioBuffer | null = null;
      for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt += 1) {
        if (isSpeakCancelled(generation)) return;
        try {
          buffer = await loadAletheiaBuffer(line, context);
          break;
        } catch (error) {
          console.warn("[Glass intro] Aletheia line retry", line.text, attempt + 1, error);
          await delay(320 * (attempt + 1));
        }
      }
      if (!buffer) {
        console.warn("[Glass intro] Aletheia line failed after retries", line.text);
        continue;
      }

      if (isSpeakCancelled(generation)) return;

      onStart?.();
      await playBuffer(buffer, line.playbackRate, generation, line.emphasis);
      if (!isSpeakCancelled(generation)) {
        lastSpokenText = line.text;
      }

      if (index < steps.length - 1 && breathGapMs > 0 && !isSpeakCancelled(generation)) {
        await delay(breathGapMs);
      }
    }
  } catch (error) {
    console.warn("[Glass intro] Aletheia TTS sequence failed", error);
  } finally {
    busy = false;
  }
}

function ensureCtx(): AudioContext {
  if (!audioCtx) {
    // @ts-expect-error webkit prefix for older Safari
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function makeImpulseResponse(ctx: AudioContext, seconds = 2.65, decay = 3.1): AudioBuffer {
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
  const shaped = ctx.createBiquadFilter();
  shaped.type = "peaking";
  shaped.frequency.value = 2800;
  shaped.Q.value = 0.85;
  shaped.gain.value = 3.2 * c;
  input.connect(shaped);

  const out = ctx.createGain();
  shaped.connect(out);

  const dry = ctx.createGain();
  dry.gain.value = 1 - 0.22 * c;
  shaped.connect(dry);
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
    wet.gain.value = 0.48 * c;
    shaped.connect(delay);
    delay.connect(wet);
    wet.connect(out);
  };
  mkChorus(0.018, 0.13, 0.004);
  mkChorus(0.027, 0.19, 0.005);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulseResponse(ctx, 2.45, 3.4);
  const reverb = ctx.createGain();
  reverb.gain.value = 0.56 * c;
  out.connect(convolver);
  convolver.connect(reverb);

  const echoDelay = ctx.createDelay();
  echoDelay.delayTime.value = 0.14;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0.28 * c;
  out.connect(echoDelay);
  echoDelay.connect(echoWet);

  const master = ctx.createGain();
  out.connect(master);
  reverb.connect(master);
  echoWet.connect(master);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -17;
  comp.knee.value = 6;
  comp.ratio.value = 3.4;
  comp.attack.value = 0.005;
  comp.release.value = 0.13;
  master.connect(comp);
  comp.connect(ctx.destination);

  fxInput = input;
  return input;
}

async function playBuffer(
  buffer: AudioBuffer,
  playbackRate = PLAYBACK_RATE,
  generation = speakGeneration,
  emphasis = 0,
): Promise<void> {
  if (isSpeakCancelled(generation)) return;
  if (!(await resumeAletheiaAudio())) {
    throw new Error("AudioContext not running");
  }
  const ctx = ensureCtx();
  const input = ensureVoiceFx(ctx);
  const source = ctx.createBufferSource();
  const emphasisGain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  emphasisGain.gain.value = resolveEmphasisGain(emphasis);
  source.connect(emphasisGain);
  emphasisGain.connect(input);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (stopRef) stopRef = null;
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
  speakGeneration += 1;
  speakChain = Promise.resolve();
  prefetchCache.clear();
  lastSpokenText = "";
}

export function isAletheiaAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Resume Web Audio after autoplay policies — call on user gesture and before TTS. */
export async function unlockAletheiaAudio(): Promise<void> {
  if (await resumeAletheiaAudio()) {
    audioUnlocked = true;
  }
}

export async function speakAletheiaLine(
  text: string | AletheiaSpeakOptions,
  context: TtsContext = {},
): Promise<void> {
  const normalized = normalizeSpeakInput(text);
  if (!normalized.text.trim()) return;
  const generation = speakGeneration;
  const run = speakChain.then(() => speakAletheiaLineInner(normalized, context, generation));
  speakChain = run.catch(() => {});
  return run;
}

export async function speakAletheiaSequence(
  items: readonly AletheiaSequenceItem[],
  opts: { breathGapMs?: number } = {},
): Promise<void> {
  if (items.length === 0) return;
  const generation = speakGeneration;
  if (items.length === 1) {
    const item = items[0];
    const normalized = normalizeSpeakInput(item);
    const run = speakChain.then(async () => {
      if (isSpeakCancelled(generation)) return;
      item.onStart?.();
      await speakAletheiaLineInner(normalized, {}, generation);
    });
    speakChain = run.catch(() => {});
    return run;
  }
  const run = speakChain.then(() => {
    if (isSpeakCancelled(generation)) return;
    return speakAletheiaSequenceInner(
      items,
      opts.breathGapMs ?? PRESENTATION_BREATH_GAP_MS,
      generation,
    );
  });
  speakChain = run.catch(() => {});
  return run;
}

export async function speakAletheiaLines(
  lines: Array<string | AletheiaSpeakOptions>,
): Promise<void> {
  return speakAletheiaSequence(lines, { breathGapMs: PRESENTATION_BREATH_GAP_MS });
}

export function isAletheiaSpeaking(): boolean {
  return busy;
}

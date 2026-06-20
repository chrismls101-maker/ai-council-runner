// VoiceController
// ---------------
// Turns the AI's voice into (1) a 0..1 LEVEL the swarm reacts to, and (2) the
// "presence" sound character. There is NO literal lip-sync — the whole field
// reacts — which keeps it premium and out of the uncanny valley.
//
// Voice character ("otherworldly but not fake-AI"): the raw neural-TTS voice is
// run through a light Web Audio chain — a slow modulated chorus (a faint
// shimmer / second-self) + a generated reverb (a sense of vast dark space).
// ~90% natural, ~10% beyond-human. Amount = SWARM_CONFIG.voiceCharacter (0..1).
//
// Plug a real voice in:
//   voice.connectAudioElement(<audio> playing TTS)  -> processed + reacted to
//   voice.connectMic()                              -> reacts to the mic
// Until then a syllable-like placeholder drives the visual while speaking.

import { SWARM_CONFIG } from './swarmConfig';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class VoiceController {
  level: number;
  private ctx: AudioContext | null;
  private analyser: AnalyserNode | null;
  private data: Uint8Array<ArrayBuffer> | null;
  private mode: 'placeholder' | 'audio';
  private fxInput: GainNode | null;
  private directToSpeakers: boolean;

  constructor() {
    this.level = 0;
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.mode = 'placeholder';
    this.fxInput = null;
    this.directToSpeakers = false;
  }

  private _ensureCtx(): void {
    if (!this.ctx) {
      // @ts-ignore — webkitAudioContext for older Safari
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!this.analyser) {
      this.analyser = this.ctx!.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.data = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;
    }
  }

  // generated impulse response -> a clean reverb (the "vast space")
  private _makeIR(seconds = 1.6, decay = 3.0): AudioBuffer {
    const rate = this.ctx!.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx!.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // builds the "presence" character chain and returns the node TTS connects into
  private _buildVoiceFX(): GainNode {
    const c = Math.max(0, Math.min(1, SWARM_CONFIG.voiceCharacter ?? 0.35)); // 0 natural .. 1 otherworldly
    const inNode = this.ctx!.createGain();
    const out = this.ctx!.createGain();

    // dry path
    const dry = this.ctx!.createGain();
    dry.gain.value = 1.0 - 0.25 * c;
    inNode.connect(dry);
    dry.connect(out);

    // chorus / shimmer — two slightly detuned, LFO-modulated delays (a faint
    // "second self", the layered-intelligence feel) — no pitch-shift, no robot
    const mk = (time: number, rate: number, depth: number): void => {
      const delay = this.ctx!.createDelay();
      delay.delayTime.value = time;
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = this.ctx!.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();
      const g = this.ctx!.createGain();
      g.gain.value = 0.5 * c;
      inNode.connect(delay);
      delay.connect(g);
      g.connect(out);
    };
    mk(0.018, 0.13, 0.004);
    mk(0.027, 0.19, 0.005);

    // reverb — a sense of vast dark space
    const conv = this.ctx!.createConvolver();
    conv.buffer = this._makeIR();
    const wet = this.ctx!.createGain();
    wet.gain.value = 0.32 * c;
    out.connect(conv);
    conv.connect(wet);

    // master -> analyser (visual reacts to the PROCESSED voice) -> speakers
    const master = this.ctx!.createGain();
    out.connect(master);
    wet.connect(master);
    master.connect(this.analyser!);
    master.connect(this.ctx!.destination);
    return inNode;
  }

  /**
   * Returns the AudioContext and the processed input node (chorus + reverb chain).
   * Use this to route TTS BufferSource nodes through the same FX path as live audio.
   * The returned ctx is the VoiceController's own context — decode audio buffers in it.
   */
  getFxContext(): { ctx: AudioContext; input: AudioNode } {
    this._ensureCtx();
    if (!this.fxInput) {
      this.fxInput = this._buildVoiceFX();
    }
    return { ctx: this.ctx!, input: this.fxInput };
  }

  async connectMic(): Promise<void> {
    try {
      this._ensureCtx();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx!.createMediaStreamSource(stream).connect(this.analyser!); // raw -> analyser (no playback)
      if (this.ctx!.state === 'suspended') await this.ctx!.resume();
      this.mode = 'audio';
    } catch (e) {
      console.warn('[IIVO] mic unavailable, using placeholder voice', e);
    }
  }

  async resumeContext(): Promise<void> {
    this._ensureCtx();
    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume();
    }
  }

  // point this at an <audio>/<video> element playing the TTS stream
  connectAudioElement(el: HTMLMediaElement, opts?: { processed?: boolean }): void {
    this._ensureCtx();
    const processed = opts?.processed !== false;
    const src = this.ctx!.createMediaElementSource(el);

    if (processed) {
      if (!this.fxInput) {
        this.fxInput = this._buildVoiceFX();
      }
      src.connect(this.fxInput);
    } else {
      // Clean ElevenLabs playback — analyser only (swarm reacts), no chorus/reverb.
      src.connect(this.analyser!);
      if (!this.directToSpeakers) {
        this.analyser!.connect(this.ctx!.destination);
        this.directToSpeakers = true;
      }
    }

    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
    this.mode = 'audio';
  }

  update(dt: number, speaking: boolean): number {
    let raw = 0;
    if (this.mode === 'audio' && this.analyser && this.data) {
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      raw = Math.min(1, Math.sqrt(sum / this.data.length) * 3.2);
    } else if (speaking) {
      const ms = performance.now() * 0.001;
      const s =
        Math.sin(ms * 6.0) * 0.55 +
        Math.sin(ms * 9.3 + 2.0) * 0.30 +
        Math.sin(ms * 13.0) * 0.15;
      raw = Math.min(1, Math.abs(s) * 1.1);
    }
    const k = raw > this.level ? 0.5 : (1 - Math.pow(0.02, dt));
    this.level = lerp(this.level, raw, k);
    return this.level;
  }
}

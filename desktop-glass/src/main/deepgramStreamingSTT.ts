/**
 * Deepgram Nova-2 streaming STT for IIVO Glass (main process only).
 * Targets @deepgram/sdk v5.x API.
 * API key never leaves the main process — renderer sends raw audio bytes via IPC.
 *
 * Caption delivery model (matches YouTube live captions):
 *   - Interim results flow through immediately as raw preview text (no translation).
 *   - Final segments accumulate in a sentence buffer.
 *   - When speech_final fires (speaker paused), the full buffered sentence is emitted
 *     as a single isFinal+speechFinal chunk for translation — one API call per sentence
 *     instead of one per 2-word fragment.
 *   - Safety flush: if the buffer exceeds MAX_BUFFER_WORDS without speech_final, flush
 *     anyway so very long run-on sentences don't stall the display.
 */

import { DeepgramClient } from "@deepgram/sdk";

export interface DeepgramTranscript {
  /** Transcribed text (trimmed). */
  text: string;
  /** true = segment is complete; false = still-speaking interim. */
  isFinal: boolean;
  /**
   * true = speaker paused — sentence boundary. Callers should send this chunk
   * to the translation API as a complete thought, then clear their accumulator.
   */
  speechFinal?: boolean;
  /**
   * Stable ID for the current utterance. All speech_final chunks within the same
   * continuous utterance share this ID. Resets on UtteranceEnd (long silence).
   * Used by the caption display to APPEND words within a sentence (YouTube style).
   */
  sentenceId?: string;
  /**
   * Speaker index from Deepgram diarization (0, 1, 2…).
   * Present only when diarize:true is enabled on the connection.
   * Used to prefix transcript chunks as [S0], [S1] in the rolling transcript
   * so the GPT-5.5 AI notes pass can attribute insights per speaker.
   */
  speakerId?: number;
}

/** Max bytes buffered while the WebSocket is connecting (~5 s at 128 kbps). */
const QUEUE_MAX_BYTES = 80_000;

/** Safety flush: translate after this many words even without a speech_final. */
const MAX_BUFFER_WORDS = 40;

/** Flush on every speech_final — the caption display now accumulates within the sentence.
 *  Keep at 1 so translations appear immediately without waiting for words to stack up. */
const MIN_FLUSH_WORDS = 1;

/**
 * Pick the most-common speaker index across a word array from Deepgram.
 * Returns undefined when diarization is absent (single-speaker or not enabled).
 */
function dominantSpeaker(words: Array<Record<string, unknown>> | undefined): number | undefined {
  if (!words?.length) return undefined;
  const counts = new Map<number, number>();
  for (const w of words) {
    const s = w.speaker;
    if (typeof s !== "number") continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let best = -1;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) { best = id; bestCount = count; }
  }
  return best >= 0 ? best : undefined;
}

export class DeepgramStreamingSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private conn: any = null;
  private closed = false;
  /** Audio chunks that arrived before the connection was ready. */
  private pendingQueue: Buffer[] = [];
  private pendingBytes = 0;
  /** Accumulates final segments until speech_final fires. */
  private sentenceBuffer: string[] = [];
  /** Monotonically increasing ID — increments on UtteranceEnd so the display knows to start a new line. */
  private sentenceSeq: number = Date.now();
  /** Dominant speaker index for the current sentence being buffered. undefined = single-speaker or not yet seen. */
  private lastSpeakerId: number | undefined = undefined;

  constructor(
    private readonly apiKey: string,
    private readonly language: string,
    private readonly callbacks: {
      onTranscript: (t: DeepgramTranscript) => void;
      onError: (err: Error) => void;
    },
  ) {}

  private flushBuffer(speechFinal: boolean): void {
    if (this.sentenceBuffer.length === 0) return;
    const text = this.sentenceBuffer.join(" ").replace(/\s+/g, " ").trim();
    const speakerId = this.lastSpeakerId;
    this.sentenceBuffer = [];
    this.lastSpeakerId = undefined;
    if (!text) return;
    this.callbacks.onTranscript({
      text,
      isFinal: true,
      speechFinal,
      sentenceId: String(this.sentenceSeq),
      speakerId,
    });
  }

  /**
   * Open the WebSocket to Deepgram Nova-2.
   * Resolves once the connection is ready and any queued audio has been flushed.
   */
  async connect(): Promise<void> {
    const client = new DeepgramClient({ apiKey: this.apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = await client.listen.v1.connect({
      model: "nova-3",
      language: this.language === "auto" ? "multi" : this.language,
      smart_format: true,
      interim_results: true,     // needed so we can show live preview text
      endpointing: "250",         // 250 ms silence triggers speech_final — fast response without mid-word cuts
      utterance_end_ms: "1500",  // backstop: flush after 1.5 s of silence (speaker genuinely stopped)
      vad_events: true,
      diarize: true,             // speaker separation — adds speaker index to each word
    } as any);
    this.conn = conn;

    conn.on("message", (data: unknown) => {
      if (this.closed) return;
      try {
        const d = data as Record<string, unknown>;

        // UtteranceEnd fires after utterance_end_ms of silence — speaker genuinely stopped.
        // Flush whatever remains, then advance sentenceSeq so the next utterance starts a new line.
        if (d?.type === "UtteranceEnd") {
          const bufferedWords = this.sentenceBuffer.join(" ").split(/\s+/).filter(Boolean).length;
          if (bufferedWords > 0) this.flushBuffer(true);
          this.sentenceSeq++; // next speech chunk starts a new caption line
          return;
        }

        if (d?.type !== "Results") return;
        const channel = d?.channel as Record<string, unknown> | undefined;
        const alts = channel?.alternatives as Array<Record<string, unknown>> | undefined;
        const transcript = (alts?.[0]?.transcript as string | undefined)?.trim();
        if (!transcript) return;

        const isFinal = Boolean(d?.is_final);
        const speechFinal = Boolean(d?.speech_final);

        // ── Speaker diarization ─────────────────────────────────────────────
        // Deepgram returns per-word speaker integers when diarize:true is set.
        // We pick the most-common speaker across all words in this segment as
        // the dominant speaker for the chunk (majority vote handles overlaps).
        const words = alts?.[0]?.words as Array<Record<string, unknown>> | undefined;
        const speakerId = dominantSpeaker(words);
        // ────────────────────────────────────────────────────────────────────

        if (!isFinal) {
          // Interim: show raw preview text immediately, no translation yet.
          this.callbacks.onTranscript({ text: transcript, isFinal: false });
          return;
        }

        // Final segment — add to sentence buffer.
        this.sentenceBuffer.push(transcript);
        // Track the dominant speaker for this sentence so we can emit it on flush.
        if (speakerId != null) this.lastSpeakerId = speakerId;

        const wordCount = this.sentenceBuffer.join(" ").split(/\s+/).length;
        const enoughWords = wordCount >= MIN_FLUSH_WORDS;
        if (wordCount >= MAX_BUFFER_WORDS || (speechFinal && enoughWords)) {
          // Long enough sentence or hard cap hit — flush as one chunk.
          this.flushBuffer(speechFinal);
        }
        // Otherwise keep accumulating even if speech_final fires (too short).
      } catch {
        // malformed message — ignore
      }
    });

    conn.on("error", (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError(error);
    });

    conn.connect();
    await conn.waitForOpen();

    // Flush any audio that was queued while we were connecting.
    if (!this.closed && this.pendingQueue.length > 0) {
      console.log(`[deepgram] flushing ${this.pendingQueue.length} queued chunks`);
      for (const chunk of this.pendingQueue) {
        try {
          conn.sendMedia(chunk);
        } catch {
          break;
        }
      }
    }
    this.pendingQueue = [];
    this.pendingBytes = 0;
  }

  /**
   * Forward a raw audio buffer (WebM/Opus from MediaRecorder) to Deepgram.
   * If the connection is not yet open, the buffer is queued and replayed on connect.
   */
  sendAudio(buffer: Buffer): void {
    if (this.closed) return;
    if (!this.conn || this.conn.readyState !== 1 /* OPEN */) {
      // Queue for replay once connected (bounded so we don't buffer indefinitely).
      if (this.pendingBytes + buffer.length <= QUEUE_MAX_BYTES) {
        this.pendingQueue.push(buffer);
        this.pendingBytes += buffer.length;
      }
      return;
    }
    try {
      this.conn.sendMedia(buffer);
    } catch {
      // ignore transient send errors
    }
  }

  /** Cleanly close the Deepgram WebSocket. */
  close(): void {
    this.closed = true;
    // Flush any buffered text before closing.
    this.flushBuffer(true);
    this.pendingQueue = [];
    this.pendingBytes = 0;
    try {
      this.conn?.close();
    } catch {
      // ignore
    }
    this.conn = null;
  }
}

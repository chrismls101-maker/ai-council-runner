/**
 * Local on-device embeddings via fastembed (all-MiniLM-L6-v2, 384 dims).
 */

import { EmbeddingModel, FlagEmbedding } from "fastembed";
import { app } from "electron";
import { join } from "node:path";

let embedder: FlagEmbedding | null = null;
let embedderInitFailed = false;
let embedderInitPromise: Promise<boolean> | null = null;

const EMBEDDER_INIT_TIMEOUT_MS = 120_000;

export function isEmbedderReady(): boolean {
  return embedder !== null;
}

export function resetEmbedderInitForRetry(): void {
  if (embedder) return;
  embedderInitFailed = false;
  embedderInitPromise = null;
}

export async function initEmbedder(): Promise<boolean> {
  if (embedder) return true;
  if (embedderInitFailed) return false;

  if (!embedderInitPromise) {
    embedderInitPromise = (async () => {
      try {
        embedder = await FlagEmbedding.init({
          model: EmbeddingModel.AllMiniLML6V2,
          cacheDir: join(app.getPath("userData"), "models"),
          showDownloadProgress: false,
        });
        console.log("[glassEmbedder] all-MiniLM-L6-v2 ready");
        return true;
      } catch (err) {
        embedderInitFailed = true;
        console.error("[glassEmbedder] init failed — vector memory disabled:", err);
        return false;
      } finally {
        embedderInitPromise = null;
      }
    })();
  }

  return embedderInitPromise;
}

/** Await embedder init (e.g. first-run model download). Returns false on timeout or failure. */
export async function ensureEmbedderReady(timeoutMs = EMBEDDER_INIT_TIMEOUT_MS): Promise<boolean> {
  if (embedder) return true;
  if (embedderInitFailed) {
    resetEmbedderInitForRetry();
  }

  try {
    const result = await Promise.race([
      initEmbedder(),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (result === false) {
      console.warn("[glassEmbedder] ensureEmbedderReady timed out");
      return false;
    }
  } catch {
    return false;
  }

  return embedder !== null;
}

export async function embed(text: string): Promise<Float32Array> {
  if (!embedder) throw new Error("Embedder not initialized");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Cannot embed empty text");
  const vector = await embedder.queryEmbed(trimmed);
  return new Float32Array(vector);
}

/** Embed stored document text (passage) — use for memories written to the index. */
export async function embedPassage(text: string): Promise<Float32Array> {
  if (!embedder) throw new Error("Embedder not initialized");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Cannot embed empty text");
  for await (const batch of embedder.passageEmbed([trimmed], 1)) {
    const vector = batch[0];
    if (vector) return new Float32Array(vector);
  }
  throw new Error("passageEmbed returned no vector");
}

export function vectorToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function blobToVector(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

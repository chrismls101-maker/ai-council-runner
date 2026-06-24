#!/usr/bin/env node
/**
 * Optional live OpenAI STT verification for IIVO Glass.
 * NOT part of normal test suite — may incur OpenAI cost.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node desktop-glass/scripts/test-openai-stt-live.mjs
 *   IIVO_API_URL=http://localhost:3001 node desktop-glass/scripts/test-openai-stt-live.mjs
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../test-fixtures/silence.webm");
const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const endpointMode = (process.env.IIVO_GLASS_STT_ENDPOINT ?? "server").toLowerCase();

async function main() {
  if (!existsSync(fixturePath)) {
    console.error("Missing fixture:", fixturePath);
    console.error("Add a tiny audio/webm file at desktop-glass/test-fixtures/silence.webm to run live STT.");
    process.exit(2);
  }

  const buffer = await readFile(fixturePath);
  const mimeType = "audio/webm";

  if (endpointMode === "server") {
    console.log("Testing server STT at", `${apiUrl}/api/transcribe-audio`);
    const res = await fetch(`${apiUrl}/api/transcribe-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: buffer.toString("base64"),
        mimeType,
        source: "microphone",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Server STT failed:", res.status, body.error ?? body);
      process.exit(1);
    }
    console.log("Server STT OK:", body);
    return;
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.error("OPENAI_API_KEY required for direct live test.");
    process.exit(2);
  }

  console.log("Testing direct OpenAI STT");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "silence.webm");
  form.append("model", process.env.IIVO_GLASS_STT_MODEL ?? "gpt-4o-mini-transcribe");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Direct OpenAI STT failed:", res.status, body);
    process.exit(1);
  }
  console.log("Direct OpenAI STT OK:", body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

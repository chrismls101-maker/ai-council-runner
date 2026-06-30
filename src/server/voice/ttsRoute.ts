// ElevenLabs TTS — IIVO's voice (ported from the IIVO interface project).
// Holds the API key server-side and turns text into the AI's voice. The voice +
// settings here ARE "the voice we have": Matilda on eleven_turbo_v2_5, tuned
// serious/intelligent/expressive. POST /api/tts { text, voiceId? } -> audio/mpeg.

import type { Request, Response } from "express";

const VOICE = process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX"; // Matilda
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5";

export async function ttsHandler(req: Request, res: Response): Promise<void> {
  const KEY = process.env.ELEVENLABS_API_KEY;
  if (!KEY) { res.status(500).json({ error: "ELEVENLABS_API_KEY not set in .env" }); return; }
  const text = String((req.body && req.body.text) || "").slice(0, 2000);
  const voiceId = String((req.body && req.body.voiceId) || VOICE);
  if (!text.trim()) { res.status(400).json({ error: "no text" }); return; }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          language_code: "en",
        ...(typeof req.body?.previous_text === "string" && req.body.previous_text.trim()
          ? { previous_text: req.body.previous_text.trim().slice(0, 500) }
          : {}),
        ...(typeof req.body?.next_text === "string" && req.body.next_text.trim()
          ? { next_text: req.body.next_text.trim().slice(0, 500) }
          : {}),
        voice_settings: {
          stability: 0.58,
          similarity_boost: 0.86,
          style: 0.11,
          use_speaker_boost: true,
          ...(req.body?.voice_settings && typeof req.body.voice_settings === "object"
            ? req.body.voice_settings
            : {}),
        },
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      res.status(r.status).json({ error: "elevenlabs error", detail });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

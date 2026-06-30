#!/usr/bin/env node
/**
 * Bake Aletheia cinema voice lines to public/audio/aletheia-cinema/{id}.mp3
 * Requires ELEVENLABS_API_KEY in .env
 *
 * Usage: npm run bake:aletheia-cinema
 *        npm run bake:aletheia-cinema -- --only read,build
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

config({ path: path.join(root, ".env") });

const VOICE = process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5";
const KEY = process.env.ELEVENLABS_API_KEY;

const PROFILES = {
  cinemaSoft: { stability: 0.62, similarity_boost: 0.9, style: 0.06, use_speaker_boost: true },
  cinemaFelt: { stability: 0.5, similarity_boost: 0.9, style: 0.14, use_speaker_boost: true },
  cinemaEmphasis: { stability: 0.44, similarity_boost: 0.92, style: 0.2, use_speaker_boost: true },
  cinemaFinale: { stability: 0.46, similarity_boost: 0.91, style: 0.18, use_speaker_boost: true },
  boot: { stability: 0.44, similarity_boost: 0.9, style: 0.22, use_speaker_boost: true },
};

const CLIPS = [
  { id: "every-window", text: "Every window,", profile: "cinemaFelt" },
  { id: "one-layer", text: "One layer.", profile: "cinemaEmphasis" },
  { id: "above-it-all", text: "Above it all.", profile: "cinemaEmphasis" },
  { id: "agents", text: "Agents...", profile: "cinemaSoft" },
  { id: "orchestrated", text: "Orchestrated.", profile: "cinemaEmphasis" },
  { id: "memory", text: "Memory...", profile: "cinemaSoft" },
  { id: "memory-payoff", text: "They can't match.", profile: "cinemaEmphasis" },
  { id: "voice", text: "Voice...", profile: "cinemaSoft" },
  { id: "voice-payoff", text: "Across your Mac.", profile: "cinemaEmphasis" },
  { id: "read-1", text: "I reed...", profile: "cinemaSoft" },
  { id: "read-2", text: "Every app. One understanding.", profile: "cinemaEmphasis" },
  { id: "listen-1", text: "I listen...", profile: "cinemaSoft" },
  { id: "listen-2", text: "To what you allow. Carried forward.", profile: "cinemaEmphasis" },
  { id: "build-1", text: "I build.", profile: "cinemaFelt" },
  { id: "build-2", text: "Intelligence.", profile: "cinemaEmphasis" },
  { id: "build-3", text: "You own it.", profile: "cinemaEmphasis" },
  { id: "build-4", text: "I create it.", profile: "cinemaEmphasis" },
  { id: "build-5", text: "It is yours.", profile: "cinemaEmphasis" },
  { id: "build-6", text: "Intelligence that compounds.", profile: "cinemaEmphasis" },
  { id: "intelligence", text: "Intelligence...", profile: "cinemaSoft" },
  { id: "always-on-top", text: "Always on top.", profile: "cinemaEmphasis" },
  { id: "glass", text: "Glass...", profile: "cinemaSoft" },
  { id: "always-yours", text: "Always yours.", profile: "cinemaEmphasis" },
  { id: "intelligent-glass", text: "Intelligent glass.", profile: "cinemaFinale" },
  {
    id: "glass-welcome-1",
    text: "This is the next layer... of AI-native computing.",
    profile: "cinemaFinale",
  },
  { id: "glass-welcome-2", text: "Welcome... to Glass.", profile: "cinemaFinale" },
  { id: "boot-activate", text: "Glass... is live.", profile: "boot" },
];

const outDir = path.join(root, "public/audio/aletheia-cinema");
const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const onlyIds = onlyArg
  ? new Set(onlyArg.replace("--only", "").replace(/^=/, "").split(",").map((s) => s.trim()).filter(Boolean))
  : null;

async function synthesize(clip) {
  const settings = PROFILES[clip.profile] ?? PROFILES.cinemaFelt;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: "POST",
    headers: {
      "xi-api-key": KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: clip.text,
      model_id: MODEL,
      language_code: "en",
      voice_settings: settings,
    }),
  });
  if (!res.ok) {
    throw new Error(`${clip.id}: ${res.status} ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!KEY) {
    console.error("ELEVENLABS_API_KEY missing — add to .env");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const clips = onlyIds ? CLIPS.filter((c) => onlyIds.has(c.id)) : CLIPS;
  console.log(`Baking ${clips.length} Aletheia cinema clips → ${outDir}`);

  for (const clip of clips) {
    const dest = path.join(outDir, `${clip.id}.mp3`);
    process.stdout.write(`  ${clip.id} ... `);
    try {
      const audio = await synthesize(clip);
      fs.writeFileSync(dest, audio);
      console.log(`ok (${audio.length} bytes)`);
    } catch (error) {
      console.log("FAILED");
      console.error(error);
      process.exitCode = 1;
    }
    await new Promise((r) => setTimeout(r, 320));
  }

  console.log("Done. Refresh the landing page — baked clips load before live TTS.");
}

main();

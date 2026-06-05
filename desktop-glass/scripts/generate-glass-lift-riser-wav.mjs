#!/usr/bin/env node
/**
 * IIVO Glass — "Lift me up" power-up riser (harmonica / reed character).
 * Output: 96 kHz, 24-bit stereo WAV → src/renderer/assets/iivo-glass-boot.wav
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/renderer/assets/iivo-glass-boot.wav");

const SAMPLE_RATE = 96000;
const DURATION_SEC = 10;
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);

/** Deterministic “breath” for reproducible builds. */
function breathNoise(t) {
  return (
    Math.sin(t * 4373.713) * 0.5 +
    Math.sin(t * 9281.391) * 0.35 +
    Math.sin(t * 1733.257) * 0.15
  );
}

/** Harmonica-style lift riser sample at time t (seconds). */
function riserSample(t) {
  const progress = Math.min(1, Math.max(0, t / DURATION_SEC));
  const lift = progress ** 1.12;

  const f0 = 185 * (880 / 185) ** lift;
  const vibrato = 1 + 0.007 * Math.sin(2 * Math.PI * 5.2 * t);
  const f = f0 * vibrato;

  const harmonics = [
    [1, 0.55],
    [2, 0.38],
    [3, 0.22],
    [4, 0.12],
    [5, 0.06],
  ];
  let reed = 0;
  for (const [h, w] of harmonics) {
    reed += w * Math.sin(2 * Math.PI * f * h * t);
  }

  const attack = Math.min(1, t / 0.35);
  const release = Math.min(1, (DURATION_SEC - t) / 0.55);
  const swell = 0.32 + 0.68 * lift;
  const env = attack * release * swell;

  const breath = breathNoise(t) * (0.08 + 0.14 * lift) * env;
  const body = reed * 0.2 * env;

  const stereoW = 0.12 * Math.sin(2 * Math.PI * f * 2 * t) * env;
  const mono = body + breath;
  return {
    l: mono * (1 - stereoW),
    r: mono * (1 + stereoW),
  };
}

const left = new Float32Array(NUM_SAMPLES);
const right = new Float32Array(NUM_SAMPLES);

for (let i = 0; i < NUM_SAMPLES; i += 1) {
  const t = i / SAMPLE_RATE;
  const { l, r } = riserSample(t);
  left[i] = l;
  right[i] = r;
}

let peak = 0;
for (let i = 0; i < NUM_SAMPLES; i += 1) {
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const normalize = peak > 0 ? 0.92 / peak : 1;
for (let i = 0; i < NUM_SAMPLES; i += 1) {
  left[i] *= normalize;
  right[i] *= normalize;
}

const pcm = Buffer.alloc(NUM_SAMPLES * 2 * 3);
let o = 0;
for (let i = 0; i < NUM_SAMPLES; i += 1) {
  for (const ch of [left[i], right[i]]) {
    const v = Math.round(Math.max(-1, Math.min(1, ch)) * 0x7fffff);
    pcm[o++] = v & 0xff;
    pcm[o++] = (v >> 8) & 0xff;
    pcm[o++] = (v >> 16) & 0xff;
  }
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2 * 3, 28);
header.writeUInt16LE(6, 32);
header.writeUInt16LE(24, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(
  `Wrote ${outPath}\n  ${DURATION_SEC}s stereo | ${SAMPLE_RATE / 1000} kHz | 24-bit | harmonica lift riser`,
);

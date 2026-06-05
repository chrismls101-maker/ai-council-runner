#!/usr/bin/env node
/**
 * 10s single power-up bed + ready tail (stereo WAV) — mirrors glassBootSoundSynth.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/renderer/assets/iivo-glass-boot.wav");

const sampleRate = 44100;
const durationSec = 10;
const numSamples = Math.floor(sampleRate * durationSec);
const left = new Float32Array(numSamples);
const right = new Float32Array(numSamples);

function env(t, attack, release, total) {
  if (t < attack) return t / attack;
  if (t > total - release) return Math.max(0, (total - t) / release);
  return 1;
}

function addTone(freq, startSec, lenSec, amp) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(lenSec * sampleRate);
  for (let i = 0; i < len && start + i < numSamples; i += 1) {
    const t = (start + i) / sampleRate;
    const local = i / sampleRate;
    const e = env(local, 0.25, 0.35, lenSec);
    const s = Math.sin(2 * Math.PI * freq * t) * amp * e;
    left[start + i] += s;
    right[start + i] += s;
  }
}

function addSweep(f0, f1, startSec, lenSec, amp) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(lenSec * sampleRate);
  for (let i = 0; i < len && start + i < numSamples; i += 1) {
    const t = (start + i) / sampleRate;
    const local = i / sampleRate;
    const p = i / len;
    const freq = f0 * (f1 / f0) ** p;
    const e = env(local, 0.2, 0.35, lenSec);
    const s = Math.sin(2 * Math.PI * freq * t) * amp * e;
    left[start + i] += s;
    right[start + i] += s;
  }
}

function addAir(startSec, lenSec, amp) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(lenSec * sampleRate);
  for (let i = 0; i < len && start + i < numSamples; i += 1) {
    const t = i / len;
    const e = env(i / sampleRate, 0.3, 0.35, lenSec) * (0.2 + 0.8 * t);
    const n = (Math.random() * 2 - 1) * amp * e;
    left[start + i] += n;
    right[start + i] += n;
  }
}

// One boot bed
addTone(55, 0, durationSec, 0.14);
addSweep(72, 720, 0, durationSec * 0.96, 0.12);
addAir(0, durationSec, 0.045);

// Finish preview at end
addTone(523.25, 9.12, 0.55, 0.1);
addTone(784, 9.3, 0.65, 0.095);

for (let i = 0; i < numSamples; i += 1) {
  const t = i / sampleRate;
  const fadeIn = Math.min(1, t / 0.35);
  const fadeOut = Math.min(1, (durationSec - t) / 0.45);
  const g = fadeIn * fadeOut;
  left[i] = Math.max(-0.98, Math.min(0.98, left[i] * g));
  right[i] = Math.max(-0.98, Math.min(0.98, right[i] * g));
}

const pcm = Buffer.alloc(numSamples * 4);
for (let i = 0; i < numSamples; i += 1) {
  pcm.writeInt16LE(Math.round(left[i] * 32767), i * 4);
  pcm.writeInt16LE(Math.round(right[i] * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outPath} (${durationSec}s single boot bed + finish tail)`);

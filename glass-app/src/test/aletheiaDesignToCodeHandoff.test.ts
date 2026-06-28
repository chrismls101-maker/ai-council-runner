import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("design to code save handoff uses ephemeral Aletheia voice, not lastNotice", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const fn = src.slice(src.indexOf("async function persistDesignToCodeToGlassStorage"));
  const body = fn.slice(0, fn.indexOf("function createDesignGenerationDeps"));
  assert.match(body, /speakAletheiaDesignToCodeHandoff/);
  assert.doesNotMatch(body, /lastNotice/);
  assert.doesNotMatch(body, /companionModeActive/);
});

test("speakAletheiaDesignToCodeHandoff sets ephemeral speak with companion surface", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const fn = src.slice(src.indexOf("function speakAletheiaDesignToCodeHandoff"));
  const body = fn.slice(0, fn.indexOf("function appendFounderCommandBoundaryLedger"));
  assert.match(body, /aletheiaEphemeralSpeak/);
  assert.match(body, /surface:\s*"companion"/);
});

test("overlay plays ephemeral speak without companion toggle", () => {
  const src = readFileSync(join(ROOT, "renderer", "companion", "GlassCompanionProvider.tsx"), "utf8");
  assert.match(src, /aletheiaEphemeralSpeak/);
  assert.match(src, /tts\.speak\(payload\.text\)/);
  const block = src.slice(src.indexOf("Design to Code — Aletheia speaks"));
  assert.doesNotMatch(block.slice(0, 600), /companionActive/);
});

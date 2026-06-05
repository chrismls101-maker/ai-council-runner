#!/usr/bin/env node
/**
 * Probe OpenAI model availability for IIVO Glass (does not print API keys).
 *
 * Usage:
 *   node scripts/check-openai-models.mjs
 *   OPENAI_API_KEY=sk-... node scripts/check-openai-models.mjs
 */

import dotenv from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: join(repoRoot, ".env") });

const FALLBACK = "gpt-4o";

/** Not compatible with Glass `/v1/chat/completions` route. */
const EXCLUDED = new Set(["gpt-5.5-pro", "gpt-5.5-pro-2026-04-23"]);

const CHAT_CANDIDATES_BASE = [
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.4",
  "gpt-5",
  "gpt-5-chat-latest",
  "gpt-4.1",
  "gpt-4o",
];

const TEXT_CANDIDATES = unique([
  process.env.IIVO_GLASS_OPENAI_MODEL,
  process.env.IIVO_GLASS_SEMANTIC_MODEL,
  process.env.IIVO_GLASS_DIAGNOSTIC_MODEL,
  ...CHAT_CANDIDATES_BASE,
]).filter((m) => !EXCLUDED.has(m));

const VISION_CANDIDATES = unique([
  process.env.IIVO_GLASS_VISION_MODEL,
  process.env.IMAGE_VISION_MODEL,
  process.env.IIVO_GLASS_DIAGNOSTIC_MODEL,
  process.env.IIVO_GLASS_OPENAI_MODEL,
  ...CHAT_CANDIDATES_BASE,
]).filter((m) => !EXCLUDED.has(m));

function unique(list) {
  const out = [];
  for (const item of list) {
    const v = item?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function usesGpt5ClassParams(model) {
  return /^(gpt-5|gpt-5\.|o3|o4)/.test(model);
}

function buildProbeBody(model) {
  const body = {
    model,
    messages: [{ role: "user", content: "Reply with exactly: ok" }],
  };
  if (usesGpt5ClassParams(model)) {
    body.max_completion_tokens = 5;
  } else {
    body.max_tokens = 5;
    body.temperature = 0;
  }
  return body;
}

function isModelUnavailable(status, bodyText) {
  const lower = bodyText.toLowerCase();
  return (
    status === 404 ||
    lower.includes("model_not_found") ||
    lower.includes("does not exist") ||
    (lower.includes("model") && lower.includes("not found"))
  );
}

async function probeTextModel(model) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { model, ok: false, reason: "OPENAI_API_KEY not set" };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildProbeBody(model)),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) {
      if (isModelUnavailable(res.status, body)) {
        return { model, ok: false, reason: "model unavailable" };
      }
      return { model, ok: false, reason: `HTTP ${res.status}` };
    }
    return { model, ok: true };
  } catch (err) {
    return { model, ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function pickFirstAvailable(candidates) {
  const results = [];
  for (const model of candidates) {
    const r = await probeTextModel(model);
    results.push(r);
    if (r.ok) return { selected: model, results };
  }
  return { selected: FALLBACK, results };
}

async function main() {
  console.log("IIVO Glass — OpenAI model probe");
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY?.trim() ? "set" : "missing"}`);
  console.log("");

  const textPick = await pickFirstAvailable(TEXT_CANDIDATES);
  const visionPick = await pickFirstAvailable(VISION_CANDIDATES);

  console.log("Text candidates:");
  for (const r of textPick.results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.model}${r.reason && !r.ok ? ` (${r.reason})` : ""}`);
  }
  console.log(`→ Recommended text model: ${textPick.selected}`);
  console.log("");

  console.log("Vision candidates:");
  for (const r of visionPick.results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.model}${r.reason && !r.ok ? ` (${r.reason})` : ""}`);
  }
  console.log(`→ Recommended vision model: ${visionPick.selected}`);
  console.log("");

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("Set OPENAI_API_KEY to probe your account. Runtime fallback chain: gpt-4.1 → gpt-4o.");
    process.exit(0);
  }

  if (textPick.selected === FALLBACK && !textPick.results.find((r) => r.model === FALLBACK)?.ok) {
    console.error("No text model available including fallback.");
    process.exit(1);
  }

  process.exit(0);
}

main();

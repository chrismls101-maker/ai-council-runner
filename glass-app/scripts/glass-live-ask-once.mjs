#!/usr/bin/env node
// Single live Glass API ask — for deep/overnight stress loops (rate-limited by caller).
//
// Usage:
//   node scripts/glass-live-ask-once.mjs
//   node scripts/glass-live-ask-once.mjs "Your prompt here"

const STUB_CANARY = "IIVO Glass is working";
const COUNCIL_MARKERS = [
  "Final Action Plan",
  "Decision Quality",
  "Sales Attack",
  "Product Decision",
  "Final Judge",
];

const apiUrl = (process.env.IIVO_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const prompt =
  process.argv[2] ??
  "What is IIVO Glass designed to help me do on my desktop? Answer in 1–2 sentences.";

function assertLiveAnswer(answer) {
  if (!answer || typeof answer !== "string") throw new Error("Empty answer");
  if (answer.includes(STUB_CANARY)) throw new Error("Stub canary in answer");
  if (answer.trim().length < 20) throw new Error(`Answer too short (${answer.trim().length} chars)`);
  for (const m of COUNCIL_MARKERS) {
    if (answer.includes(m)) throw new Error(`Council marker: ${m}`);
  }
}

const started = Date.now();
const res = await fetch(`${apiUrl}/api/glass/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, responseStyle: "overlay" }),
  signal: AbortSignal.timeout(60_000),
});
const ms = Date.now() - started;
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`FAIL HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  process.exit(1);
}

const { answer, routeUsed, model } = body ?? {};
try {
  assertLiveAnswer(answer);
  if (routeUsed !== "glass_direct") {
    throw new Error(`Expected glass_direct, got ${routeUsed}`);
  }
} catch (err) {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
}

console.log(`OK live ask · ${routeUsed} · ${model ?? "?"} · ${ms}ms · ${answer.slice(0, 120)}…`);
process.exit(0);

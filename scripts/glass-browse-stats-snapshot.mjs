#!/usr/bin/env node
/**
 * Save a weekly Glass browse funnel snapshot from the production stats API.
 *
 * Usage:
 *   GLASS_BROWSE_STATS_TOKEN=your-token node scripts/glass-browse-stats-snapshot.mjs
 *   GLASS_BROWSE_STATS_TOKEN=your-token IIVO_BASE_URL=https://iivo.ai node scripts/glass-browse-stats-snapshot.mjs
 *
 * Writes: data/landing/snapshots/glass-browse-stats-YYYY-MM-DD.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const token = process.env.GLASS_BROWSE_STATS_TOKEN?.trim();
const baseUrl = (process.env.IIVO_BASE_URL ?? "https://iivo.ai").replace(/\/+$/, "");

if (!token) {
  console.error("Set GLASS_BROWSE_STATS_TOKEN to fetch protected funnel stats.");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/landing/glass-browse/stats?token=${encodeURIComponent(token)}`);
if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`Stats fetch failed (${res.status})${body ? `: ${body}` : ""}`);
  process.exit(1);
}

const payload = await res.json();
const outDir = path.join(repoRoot, "data/landing/snapshots");
await fs.mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(outDir, `glass-browse-stats-${stamp}.json`);
await fs.writeFile(
  outPath,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), source: baseUrl, ...payload }, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote ${outPath}`);

#!/usr/bin/env node
/**
 * Verify every file referenced by manifest.json + popup.html exists on disk.
 * Run before loading unpacked in Chrome: npm run validate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = new Set(["manifest.json"]);

function add(rel) {
  if (!rel || rel.startsWith("http")) return;
  files.add(rel.replace(/^\.\//, ""));
}

add(manifest.background?.service_worker);
for (const cs of manifest.content_scripts ?? []) {
  for (const js of cs.js ?? []) add(js);
}
add(manifest.action?.default_popup);

function addIcons(obj) {
  if (!obj) return;
  for (const value of Object.values(obj)) {
    if (typeof value === "string") add(value);
    else addIcons(value);
  }
}
addIcons(manifest.icons);
addIcons(manifest.action?.default_icon);

const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
for (const match of popupHtml.matchAll(/(?:src|href)="([^"]+)"/g)) {
  add(match[1]);
}

// background importScripts
const bg = fs.readFileSync(path.join(root, "background.js"), "utf8");
for (const match of bg.matchAll(/importScripts\(\s*["']([^"']+)["']\s*\)/g)) {
  add(match[1]);
}

const missing = [...files].filter((f) => !fs.existsSync(path.join(root, f)));

if (missing.length) {
  console.error("IIVO Lens extension — missing files:");
  for (const f of missing) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`IIVO Lens extension OK — ${files.size} referenced files present.`);
console.log(`Load unpacked from: ${root}`);

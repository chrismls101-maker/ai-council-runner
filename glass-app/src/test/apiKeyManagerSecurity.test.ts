import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("API key values stay in main process and out of GlassState", () => {
  const store = readFileSync(join(ROOT, "main", "apiKeyStore.ts"), "utf8");
  const index = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const ipc = readFileSync(join(ROOT, "shared", "ipc.ts"), "utf8");
  const panel = readFileSync(join(ROOT, "renderer", "panel", "ProvidersSettings.tsx"), "utf8");
  const builder = readFileSync(join(ROOT, "renderer", "builder", "ApiKeyManagerPanel.tsx"), "utf8");

  assert.match(store, /safeStorage\.encryptString/);
  assert.match(store, /getApiKeyMaskedDisplay/);
  assert.match(index, /isOverlayIpcSender/);
  assert.match(index, /isPanelIpcSender/);
  assert.match(index, /apiKeyGetMasked/);
  assert.match(index, /normalizeApiKeyId/);
  assert.doesNotMatch(index, /listApiKeys\(\)[\s\S]{0,120}snapshot\(/);
  const glassStateBlock = ipc.match(/export interface GlassState \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(glassStateBlock, /apiKey/i);
  assert.match(panel, /apiKeyGetMasked/);
  assert.doesNotMatch(panel, /apiKeyGetValue/);
  assert.match(panel, /type="password"/);
  assert.match(builder, /apiKeyGetValue/);
});

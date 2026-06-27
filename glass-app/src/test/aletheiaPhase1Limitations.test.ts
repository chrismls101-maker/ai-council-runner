import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

test("observation plane only persists snapshots during companion sessions", () => {
  const src = readFileSync(join(ROOT, "main", "aletheiaObservationPlane.ts"), "utf8");
  assert.match(
    src,
    /sessionId\s*&&\s*\(/,
    "refreshAletheiaObservationPlane must gate persistence on sessionId",
  );
});

test("perception loop clears clipboardText when clipboard is emptied", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  assert.match(
    src,
    /normalizeClipboardCapture\(clip\)/,
    "clipboard loop must normalize captures before storing state",
  );
  assert.match(
    src,
    /if \(hadText\)/,
    "clipboard clear must refresh observation when prior text is removed",
  );
});

test("enableCompanionModeForAgent gates activation and delegates to shared apply path", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const fn = src.slice(src.indexOf("async function enableCompanionModeForAgent"));
  assert.match(
    fn.slice(0, fn.indexOf("function syncAgentRunFromEvent")),
    /ensureCompanionModeCanActivate\(\)/,
    "agent companion enable must run shared gate checks",
  );
  assert.match(
    fn.slice(0, fn.indexOf("function syncAgentRunFromEvent")),
    /applyCompanionModeActivation\(\)/,
    "agent companion enable must use shared activation path",
  );
});

test("handleAletheiaActionConfirmation broadcasts speech after confirm", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const fn = src.slice(src.indexOf("async function handleAletheiaActionConfirmation"));
  assert.match(
    fn.slice(0, fn.indexOf("function tryHandleVoiceActionConfirmation")),
    /speakAletheiaAdviceAck[\s\S]*push\(\)/,
    "action confirmation must push state after speaking result",
  );
});

test("applyCompanionModeActivation starts Deepgram companion session", () => {
  const src = readFileSync(join(ROOT, "main", "index.ts"), "utf8");
  const fn = src.slice(src.indexOf("function applyCompanionModeActivation"));
  assert.match(
    fn.slice(0, fn.indexOf("function deactivateCompanionMode")),
    /startCompanionDeepgramSession\(\)/,
    "companion activation must start Deepgram",
  );
});

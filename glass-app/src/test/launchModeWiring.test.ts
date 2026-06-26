/**
 * Launch Mode — static wiring checks for all 9 priority areas.
 * Complements unit tests; does not replace manual Electron smoke.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("P1 SQLite force-quit recovery is wired", () => {
  const db = read("main/glassDatabase.ts");
  const startup = read("main/glassDatabaseStartup.ts");
  const index = read("main/index.ts");
  const overlay = read("renderer/overlay/useGlassNotification.ts");
  assert.match(db, /MIGRATION_V6_SESSION_TOMBSTONE/);
  assert.match(db, /MIGRATION_V7_MODEL_CALLS/);
  assert.match(startup, /detectUncleanShutdown/);
  assert.match(startup, /markSessionOpen/);
  assert.match(startup, /markSessionClosed/);
  assert.match(index, /recoveredFromUncleanExit/);
  assert.match(index, /Glass recovered from an unexpected exit/);
  assert.match(overlay, /recoveryToast/);
});

test("P2 memory enrichment covers ask + agent + council paths", () => {
  const client = read("main/glassAskClient.ts");
  const runner = read("main/agentRunner.ts");
  const council = read("main/councilBusPipeline.ts");
  const helpers = read("main/glassMemoryHelpers.ts");
  assert.match(client, /enrichGlassAskRequestWithMemory/);
  assert.match(runner, /enrichGlassAskRequestWithMemory/);
  assert.match(council, /enrichGlassAskRequestWithMemory/);
  assert.match(helpers, /hydrateContext/);
  assert.match(runner, /from "\.\/glassMemoryHelpers\.ts"/);
});

test("P3 agent bus crash-proofing is wired", () => {
  const bus = read("main/agentEventBus.ts");
  const chains = read("main/agentChains.ts");
  const dashboard = read("main/dashboardIpc.ts");
  const ui = read("renderer/dashboard/GlassDashboard.tsx");
  assert.match(bus, /createResilientSubscription/);
  assert.match(bus, /startHeartbeat/);
  assert.match(bus, /getHealthSnapshot/);
  assert.match(chains, /startHeartbeat/);
  assert.match(dashboard, /getAgentBusHealth/);
  assert.match(ui, /getAgentBusHealth/);
});

test("P4 zero-config fresh install guards are wired", () => {
  const utils = read("shared/glassAskClientUtils.ts");
  const index = read("main/index.ts");
  const digest = read("main/glassScreenDigest.ts");
  assert.match(utils, /formatGlassAskErrorForUser/);
  assert.match(index, /ensureAnthropicKeyActivated/);
  assert.match(digest, /resolveAnthropicApiKey/);
  assert.match(digest, /if \(!resolveAnthropicApiKey\(\)\) return/);
});

test("P5 whisper fallback — notifyCompanion removed, activator present", () => {
  const repo = [
    read("main/index.ts"),
    read("shared/deepgramWhisperFallbackPlan.ts"),
    read("main/deepgramWhisperFallback.ts"),
  ].join("\n");
  assert.doesNotMatch(repo, /notifyCompanionDeepgramUnavailable/);
  assert.match(repo, /activateDeepgramWhisperFallback/);
  assert.match(repo, /stopCompanionDeepgram/);
});

test("P6 tier 3 memory compounding pipeline exists", () => {
  const engine = read("main/glassMemoryEngine.ts");
  const chains = read("main/agentChains.ts");
  assert.match(engine, /runPostSessionExtraction/);
  assert.match(engine, /storeMemory/);
  assert.match(engine, /extractUserFacts/);
  assert.match(chains, /wirePostSessionMemoryExtraction|memory-extraction/);
  assert.equal(existsSync(join(ROOT, "..", "scripts", "debug-memory-retrieval.mjs")), true);
});

test("P7 server degraded indicator is wired", () => {
  const main = read("main/iivoServerDegradedMain.ts");
  const panel = read("renderer/panel/ServerDegradedIndicator.tsx");
  const index = read("main/index.ts");
  assert.match(main, /registerIivoServerDegradedHandler/);
  assert.match(panel, /glass-server-degraded-indicator/);
  assert.match(index, /scheduleServerHealthPolling/);
  assert.match(index, /iivoServerDegradedReason/);
});

test("P8 terminal auto-fix is wired", () => {
  const engine = read("main/terminalFixEngine.ts");
  const panel = read("renderer/dock/GlassTerminalPanel.tsx");
  const index = read("main/index.ts");
  assert.match(engine, /detectTerminalFailureCategory/);
  assert.match(engine, /buildTerminalFixPrompt/);
  assert.match(panel, /autoFixOnError/);
  assert.match(panel, /terminalFix/);
  assert.match(index, /buildTerminalFixAskRequest/);
  assert.match(index, /modelCallSource:\s*"terminal_fix"/);
  assert.match(index, /getLastScrollbackError/);
});

test("P9 security + session spend is wired", () => {
  const sanitizer = read("shared/logSanitizer.ts");
  const boot = read("main/boot.ts");
  const store = read("main/apiKeyStore.ts");
  const anthropic = read("main/glassAskAnthropic.ts");
  const modelCalls = read("main/modelCallStore.ts");
  const dashboard = read("renderer/dashboard/GlassDashboard.tsx");
  assert.match(sanitizer, /sk-ant-\[REDACTED\]/);
  assert.match(boot, /installLogSanitizer/);
  assert.match(store, /safeStorage\.encryptString/);
  assert.match(anthropic, /resolveAnthropicApiKey\(\)/);
  assert.match(anthropic, /recordModelCall/);
  assert.match(modelCalls, /recordModelCall/);
  assert.match(dashboard, /getSessionSpend/);
  assert.match(dashboard, /sessionSpendUsd|spend_usd|session-spend/);
});

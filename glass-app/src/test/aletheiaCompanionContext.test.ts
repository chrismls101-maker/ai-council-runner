import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALETHEIA_GLASS_ABILITIES_APPEND } from "../shared/aletheiaGlassAbilities.ts";
import { GLASS_COMPANION_SESSION_APPEND } from "../shared/aletheiaCompanionSession.ts";
import {
  formatAletheiaRuntimeSetupContext,
} from "../shared/aletheiaRuntimeSetupContext.ts";
import { buildGlassSetupCapabilities } from "../shared/glassCapabilities.ts";
import { buildAletheiaDependencyManifest } from "../shared/aletheiaDependencyManifest.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const baseCapabilities = buildGlassSetupCapabilities({
  screenCaptureProbe: "ready",
  micPermission: "granted",
  systemAudioStatus: "available",
  sttStatus: "configured",
  sttEnabled: true,
  serverHealth: {
    reachable: true,
    vision: { enabled: true, configured: true },
    stt: { configured: true, enabled: true },
  },
});

test("formatAletheiaRuntimeSetupContext includes permissions and workspace", () => {
  const block = formatAletheiaRuntimeSetupContext({
    setupCapabilities: baseCapabilities,
    workspaceRoot: "/Users/dev/myproject",
    ollamaAvailable: true,
    companionModeActive: true,
    hearingMachineAudio: true,
    glassIdeActive: false,
  });
  assert.match(block, /Current Glass setup on this device/);
  assert.match(block, /Screen Recording: Ready/);
  assert.match(block, /Coder workspace: \/Users\/dev\/myproject/);
  assert.match(block, /Aletheia toggle: on/);
  assert.match(block, /Machine audio hearing: active/);
});

test("formatAletheiaRuntimeSetupContext lists missing dependencies", () => {
  const manifest = buildAletheiaDependencyManifest([
    { id: "anthropicApi", status: "ready" },
    { id: "blackhole", status: "optional_missing" },
    { id: "elevenLabsApi", status: "ready" },
    { id: "deepgramApi", status: "ready" },
    { id: "openAiFallback", status: "ready" },
    { id: "omniparser", status: "optional_missing" },
    { id: "pythonSidecar", status: "optional_missing" },
    { id: "ollama", status: "optional_missing" },
    { id: "switchAudioSource", status: "optional_missing" },
    { id: "nodePty", status: "ready" },
    { id: "accessibility", status: "ready" },
    { id: "screenRecording", status: "ready" },
  ]);
  const block = formatAletheiaRuntimeSetupContext({
    setupCapabilities: baseCapabilities,
    dependencyManifest: manifest,
    companionModeActive: true,
  });
  assert.match(block, /Bootstrap: ready/);
  assert.match(block, /BlackHole 2ch: optional_missing/);
});

test("formatAletheiaRuntimeSetupContext reports open surfaces", () => {
  const block = formatAletheiaRuntimeSetupContext({
    setupCapabilities: baseCapabilities,
    companionModeActive: true,
    researchExplorerActive: true,
    glassIdeActive: true,
  });
  assert.match(block, /Research Explorer/);
  assert.match(block, /Glass IDE/);
});

test("abilities append mentions explorers and live setup cross-check", () => {
  assert.match(ALETHEIA_GLASS_ABILITIES_APPEND, /Research Explorer/);
  assert.match(ALETHEIA_GLASS_ABILITIES_APPEND, /Computer Operator/);
  assert.match(ALETHEIA_GLASS_ABILITIES_APPEND, /live setup block/);
});

test("abilities append synced to server glassCompanionGuidance", () => {
  const serverSource = readFileSync(
    join(REPO_ROOT, "src/server/glass/glassCompanionGuidance.ts"),
    "utf8",
  );
  const sharedBody = ALETHEIA_GLASS_ABILITIES_APPEND.trim();
  assert.ok(
    serverSource.includes(sharedBody),
    "server GLASS companion guidance must include the same abilities appendix as glass-app shared",
  );
});

test("companion session append synced to server glassCompanionGuidance", () => {
  const serverSource = readFileSync(
    join(REPO_ROOT, "src/server/glass/glassCompanionGuidance.ts"),
    "utf8",
  );
  const sharedBody = GLASS_COMPANION_SESSION_APPEND.trim();
  assert.ok(
    serverSource.includes(sharedBody),
    "server GLASS companion guidance must include the same session appendix as glass-app shared",
  );
});

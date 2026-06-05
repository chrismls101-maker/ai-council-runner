#!/usr/bin/env node
// Deterministic Copilot stress loops — session lifecycle, listening limits,
// retention after repeated sessions, Stop-Everything wiring checks.
//
// Usage:
//   node --experimental-strip-types scripts/glass-copilot-stress-qa.mjs
//   node --experimental-strip-types scripts/glass-copilot-stress-qa.mjs --loops 25

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SessionCopilotController } from "../src/shared/copilotController.ts";
import { DEFAULT_COPILOT_CONFIG } from "../src/shared/copilotTypes.ts";
import { detectDebriefTrigger, buildSessionDebrief } from "../src/shared/copilotDebrief.ts";
import { extractCopilotInsights } from "../src/shared/copilotEngine.ts";
import { detectStuckSignal } from "../src/shared/copilotDiagnostic.ts";
import { GlassSessionStore } from "../src/shared/sessionStore.ts";
import { buildSessionContextPayload } from "../src/shared/sessionPayload.ts";
import {
  createListeningLimitState,
  shouldTriggerListeningLimit,
  markListeningLimitReached,
  extendListeningLimit,
  shouldAutoStopListeningLimit,
} from "../src/shared/listeningLimit.ts";
import {
  shouldPersistVisualAskToSession,
  shouldAutoUploadCapturesToContext,
} from "../src/shared/glassScreenshotRetention.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../src/shared/glassSettings.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

const loops = (() => {
  const i = process.argv.indexOf("--loops");
  if (i >= 0 && process.argv[i + 1]) return Math.max(1, parseInt(process.argv[i + 1], 10) || 1);
  return 1;
})();

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) passed += 1;
  else {
    failed += 1;
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

function deps(seed) {
  let n = seed;
  let ms = seed * 1000;
  return {
    idFactory: () => `stress-${seed}-${++n}`,
    clock: () => new Date(ms).toISOString(),
    now: () => ms,
    advance: (d) => {
      ms += d;
    },
  };
}

function transcriptEvent(id, text) {
  return {
    id,
    sessionId: "s1",
    kind: "transcript_note",
    timestamp: "2026-01-01T00:00:00.000Z",
    title: text.slice(0, 60),
    text,
    tags: ["system_audio"],
  };
}

function cfg(mode) {
  return { ...DEFAULT_COPILOT_CONFIG, mode };
}

// --- Session lifecycle: passive → coaching → diagnostic → debrief → stop ---
for (let i = 0; i < loops; i++) {
  const d = deps(i + 1);
  const store = new GlassSessionStore({ idFactory: d.idFactory, clock: d.clock });
  store.startSession(`Stress session ${i + 1}`);

  const passive = new SessionCopilotController(d, cfg("passive"));
  const pr = passive.tick({
    sessionLive: true,
    session: store.current(),
    transcript: "We must fix the broken deploy script before the launch deadline.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok(`loop ${i + 1} passive extracts silently`, pr.ran && pr.newInsights.length > 0 && !pr.intervention);

  const coaching = new SessionCopilotController(deps(i + 100), cfg("coaching"));
  const cr = coaching.tick({
    sessionLive: true,
    session: {
      id: store.current().id,
      title: store.current().title,
      status: "active",
      startedAt: store.current().startedAt,
      updatedAt: store.current().updatedAt,
      events: [transcriptEvent(`c-${i}`, "We must fix the critical security vulnerability now.")],
      insights: [],
    },
    transcript: "We must fix the critical security vulnerability now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok(`loop ${i + 1} coaching may surface card`, cr.ran);

  const diagnostic = new SessionCopilotController(deps(i + 200), cfg("diagnostic"));
  const dr = diagnostic.tick({
    sessionLive: true,
    session: store.current(),
    transcript: "",
    recentCommands: ["why error", "why error", "why error"],
    recentResponses: [],
    systemAudioActive: false,
  });
  if (dr.intervention) {
    const res = diagnostic.resolveIntervention(dr.intervention.id, "diagnose");
    ok(`loop ${i + 1} diagnostic approval-gated`, res.effect === "diagnose");
  } else {
    ok(`loop ${i + 1} diagnostic tick ran`, dr.ran);
  }

  ok(`loop ${i + 1} debrief trigger`, detectDebriefTrigger("I'm done"));
  const debrief = buildSessionDebrief(
    store.current(),
    pr.newInsights,
    { idFactory: d.idFactory, clock: d.clock },
    { sessionType: "coding_building", reportStyle: "detailed" },
  );
  ok(`loop ${i + 1} debrief has sections`, debrief.sections.length >= 3);

  const ended = store.endSession();
  ok(`loop ${i + 1} session ended`, ended?.status === "ended");
}

// --- Listening duration limit loop ---
for (let i = 0; i < loops; i++) {
  let state = createListeningLimitState();
  const maxMin = 30;
  const elapsed = (maxMin + 1) * 60_000;
  ok(
    `listen ${i + 1} triggers at limit`,
    shouldTriggerListeningLimit({ elapsedMs: elapsed, maxListeningMin: maxMin, extensionMs: 0, limitReached: false, listening: true }),
  );
  state = markListeningLimitReached(state, elapsed);
  state = extendListeningLimit(state);
  ok(`listen ${i + 1} continue extends`, !state.limitReached && state.extensionMs > 0);
  const reached = markListeningLimitReached(createListeningLimitState(), 0);
  ok(`listen ${i + 1} auto-stop after timeout`, shouldAutoStopListeningLimit(reached, 61_000));
}

// --- Retention / privacy after repeated sessions ---
for (let i = 0; i < loops; i++) {
  ok(`retention ${i + 1} ephemeral when no session`, !shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, false));
  ok(`retention ${i + 1} no auto upload`, !shouldAutoUploadCapturesToContext(DEFAULT_GLASS_USER_SETTINGS));
  const store = new GlassSessionStore({ idFactory: () => `r-${i}`, clock: () => new Date().toISOString() });
  store.startSession(`Retention ${i}`);
  store.addEvent({ kind: "transcript_note", title: "n", text: "note" });
  const payload = buildSessionContextPayload(store.current());
  ok(`retention ${i + 1} payload no base64`, !/data:image\/[a-z]+;base64,/.test(payload.payload.contentText));
  store.endSession();
}

// --- Stop Everything / main wiring (source scan, once per run) ---
if (loops >= 1) {
  const mainSource = readFileSync(join(SRC, "main", "index.ts"), "utf8");
  ok("main defines stopCopilotLoop", mainSource.includes("stopCopilotLoop()"));
  ok("copilot loop guarded by session+mode", /sessionIsLive\(\).*copilotModeIsActive/.test(mainSource));
  ok("submitCommand does not auto-upload visual", !mainSource.slice(mainSource.indexOf("async function submitCommand"), mainSource.indexOf("\nasync function handleCommand")).includes("beginVisualContextUpload"));
}

// --- Setup loop diagnostic signal (once) ---
if (loops >= 1) {
  const sig = detectStuckSignal({
    events: [
      transcriptEvent("s1", "Microphone permission denied"),
      transcriptEvent("s2", "Toggled permission but still failing"),
    ],
    recentCommands: ["why is mic permission still denied"],
  });
  ok("setup loop detected", sig.stuck && sig.category === "setup_loop");
}

const result = {
  suite: "glass-copilot-stress-qa",
  loops,
  total: passed + failed,
  passed,
  failed,
  failures,
  finishedAt: new Date().toISOString(),
};

try {
  mkdirSync("/tmp/iivo-glass-overnight", { recursive: true });
  writeFileSync("/tmp/iivo-glass-overnight/copilot-stress-result.json", JSON.stringify(result, null, 2));
} catch {
  /* ignore */
}

console.log(`\nCOPILOT STRESS (${loops} loops): ${passed}/${passed + failed} assertions passed`);
if (failed) {
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

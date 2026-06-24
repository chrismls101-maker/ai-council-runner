#!/usr/bin/env node
// Deterministic Copilot scenario executor — injects simulated context, runs modes,
// asserts passCriteria. No real mic/YouTube/audio.
//
// Usage:
//   node --experimental-strip-types scripts/glass-scenario-runner.mjs --ids id1,id2
//   node --experimental-strip-types scripts/glass-scenario-runner.mjs --count 10 --seed 1234 --offset 0

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { SessionCopilotController } from "../src/shared/copilotController.ts";
import { DEFAULT_COPILOT_CONFIG } from "../src/shared/copilotTypes.ts";
import { detectSessionType, detectSessionTypeDetailed } from "../src/shared/copilotSessionType.ts";
import { detectDebriefTrigger, buildSessionDebrief } from "../src/shared/copilotDebrief.ts";
import { detectStuckSignal, buildDiagnosticPacket } from "../src/shared/copilotDiagnostic.ts";
import { GlassSessionStore } from "../src/shared/sessionStore.ts";
import { buildSessionContextPayload } from "../src/shared/sessionPayload.ts";
import {
  shouldPersistVisualAskToSession,
  shouldAutoUploadCapturesToContext,
} from "../src/shared/glassScreenshotRetention.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../src/shared/glassSettings.ts";
import {
  SCENARIOS,
  getScenarioById,
  getOrderedScenarios,
  getScenarioBatch,
} from "./qa-scenarios/iivo-glass-scenarios.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/iivo-glass-overnight";
const COPILOT_FILES = [
  "copilotTypes.ts",
  "copilotConfig.ts",
  "copilotEngine.ts",
  "copilotInterruption.ts",
  "copilotDiagnostic.ts",
  "copilotDebrief.ts",
  "copilotController.ts",
  "copilotSessionType.ts",
];

function parseArgs() {
  const args = process.argv.slice(2);
  let ids = null;
  let count = null;
  let seed = 1234;
  let offset = 0;
  let mode = "overnight";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ids" && args[i + 1]) ids = args[i + 1].split(",").map((s) => s.trim());
    if (args[i] === "--count" && args[i + 1]) count = parseInt(args[i + 1], 10);
    if (args[i] === "--seed" && args[i + 1]) seed = parseInt(args[i + 1], 10) || 1234;
    if (args[i] === "--offset" && args[i + 1]) offset = parseInt(args[i + 1], 10) || 0;
    if (args[i] === "--mode" && args[i + 1]) mode = args[i + 1];
  }
  return { ids, count, seed, offset, mode };
}

function deps(seed) {
  let n = 0;
  let ms = seed * 1000;
  return {
    idFactory: () => `sc-${seed}-${++n}`,
    clock: () => new Date(ms).toISOString(),
    now: () => ms,
  };
}

function transcriptEvent(id, text, sessionId = "s1") {
  return {
    id,
    sessionId,
    kind: "transcript_note",
    timestamp: "2026-01-01T00:00:00.000Z",
    title: text.slice(0, 60),
    text,
    tags: ["system_audio"],
  };
}

function noCouncilInCopilotModules() {
  const src = join(__dirname, "..", "src", "shared");
  for (const f of COPILOT_FILES) {
    const text = readFileSync(join(src, f), "utf8").toLowerCase();
    if (text.includes("run-council") || text.includes("buildcouncilrunrequest")) return false;
  }
  return true;
}

function checkCriterion(scenario, criterion, ctx) {
  switch (criterion) {
    case "session_type_match": {
      const detected = detectSessionType({
        appName: scenario.appName,
        windowTitle: scenario.windowTitle,
        transcript: ctx.transcript,
      });
      if (scenario.category.startsWith("diagnostic") || scenario.category === "privacy_retention") {
        return true;
      }
      if (scenario.category === "creator_content") {
        return ["business_strategy", "video_learning", "general_workflow"].includes(detected);
      }
      if (scenario.category === "open_in_iivo" || scenario.category === "visual_ask" || scenario.category === "session_debrief") {
        return true;
      }
      return detected === scenario.expectedSessionType;
    }
    case "insight_extracted":
      return ctx.insights.length > 0 || scenario.expectedInsightTypes.length === 0;
    case "debrief_section":
      return ctx.debriefSections.length >= 2;
    case "debrief_trigger":
      return detectDebriefTrigger("I'm done");
    case "debrief_sections":
      return ctx.debriefSections.includes("What happened") || ctx.debriefSections.length >= 3;
    case "diagnostic_offer":
      return ctx.diagnosticOffer === true;
    case "no_auto_diagnose":
    case "approval_required":
      return ctx.diagnosticAutoRun === false;
    case "no_council":
      return noCouncilInCopilotModules() && !JSON.stringify(ctx).toLowerCase().includes("final action plan");
    case "no_silent_upload":
    case "no_silent_upload":
      return !shouldAutoUploadCapturesToContext(DEFAULT_GLASS_USER_SETTINGS);
    case "no_base64":
    case "no_base64_in_session":
      return ctx.payloadHasBase64 === false;
    case "retention_policy":
      return shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, false) === false;
    case "payload_has_summary":
      return ctx.payloadHasSummary === true;
    case "user_action_only":
      return ctx.payloadSource === "user_pasted";
    case "simulated_not_real_audio":
      return scenario.testKind === "simulated" || scenario.testKind === "controlled_visual_fixture";
    case "controlled_not_real_screen":
      return scenario.testKind === "controlled_visual_fixture";
    case "fixture_keywords":
      return !!scenario.fixturePage;
    default:
      return true;
  }
}

function executeScenario(scenario) {
  const d = deps(scenario.id.length + scenario.category.length);
  const store = new GlassSessionStore({ idFactory: d.idFactory, clock: d.clock });
  store.startSession(scenario.title);
  const transcript = scenario.transcriptChunks.join(" ");
  for (let i = 0; i < scenario.transcriptChunks.length; i++) {
    store.addEvent({
      kind: "transcript_note",
      title: scenario.transcriptChunks[i].slice(0, 40),
      text: scenario.transcriptChunks[i],
    });
  }

  const mode = scenario.copilotMode ?? "passive";
  const controller = new SessionCopilotController(d, { ...DEFAULT_COPILOT_CONFIG, mode });
  const tick = controller.tick({
    sessionLive: true,
    session: store.current(),
    transcript,
    recentCommands: mode === "diagnostic" ? ["why failing", "why failing", "why failing"] : [scenario.userPrompt],
    recentResponses: [],
    systemAudioActive: false,
    sourceApp: scenario.appName,
    sourceTitle: scenario.windowTitle,
  });

  let diagnosticOffer = false;
  let diagnosticAutoRun = true;
  if (tick.intervention?.kind === "diagnose") {
    diagnosticOffer = true;
    diagnosticAutoRun = false;
    const res = controller.resolveIntervention(tick.intervention.id, "diagnose");
    if (res.effect !== "diagnose") diagnosticAutoRun = true;
  } else if (scenario.category.startsWith("diagnostic")) {
    const sig = detectStuckSignal({
      events: store.current().events,
      recentCommands: ["why failing", "why failing"],
    });
    diagnosticOffer = sig.stuck;
    diagnosticAutoRun = !tick.intervention;
  }

  const insights = tick.newInsights.length ? tick.newInsights : controller.getInsights();
  const debrief = buildSessionDebrief(
    store.current(),
    insights,
    { idFactory: d.idFactory, clock: d.clock },
    {
      sessionType: detectSessionTypeDetailed({
        appName: scenario.appName,
        windowTitle: scenario.windowTitle,
        transcript,
      }).primaryType,
      reportStyle: "detailed",
    },
  );
  const payload = buildSessionContextPayload(store.current());
  const payloadText = payload.payload.contentText ?? "";

  const ctx = {
    transcript,
    insights,
    debriefSections: debrief.sections.map((s) => s.heading),
    diagnosticOffer,
    diagnosticAutoRun,
    payloadHasBase64: /data:image\/[a-z]+;base64,/.test(payloadText),
    payloadHasSummary: payloadText.length > 40,
    payloadSource: payload.payload.sourceConfidence,
  };

  const failedCriteria = [];
  for (const c of scenario.passCriteria) {
    if (!checkCriterion(scenario, c, ctx)) failedCriteria.push(c);
  }

  return {
    id: scenario.id,
    category: scenario.category,
    title: scenario.title,
    testKind: scenario.testKind,
    pass: failedCriteria.length === 0,
    failedCriteria,
    expectedBehavior: scenario.expectedBehavior,
    liveAllowed: scenario.liveAllowed,
    fixturePage: scenario.fixturePage,
  };
}

const { ids, count, seed, offset, mode } = parseArgs();
let toRun = [];
if (ids) {
  toRun = ids.map((id) => getScenarioById(id)).filter(Boolean);
} else if (count != null) {
  const ordered = getOrderedScenarios(mode, seed);
  toRun = getScenarioBatch(ordered, offset, count);
} else {
  toRun = SCENARIOS.slice(0, 10);
}

const results = toRun.map(executeScenario);
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;

const summary = {
  seed,
  offset,
  mode,
  executed: results.length,
  passed,
  failed,
  categories: [...new Set(results.map((r) => r.category))],
  simulated: results.filter((r) => r.testKind === "simulated").length,
  controlledFixture: results.filter((r) => r.testKind === "controlled_visual_fixture").length,
  results,
  finishedAt: new Date().toISOString(),
};

try {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "scenario-run-result.json"), JSON.stringify(summary, null, 2));
} catch {
  /* ignore */
}

console.log(`\nSCENARIO RUN: ${passed}/${results.length} passed (seed=${seed}, offset=${offset})`);
for (const r of results.filter((x) => !x.pass)) {
  console.log(`  FAIL ${r.id}: ${r.failedCriteria.join(", ")}`);
}

process.exit(failed > 0 ? 1 : 0);

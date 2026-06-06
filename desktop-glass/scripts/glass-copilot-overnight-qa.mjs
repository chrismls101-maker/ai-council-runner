// IIVO Glass — deterministic Session Copilot overnight QA.
//
// Runs without real mic/audio/network: it drives the pure shared modules
// (controller, engine, diagnostic, debrief, session-type, semantic, store,
// payload, retention, listening-limit, capabilities) and asserts product
// behavior + privacy/trust boundaries. Also runs four end-to-end "user
// journeys" (A–D) to prove usefulness beyond developer workflows.
//
// Run: node --experimental-strip-types scripts/glass-copilot-overnight-qa.mjs
// Exit code 0 only when every assertion passes.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SessionCopilotController } from "../src/shared/copilotController.ts";
import {
  DEFAULT_COPILOT_CONFIG,
  copilotModeIsActive,
} from "../src/shared/copilotTypes.ts";
import {
  parseCopilotConfig,
  shouldOfferCopilot,
  withCopilotConfig,
} from "../src/shared/copilotConfig.ts";
import {
  extractCopilotInsights,
  dedupeCopilotInsights,
  hasNewCopilotContext,
} from "../src/shared/copilotEngine.ts";
import {
  detectStuckSignal,
  buildDiagnosticPacket,
  isLikelyDiagnosticSpam,
} from "../src/shared/copilotDiagnostic.ts";
import {
  buildDiagnosticAnalysisPrompt,
  parseDiagnosticAnalysisResponse,
  buildDeterministicDiagnosticFallback,
} from "../src/shared/copilotDiagnosticAnalysis.ts";
import {
  detectDebriefTrigger,
  buildSessionDebrief,
} from "../src/shared/copilotDebrief.ts";
import {
  detectSessionType,
  detectSessionTypeDetailed,
  resolveSessionType,
} from "../src/shared/copilotSessionType.ts";
import {
  SEMANTIC_CONFIDENCE_THRESHOLD,
  shouldOfferSemanticRefine,
  canSemanticRefineOnDebrief,
  parseSemanticSessionTypeResponse,
  buildSemanticSessionTypePrompt,
  hasEnoughSessionContext,
  mergeSemanticIntoDetection,
} from "../src/shared/copilotSessionSemantic.ts";
import { GlassSessionStore } from "../src/shared/sessionStore.ts";
import { buildSessionContextPayload } from "../src/shared/sessionPayload.ts";
import {
  createListeningLimitState,
  isListeningLimitEnabled,
  shouldTriggerListeningLimit,
  markListeningLimitReached,
  extendListeningLimit,
  shouldAutoStopListeningLimit,
  LISTENING_LIMIT_CARD_TITLE,
} from "../src/shared/listeningLimit.ts";
import {
  shouldPersistVisualAskToSession,
  shouldAutoUploadCapturesToContext,
} from "../src/shared/glassScreenshotRetention.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../src/shared/glassSettings.ts";
import { buildGlassSetupCapabilities } from "../src/shared/glassCapabilities.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

// ----------------------------------------------------------------------------
// Tiny assertion harness (counts assertions for the overnight report).
// ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];
let group = "";

function section(name) {
  group = name;
}
function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`[${group}] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function deterministicDeps(startMs = 1_000_000) {
  let n = 0;
  let ms = startMs;
  return {
    idFactory: () => `id-${++n}`,
    clock: () => new Date(ms).toISOString(),
    now: () => ms,
    advance: (delta) => {
      ms += delta;
    },
  };
}
function cfg(overrides) {
  return { ...DEFAULT_COPILOT_CONFIG, ...overrides };
}
function makeSession(events = []) {
  return {
    id: "session-1",
    title: "Test session",
    status: "active",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    events,
    insights: [],
  };
}
function transcriptEvent(id, text) {
  return {
    id,
    sessionId: "session-1",
    kind: "transcript_note",
    timestamp: "2026-01-01T00:00:00.000Z",
    title: text.slice(0, 60),
    text,
    tags: ["system_audio"],
  };
}

// ============================================================================
// PHASE 7 — Copilot behavior scenarios (1–15)
// ============================================================================

// 1. Copilot off on launch.
section("1. off-on-launch");
eq("default mode is off", DEFAULT_COPILOT_CONFIG.mode, "off");
eq("off is inactive", copilotModeIsActive("off"), false);
eq("passive is active", copilotModeIsActive("passive"), true);
{
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "off" }));
  const r = c.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken build now.")]),
    transcript: "We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  eq("off tick does not run", r.ran, false);
  eq("off tick extracts nothing", r.newInsights.length, 0);
}

// 2. Start session (store lifecycle).
section("2. start-session");
{
  const store = new GlassSessionStore({ idFactory: () => "s1", clock: () => "2026-01-01T00:00:00.000Z" });
  const s = store.startSession("My session");
  ok("session created", !!s && s.status === "active");
  eq("current is the started session", store.current()?.id, s.id);
  const onlyOff = new SessionCopilotController(deterministicDeps(), cfg({ mode: "passive" })).tick({
    sessionLive: false,
    session: null,
    transcript: "We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  eq("copilot needs a live session", onlyOff.ran, false);
}

// 3. Passive mode extracts silently.
section("3. passive-silent");
{
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "passive" }));
  const r = c.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken build before launch.")]),
    transcript: "We must fix the broken build before launch.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  eq("passive ran", r.ran, true);
  ok("passive extracted >=1 insight", r.newInsights.length > 0);
  eq("passive never interrupts", r.intervention, null);
  eq("hasNewCopilotContext false on empty", hasNewCopilotContext({ newTranscript: "", newEvents: [] }), false);
  eq("hasNewCopilotContext true on text", hasNewCopilotContext({ newTranscript: "new words", newEvents: [] }), true);
}

// 4. Coaching mode shows a high-value suggestion card.
section("4. coaching-card");
{
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "coaching" }));
  const high = c.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]),
    transcript: "We must fix the broken deploy script now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok("coaching surfaces high-value card", !!high.intervention);
  const low = new SessionCopilotController(deterministicDeps(), cfg({ mode: "coaching" })).tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "The room was quiet and the coffee was warm today.")]),
    transcript: "The room was quiet and the coffee was warm today.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  eq("coaching stays quiet on low-value", low.intervention, null);
}

// 5. Diagnostic mode detects repeated issue.
section("5. diagnostic-detect");
{
  const sig = detectStuckSignal({
    events: [
      transcriptEvent("e1", "Error: build failed with exit code 1"),
      transcriptEvent("e2", "It failed again, still broken"),
    ],
    recentCommands: [],
  });
  eq("stuck detected", sig.stuck, true);
  ok("error count >= 2", sig.errorCount >= 2);
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "diagnostic" }));
  const r = c.tick({
    sessionLive: true,
    session: makeSession([]),
    transcript: "",
    recentCommands: ["why is this not opening", "why is this not opening", "why is this not opening"],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok("diagnostic offers a card", !!r.intervention);
  eq("offer kind is diagnose", r.intervention?.kind, "diagnose");
}

// 6. Diagnostic does not run AI until user clicks Diagnose.
section("6. diagnostic-approval");
{
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "diagnostic" }));
  const r = c.tick({
    sessionLive: true,
    session: makeSession([]),
    transcript: "",
    recentCommands: ["why is this not opening", "why is this not opening", "why is this not opening"],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok("offer present", !!r.intervention);
  ok("no auto effect on tick", !r.intervention || r.intervention.kind === "diagnose");
  const res = c.resolveIntervention(r.intervention.id, "diagnose");
  eq("diagnose only after approval", res.effect, "diagnose");
  ok("diagnostic prompt mentions root-cause", !!res.diagnosticPrompt && /root-cause/i.test(res.diagnosticPrompt));
  ok("diagnostic prompt forbids Council", !!res.diagnosticPrompt && /do not invoke council/i.test(res.diagnosticPrompt));
}

// 7. Dismiss increases backoff.
section("7. dismiss-backoff");
{
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "coaching" }));
  const events = [];
  let transcript = "";
  let n = 0;
  const fire = (sentence, gapMs) => {
    deps.advance(gapMs);
    events.push(transcriptEvent(`e-${++n}`, sentence));
    transcript += (transcript ? " " : "") + sentence;
    return c.tick({
      sessionLive: true,
      session: makeSession([...events]),
      transcript,
      recentCommands: [],
      recentResponses: [],
      systemAudioActive: false,
    });
  };
  const c1 = fire("We must fix the broken deploy script now.", 90_000);
  ok("first card", !!c1.intervention);
  c.resolveIntervention(c1.intervention.id, "dismiss");
  const c2 = fire("There is a critical security risk in the payment flow.", 90_000);
  ok("second card", !!c2.intervention);
  c.resolveIntervention(c2.intervention.id, "dismiss");
  eq("two dismissals tracked", c.runtimeState(true).consecutiveDismissals, 2);
  const c3 = fire("We need to migrate the database before the launch deadline.", 90_000);
  eq("backoff suppresses next card at normal gap", c3.intervention, null);
  const c4 = fire("We must rotate the leaked API keys immediately.", 200_000);
  ok("card surfaces again after long gap", !!c4.intervention);
  c.resolveIntervention(c4.intervention.id, "save");
  eq("accept resets dismissal streak", c.runtimeState(true).consecutiveDismissals, 0);
}

// 8. Accept/save updates insight decision.
section("8. decision-updates");
for (const [action, expected] of [
  ["yes", "accepted"],
  ["save", "saved"],
  ["later", "later"],
  ["dismiss", "dismissed"],
  ["no", "dismissed"],
]) {
  const deps = deterministicDeps();
  const c = new SessionCopilotController(deps, cfg({ mode: "coaching" }));
  const t = c.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]),
    transcript: "We must fix the broken deploy script now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok(`card present for "${action}"`, !!t.intervention);
  const res = c.resolveIntervention(t.intervention.id, action);
  eq(`action "${action}" => ${expected}`, res.insight?.userDecision, expected);
}

// 9 + 10. "I'm done" triggers debrief; debrief has required sections.
section("9-10. debrief");
{
  eq("'I'm done' triggers debrief", detectDebriefTrigger("I'm done"), true);
  eq("'summarize this session' triggers", detectDebriefTrigger("summarize this session"), true);
  eq("unrelated text does not trigger", detectDebriefTrigger("write a function to sort an array"), false);
  const deps = deterministicDeps();
  const session = makeSession([
    transcriptEvent("e1", "We must fix the broken deploy script now."),
    transcriptEvent("e2", "We could automate the release to save time."),
  ]);
  const insights = extractCopilotInsights(
    { newTranscript: "We must fix the broken deploy script now. We could automate the release to save time.", newEvents: session.events },
    deps,
  );
  const debrief = buildSessionDebrief(session, insights, deps, { sessionType: "general_workflow", reportStyle: "detailed" });
  const headings = debrief.sections.map((s) => s.heading);
  for (const required of [
    "What happened",
    "Key ideas",
    "Actions",
    "Risks / blockers",
    "Recommended next steps",
    "Open questions",
  ]) {
    ok(`debrief has "${required}"`, headings.includes(required), `headings: ${headings.join(", ")}`);
  }
  eq("debrief is deterministic (not AI)", debrief.aiEnhanced, false);
  ok("debrief markdown header", debrief.markdown.includes("# Session Debrief"));
}

// 11. Session type detection (all nine categories + mixed).
section("11. session-type");
eq("video_learning", detectSessionType({ appName: "Google Chrome", windowTitle: "How to invest - YouTube" }), "video_learning");
eq("meeting_call", detectSessionType({ appName: "Zoom", transcript: "let's discuss the agenda and action items" }), "meeting_call");
eq("research", detectSessionType({ appName: "Perplexity", transcript: "compare these sources and summarize the article findings" }), "research");
eq("coding_building", detectSessionType({ appName: "Cursor", transcript: "let's refactor this function and commit" }), "coding_building");
eq("business_strategy", detectSessionType({ transcript: "our go-to-market strategy depends on pricing and market positioning" }), "business_strategy");
eq("sales_review", detectSessionType({ appName: "HubSpot", transcript: "follow up with the prospect about objections on the cold email outreach" }), "sales_review");
eq(
  "meeting_call_04 sales discovery stays meeting_call",
  detectSessionType({
    appName: "Google Meet",
    windowTitle: "Acme — discovery",
    transcript:
      "Discovery call with prospect Acme. Deal size around $42k ARR. Objection: pricing. Next step: demo next Tuesday.",
  }),
  "meeting_call",
);
eq("studying", detectSessionType({ appName: "Canvas", transcript: "study for the exam and finish homework" }), "studying");
eq("general_workflow", detectSessionType({ transcript: "the weather is nice and the coffee is warm" }), "general_workflow");
{
  const mixed = detectSessionTypeDetailed({ transcript: "agenda for the meeting and refactor the deploy script" });
  eq("mixed session flagged", mixed.mixed, true);
  ok("mixed exposes secondary type", !!mixed.secondaryType);
  ok("mixed has competing types", mixed.competingTypes.length >= 2);
  eq("pinned setting overrides detection", resolveSessionType("meeting_call", { appName: "Cursor", transcript: "refactor this function" }), "meeting_call");
}

// 12. Semantic refine gating.
section("12. semantic-refine");
{
  const hi = detectSessionTypeDetailed({ appName: "Zoom", transcript: "agenda action items follow up attendees on the call meeting notes" });
  ok("high-confidence detection", hi.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD);
  eq(
    "high confidence does NOT offer AI refine",
    shouldOfferSemanticRefine({ setting: "auto", detection: hi, mode: "passive", alreadyRefined: false, signals: { transcript: "agenda action items follow up attendees" } }),
    false,
  );
  const lo = detectSessionTypeDetailed({ transcript: "agenda for the meeting and refactor the deploy script" });
  ok(
    "low-confidence mixed CAN refine",
    shouldOfferSemanticRefine({ setting: "auto", detection: lo, mode: "coaching", alreadyRefined: false, signals: { transcript: "agenda for the meeting and refactor the deploy script with npm", recentCommands: ["why deploy fail", "help with build"] } }),
  );
  eq("AI unavailable / unparseable falls back to null", parseSemanticSessionTypeResponse("Council recommends a full debate."), null);
  ok("semantic prompt forbids Council", /NOT invoke Council/i.test(buildSemanticSessionTypePrompt({ transcript: "strategy pricing" }, detectSessionTypeDetailed({ transcript: "strategy pricing" }))));
  ok(
    "debrief refine gate honors low confidence + context",
    canSemanticRefineOnDebrief({ setting: "auto", detection: lo, alreadyRefined: false, signals: { transcript: "x".repeat(50), recentCommands: ["a", "b"] } }),
  );
  eq("short context is not enough", hasEnoughSessionContext({ transcript: "short" }), false);
  const parsed = parseSemanticSessionTypeResponse(JSON.stringify({ primaryType: "research", secondaryType: "business_strategy", confidence: 0.82, reason: "x", suggestedReportTemplate: "mixed:research+business_strategy" }));
  ok("valid semantic JSON parses", !!parsed && parsed.primaryType === "research");
  const merged = mergeSemanticIntoDetection(detectSessionTypeDetailed({ transcript: "mixed signals" }), parsed);
  eq("merge applies semantic primary", merged.primaryType, "research");
}

// 13. Listening duration limit.
section("13. listening-limit");
{
  eq("limit disabled when 0", isListeningLimitEnabled(0), false);
  eq("limit enabled at 30", isListeningLimitEnabled(30), true);
  let state = createListeningLimitState();
  const max = 30;
  const overLimitMs = 31 * 60_000;
  const trigger = shouldTriggerListeningLimit({ elapsedMs: overLimitMs, maxListeningMin: max, extensionMs: state.extensionMs, limitReached: state.limitReached, listening: true });
  eq("limit card triggers after duration", trigger, true);
  ok("limit card title present", LISTENING_LIMIT_CARD_TITLE.length > 0);
  state = markListeningLimitReached(state, overLimitMs);
  eq("limit marked reached", state.limitReached, true);
  state = extendListeningLimit(state);
  eq("Continue clears reached flag", state.limitReached, false);
  ok("Continue extends window", state.extensionMs > 0);
  const noRetrigger = shouldTriggerListeningLimit({ elapsedMs: overLimitMs, maxListeningMin: max, extensionMs: state.extensionMs, limitReached: state.limitReached, listening: true });
  eq("extended window does not immediately re-trigger", noRetrigger, false);
  const reached = markListeningLimitReached(createListeningLimitState(), 0);
  eq("Stop Listening / no response auto-stops after timeout", shouldAutoStopListeningLimit(reached, 61_000), true);
  eq("no auto-stop before timeout", shouldAutoStopListeningLimit(reached, 1_000), false);
}

// 14. Privacy (file-level guards: no Council, no silent Context Bridge, no raw audio in session JSON).
section("14. privacy-guards");
{
  const COPILOT_SHARED = [
    "shared/copilotTypes.ts",
    "shared/copilotConfig.ts",
    "shared/copilotEngine.ts",
    "shared/copilotInterruption.ts",
    "shared/copilotDiagnostic.ts",
    "shared/copilotDebrief.ts",
    "shared/copilotController.ts",
    "shared/copilotSessionType.ts",
  ];
  const forbiddenCouncil = ["run-council", "runcouncilanalysis", "buildcouncilrunrequest", "iivoanalysisclient"];
  for (const rel of COPILOT_SHARED) {
    const src = readFileSync(join(SRC, rel), "utf8").toLowerCase();
    for (const tok of forbiddenCouncil) {
      ok(`${rel} has no Council wiring (${tok})`, !src.includes(tok));
    }
    ok(`${rel} does not upload context`, !src.includes("createcontextitem"));
    ok(`${rel} does not upload screenshots`, !src.includes("createscreenshotcontext"));
  }
  const persistence = readFileSync(join(SRC, "main", "sessionPersistence.ts"), "utf8");
  ok("session persistence strips screenshotDataUrl (no base64 in JSON)", /delete event\.screenshotDataUrl/.test(persistence));
  ok("session persistence has no embedded base64 image literal", !/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{40}/.test(persistence));
  ok("no raw audio buffer persisted to session JSON", !/screenshotDataUrl.*audio\/wav/.test(persistence) && !/audioBuffer.*JSON\.stringify/.test(persistence));
  eq("auto-upload off by default", shouldAutoUploadCapturesToContext(DEFAULT_GLASS_USER_SETTINGS), false);
}

// 15. Open in IIVO handoff (only via payload builder; contains summary; paths not base64).
section("15. open-in-iivo");
{
  const deps = deterministicDeps();
  const store = new GlassSessionStore({ idFactory: deps.idFactory, clock: deps.clock });
  store.startSession("Handoff session");
  store.addEvent({ kind: "transcript_note", title: "note", text: "We must fix the broken deploy script now." });
  store.addInsight({ type: "action", title: "Fix deploy", text: "Fix the broken deploy script.", accepted: true });
  const result = buildSessionContextPayload(store.current());
  ok("payload has title", typeof result.payload.title === "string" && result.payload.title.length > 0);
  ok("payload carries session summary text", /Session/i.test(result.payload.contentText) && result.payload.contentText.length > 40);
  ok("payload tags include session", Array.isArray(result.payload.tags) && result.payload.tags.includes("session"));
  ok("payload contains NO base64 image", !/data:image\/[a-z]+;base64,/.test(result.payload.contentText));
  ok("payload marked user-sourced (not silent)", result.payload.sourceConfidence === "user_pasted");
}

// ============================================================================
// PHASE 8 — Product-behavior user journeys (A–D)
// ============================================================================

// Journey A — Learning / video.
section("Journey A: learning/video");
{
  const deps = deterministicDeps();
  const store = new GlassSessionStore({ idFactory: deps.idFactory, clock: deps.clock });
  store.startSession("Watching a course");
  // Passive extraction over simulated video transcript chunks.
  const passive = new SessionCopilotController(deterministicDeps(), cfg({ mode: "passive", sessionType: "auto" }));
  const chunk = "The instructor says you must diversify your portfolio. A key idea is to dollar-cost average. We should rebalance quarterly.";
  store.addEvent({ kind: "transcript_note", title: "video", text: chunk });
  const pr = passive.tick({
    sessionLive: true,
    session: store.current(),
    transcript: chunk,
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: true,
    sourceApp: "Google Chrome",
    sourceTitle: "Investing 101 - YouTube",
  });
  eq("A: passive extracts silently", pr.intervention, null);
  ok("A: passive produced insights", pr.newInsights.length > 0);
  eq("A: detected as video_learning", detectSessionType({ appName: "Google Chrome", windowTitle: "Investing 101 - YouTube", transcript: chunk }), "video_learning");
  // Coaching suggests an action; user saves it.
  const coaching = new SessionCopilotController(deterministicDeps(), cfg({ mode: "coaching" }));
  const cr = coaching.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("a1", "We must rebalance the portfolio before the quarter ends.")]),
    transcript: "We must rebalance the portfolio before the quarter ends.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: true,
  });
  ok("A: coaching suggested an action card", !!cr.intervention);
  const saved = coaching.resolveIntervention(cr.intervention.id, "save");
  eq("A: user saved the suggestion", saved.insight?.userDecision, "saved");
  // Debrief on "I'm done".
  eq("A: 'I'm done' triggers debrief", detectDebriefTrigger("I'm done"), true);
  const debrief = buildSessionDebrief(store.current(), pr.newInsights, deps, { sessionType: "video_learning", reportStyle: "detailed" });
  const h = debrief.sections.map((s) => s.heading);
  ok("A: debrief has takeaways", h.includes("Key takeaways"));
  ok("A: debrief has action steps", h.includes("Action steps"));
  ok("A: debrief has open questions", h.some((x) => /open questions/i.test(x)));
}

// Journey B — Founder / strategy.
section("Journey B: founder/strategy");
{
  const deps = deterministicDeps();
  const text = "Our pricing strategy and go-to-market roadmap depend on the market. We must decide our revenue model and positioning. There is a risk the competitor undercuts us.";
  eq("B: detected business_strategy", detectSessionType({ transcript: text }), "business_strategy");
  const coaching = new SessionCopilotController(deterministicDeps(), cfg({ mode: "coaching" }));
  const cr = coaching.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("b1", "We must decide the pricing model before the board meeting.")]),
    transcript: "We must decide the pricing model before the board meeting.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: true,
  });
  ok("B: coaching surfaced a decision card", !!cr.intervention);
  const session = makeSession([transcriptEvent("b1", text)]);
  const insights = extractCopilotInsights({ newTranscript: text, newEvents: session.events }, deps);
  const debrief = buildSessionDebrief(session, insights, deps, { sessionType: "business_strategy", reportStyle: "detailed" });
  const h = debrief.sections.map((s) => s.heading).join(" | ");
  ok("B: debrief covers options/decisions", /option|decision|recommend/i.test(h));
  ok("B: debrief covers risks", /risk/i.test(h));
}

// Journey C — Diagnostic setup loop (full approval + analysis round-trip).
section("Journey C: diagnostic setup loop");
{
  const deps = deterministicDeps();
  const store = new GlassSessionStore({ idFactory: deps.idFactory, clock: deps.clock });
  store.startSession("Fixing mic setup");
  const events = [
    transcriptEvent("c1", "Microphone permission denied"),
    transcriptEvent("c2", "Toggled permission in settings but still failing"),
    transcriptEvent("c3", "Still no signal after restart"),
  ];
  const sig = detectStuckSignal({ events, recentCommands: ["why is mic permission still denied"], sourceApp: "IIVO Glass" });
  eq("C: stuck signal", sig.stuck, true);
  eq("C: classified setup_loop", sig.category, "setup_loop");
  const packet = buildDiagnosticPacket({ events, recentCommands: ["why is mic permission still denied"], sourceApp: "IIVO Glass" }, sig);
  ok("C: diagnostic packet built", !!packet);
  ok("C: packet has symptoms", packet.observedSymptoms.length >= 1);
  // Controller offers, user approves.
  const c = new SessionCopilotController(deterministicDeps(), cfg({ mode: "diagnostic" }));
  const tick = c.tick({
    sessionLive: true,
    session: makeSession(events),
    transcript: "",
    recentCommands: ["why is mic permission still denied", "why is mic permission still denied"],
    recentResponses: [],
    systemAudioActive: false,
  });
  ok("C: diagnose card offered", !!tick.intervention && tick.intervention.kind === "diagnose");
  const res = c.resolveIntervention(tick.intervention.id, "diagnose");
  eq("C: AI only after Diagnose click", res.effect, "diagnose");
  // Analysis prompt + parse + deterministic fallback.
  const prompt = buildDiagnosticAnalysisPrompt(packet, { sourceApp: "IIVO Glass", transcript: "mic setup" });
  ok("C: analysis prompt forbids Council", /council/i.test(prompt) ? /not.*council|do not.*council/i.test(prompt) : true);
  const fallback = buildDeterministicDiagnosticFallback(packet, "diag-1", "2026-01-01T00:00:00.000Z");
  eq("C: fallback is not AI-enhanced", fallback.aiEnhanced, false);
  ok("C: fallback has root cause", fallback.probableRootCause.length > 0);
  ok("C: fallback has next actions", fallback.nextActions.length >= 1);
  const parsedResult = parseDiagnosticAnalysisResponse(
    "Root cause: TCC mic permission not actually granted.\nNext actions:\n- Re-grant in System Settings\n- Restart Glass",
    "diag-2",
    "2026-01-01T00:00:00.000Z",
  );
  ok("C: AI response parses into result", !!parsedResult && parsedResult.id === "diag-2");
  // Save as a session event.
  const ev = store.addEvent({ kind: "transcript_note", title: "Diagnosis", text: fallback.fullMarkdown });
  ok("C: diagnosis saved as session event", !!ev);
}

// Journey D — General user research.
section("Journey D: research comparison");
{
  const deps = deterministicDeps();
  const text = "Let's compare ChatGPT, Claude, and Perplexity. According to these sources the findings suggest different strengths. We should summarize and decide which to adopt.";
  const detail = detectSessionTypeDetailed({ appName: "Perplexity", transcript: text });
  ok("D: detected research or mixed", detail.primaryType === "research" || detail.mixed || detail.secondaryType === "research");
  const session = makeSession([transcriptEvent("d1", text)]);
  const insights = extractCopilotInsights({ newTranscript: text, newEvents: session.events }, deps);
  const debrief = buildSessionDebrief(session, insights, deps, { sessionType: "research", reportStyle: "detailed" });
  const h = debrief.sections.map((s) => s.heading).join(" | ");
  ok("D: debrief summarizes findings/comparison", /finding|source|compar|summary|takeaway/i.test(h));
  ok("D: debrief has next steps/decision", /next research|next step|recommend|decision/i.test(h));
  eq("D: spam filter ignores neutral chatter", isLikelyDiagnosticSpam({ events: [transcriptEvent("d2", "The weather is nice today")], recentCommands: ["what is the weather", "what is the weather again"] }), true);
}

// ============================================================================
// PHASE 10 — Setup/status capability matrix (deterministic, simulated inputs)
// ============================================================================
section("Setup/status grid");
{
  const baseOffline = buildGlassSetupCapabilities({
    platform: "darwin",
    screenCaptureProbe: "not_checked",
    micPermission: "not_requested",
    systemAudioStatus: "not_verified",
    serverHealth: null,
    sttStatus: "unknown",
    sttEnabled: false,
  });
  const server = baseOffline.find((r) => r.id === "server");
  ok("server offline => error severity", !!server && server.severity === "error");
  const mic = baseOffline.find((r) => r.id === "microphone");
  ok("mic not requested on launch (not ready/listening)", !!mic && mic.status !== "ready" && mic.status !== "configured");

  const online = buildGlassSetupCapabilities({
    platform: "darwin",
    screenCaptureProbe: "ok",
    micPermission: "granted",
    systemAudioStatus: "not_verified",
    serverHealth: { reachable: true, vision: { enabled: true, configured: true }, stt: { configured: true, enabled: true } },
    sttStatus: "ready",
    sttEnabled: true,
  });
  const serverOnline = online.find((r) => r.id === "server");
  ok("server online => ok severity", !!serverOnline && serverOnline.severity === "ok");
  const sysAudio = online.find((r) => r.id === "systemAudio");
  ok("system audio NOT green without verified track/signal", !!sysAudio && sysAudio.severity !== "ok");
  eq("grid covers all 7 capabilities", online.length, 7);
}

// ============================================================================
// PHASE 9 — Visual ask / retention (deterministic)
// ============================================================================
section("Visual ask / retention");
{
  eq("no live session => not saved", shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, false), false);
  eq("live + default setting => saved", shouldPersistVisualAskToSession(DEFAULT_GLASS_USER_SETTINGS, true), true);
  eq("live + setting off => not saved", shouldPersistVisualAskToSession({ ...DEFAULT_GLASS_USER_SETTINGS, saveVisualAsksToSession: false }, true), false);
  eq("Context Bridge upload off by default", shouldAutoUploadCapturesToContext(DEFAULT_GLASS_USER_SETTINGS), false);
}

// ----------------------------------------------------------------------------
// Summary + machine-readable result.
// ----------------------------------------------------------------------------
const total = passed + failed;
const result = {
  suite: "glass-copilot-overnight-qa",
  total,
  passed,
  failed,
  failures,
  finishedAt: new Date().toISOString(),
};
try {
  mkdirSync("/tmp/iivo-glass-overnight", { recursive: true });
  writeFileSync("/tmp/iivo-glass-overnight/copilot-qa-result.json", JSON.stringify(result, null, 2));
} catch {
  // best-effort; do not fail the suite on report write
}

console.log("");
console.log("=".repeat(60));
console.log(`COPILOT QA: ${passed}/${total} assertions passed`);
if (failed > 0) {
  console.log(`FAILURES (${failed}):`);
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("=".repeat(60));

process.exit(failed === 0 ? 0 : 1);

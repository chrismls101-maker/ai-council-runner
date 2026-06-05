import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { SessionCopilotController } from "../shared/copilotController.ts";
import {
  DEFAULT_COPILOT_CONFIG,
  copilotModeIsActive,
  type GlassCopilotConfig,
  type GlassCopilotMode,
} from "../shared/copilotTypes.ts";
import {
  clampCopilotInterval,
  parseCopilotConfig,
  shouldOfferCopilot,
  withCopilotConfig,
} from "../shared/copilotConfig.ts";
import {
  dedupeCopilotInsights,
  extractCopilotInsights,
  hasNewCopilotContext,
} from "../shared/copilotEngine.ts";
import { detectStuckSignal, isLikelyDiagnosticSpam, buildDiagnosticPacket } from "../shared/copilotDiagnostic.ts";
import { detectDebriefTrigger, buildSessionDebrief } from "../shared/copilotDebrief.ts";
import {
  buildInterventionForInsight,
  buildDiagnoseOfferIntervention,
  shouldShowOverlayCard,
} from "../shared/copilotInterruption.ts";
import {
  detectSessionType,
  detectSessionTypeDetailed,
  resolveSessionType,
  scoreSessionTypes,
} from "../shared/copilotSessionType.ts";
import type { GlassSession, GlassSessionEvent } from "../shared/sessionTypes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");

function deterministicDeps(startMs = 1_000_000) {
  let n = 0;
  let ms = startMs;
  return {
    idFactory: () => `id-${++n}`,
    clock: () => new Date(ms).toISOString(),
    now: () => ms,
    advance: (delta: number) => {
      ms += delta;
    },
    setMs: (value: number) => {
      ms = value;
    },
  };
}

function makeSession(events: GlassSessionEvent[] = []): GlassSession {
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

function transcriptEvent(id: string, text: string): GlassSessionEvent {
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

function config(overrides: Partial<GlassCopilotConfig>): GlassCopilotConfig {
  return { ...DEFAULT_COPILOT_CONFIG, ...overrides };
}

// --- PART 1: defaults / launch safety -------------------------------------

test("Copilot is off by default (does not start on launch)", () => {
  assert.equal(DEFAULT_COPILOT_CONFIG.mode, "off");
  assert.equal(copilotModeIsActive("off"), false);
  assert.equal(copilotModeIsActive("passive"), true);
});

test("tick is a no-op when mode is off", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "off" }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken build now.")]),
    transcript: "We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(result.ran, false);
  assert.equal(result.reason, "mode-off");
  assert.equal(result.newInsights.length, 0);
});

test("Copilot only runs in an active session", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "passive" }));
  const result = controller.tick({
    sessionLive: false,
    session: null,
    transcript: "We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(result.ran, false);
  assert.equal(result.reason, "no-active-session");
});

// --- PART 2/3: extraction -------------------------------------------------

test("Passive mode saves insights silently (no overlay card)", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "passive" }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken build before launch.")]),
    transcript: "We must fix the broken build before launch.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(result.ran, true);
  assert.ok(result.newInsights.length > 0, "should extract at least one insight");
  assert.equal(result.intervention, null, "passive mode never interrupts");
});

test("interval extraction uses only new transcript chunks", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "passive" }));
  const session = makeSession([transcriptEvent("e1", "We must fix the broken build before launch.")]);
  const transcript = "We must fix the broken build before launch.";

  const first = controller.tick({
    sessionLive: true,
    session,
    transcript,
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(first.newInsights.length > 0);

  // Same transcript + same events → no new context → no new insights.
  const second = controller.tick({
    sessionLive: true,
    session,
    transcript,
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(second.newInsights.length, 0);
});

test("hasNewCopilotContext gates on new transcript / screen events", () => {
  assert.equal(
    hasNewCopilotContext({ newTranscript: "", newEvents: [] }),
    false,
  );
  assert.equal(
    hasNewCopilotContext({ newTranscript: "new words here", newEvents: [] }),
    true,
  );
  assert.equal(
    hasNewCopilotContext({
      newTranscript: "",
      newEvents: [transcriptEvent("e9", "something said")],
    }),
    true,
  );
});

test("dedupe prevents repeated insights", () => {
  const deps = deterministicDeps();
  const text = "We must fix the broken build before launch.";
  const existing = extractCopilotInsights(
    { newTranscript: text, newEvents: [] },
    deps,
  );
  const again = extractCopilotInsights(
    { newTranscript: text, newEvents: [] },
    deps,
  );
  const fresh = dedupeCopilotInsights(existing, again);
  assert.equal(fresh.length, 0, "duplicate text should be filtered out");
});

// --- PART 4: interruption rules ------------------------------------------

test("Coaching mode shows high-importance action/risk cards only", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]),
    transcript: "We must fix the broken deploy script now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(result.ran, true);
  assert.ok(result.intervention, "high-importance risk/action should surface a card");
});

test("Coaching mode stays quiet on low-importance context", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "The room was quiet and the coffee was warm today.")]),
    transcript: "The room was quiet and the coffee was warm today.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(result.intervention, null, "low-importance chatter should not interrupt");
});

test("interruption rules block passive mode and muted/low/duplicate cases", () => {
  const baseInsight = {
    id: "i1",
    type: "action" as const,
    title: "Fix the build",
    text: "We must fix the broken build now.",
    source: "transcript",
    confidence: 0.8,
    importance: "high" as const,
    createdAt: "now",
    relatedEventIds: [],
    userDecision: "pending" as const,
  };
  const baseCtx = {
    config: config({ mode: "coaching" }),
    nowMs: 10_000_000,
    lastInterventionMs: undefined,
    recentShownTexts: [],
  };
  assert.equal(shouldShowOverlayCard(baseInsight, baseCtx), true);
  // passive never shows
  assert.equal(
    shouldShowOverlayCard(baseInsight, { ...baseCtx, config: config({ mode: "passive" }) }),
    false,
  );
  // muted never shows
  assert.equal(
    shouldShowOverlayCard(baseInsight, { ...baseCtx, config: config({ mode: "coaching", muteSuggestions: true }) }),
    false,
  );
  // low importance never shows
  assert.equal(
    shouldShowOverlayCard({ ...baseInsight, importance: "low" }, baseCtx),
    false,
  );
  // recently shown duplicate blocked
  assert.equal(
    shouldShowOverlayCard(baseInsight, { ...baseCtx, recentShownTexts: [baseInsight.text] }),
    false,
  );
  // gap not satisfied (last intervention 10s ago)
  assert.equal(
    shouldShowOverlayCard(baseInsight, { ...baseCtx, lastInterventionMs: baseCtx.nowMs - 10_000 }),
    false,
  );
});

test("dedupe prevents repeated cards across ticks", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));
  const first = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken build now.")]),
    transcript: "We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(first.intervention);

  deps.advance(120_000); // beyond the 60s gap
  const second = controller.tick({
    sessionLive: true,
    session: makeSession([
      transcriptEvent("e1", "We must fix the broken build now."),
      transcriptEvent("e2", "We must fix the broken build now."),
    ]),
    transcript: "We must fix the broken build now. We must fix the broken build now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.equal(second.intervention, null, "duplicate insight must not produce a second card");
});

// --- PART 5: decisions ----------------------------------------------------

for (const [action, expected] of [
  ["yes", "accepted"],
  ["save", "saved"],
  ["later", "later"],
  ["dismiss", "dismissed"],
  ["no", "dismissed"],
] as const) {
  test(`card action "${action}" sets insight decision to "${expected}"`, () => {
    const deps = deterministicDeps();
    const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));
    const tick = controller.tick({
      sessionLive: true,
      session: makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]),
      transcript: "We must fix the broken deploy script now.",
      recentCommands: [],
      recentResponses: [],
      systemAudioActive: false,
    });
    assert.ok(tick.intervention);
    const resolution = controller.resolveIntervention(tick.intervention!.id, action);
    assert.ok(resolution.insight);
    assert.equal(resolution.insight!.userDecision, expected);
  });
}

// --- PART 6: debrief ------------------------------------------------------

test("'I'm done' and related phrases trigger a debrief", () => {
  assert.equal(detectDebriefTrigger("I'm done"), true);
  assert.equal(detectDebriefTrigger("finish session"), true);
  assert.equal(detectDebriefTrigger("give me the report"), true);
  assert.equal(detectDebriefTrigger("what happened"), true);
  assert.equal(detectDebriefTrigger("summarize this session"), true);
  assert.equal(detectDebriefTrigger("debrief me"), true);
  assert.equal(detectDebriefTrigger("what is the weather"), false);
  assert.equal(detectDebriefTrigger("write a function to sort an array"), false);
});

test("buildSessionDebrief produces all required sections", () => {
  const deps = deterministicDeps();
  const session = makeSession([
    transcriptEvent("e1", "We must fix the broken deploy script now."),
    transcriptEvent("e2", "We could automate the release to save time."),
  ]);
  const insights = extractCopilotInsights(
    {
      newTranscript:
        "We must fix the broken deploy script now. We could automate the release to save time.",
      newEvents: session.events,
    },
    deps,
  );
  // General + detailed report keeps the full section set.
  const debrief = buildSessionDebrief(session, insights, deps, {
    sessionType: "general_workflow",
    reportStyle: "detailed",
  });
  const headings = debrief.sections.map((s) => s.heading);
  for (const required of [
    "What happened",
    "Key ideas",
    "Important quotes / transcript moments",
    "Actions",
    "Risks / blockers",
    "Opportunities",
    "What IIVO noticed",
    "Recommended next steps",
    "Suggested prompts / follow-ups",
    "What to save to memory",
    "Open questions",
  ]) {
    assert.ok(headings.includes(required), `missing section: ${required}`);
  }
  assert.equal(debrief.aiEnhanced, false);
  assert.ok(debrief.markdown.includes("# Session Debrief"));
});

// --- PART 8: diagnostic ---------------------------------------------------

test("Diagnostic detection flags repeated error signal", () => {
  const signal = detectStuckSignal({
    events: [
      transcriptEvent("e1", "Error: build failed with exit code 1"),
      transcriptEvent("e2", "It failed again, still broken"),
    ],
    recentCommands: [],
  });
  assert.equal(signal.stuck, true);
  assert.ok(signal.errorCount >= 2);
});

test("Diagnostic mode offers a diagnosis on repeated identical prompts", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "diagnostic" }));
  const screenEvent: GlassSessionEvent = {
    id: "s1",
    sessionId: "session-1",
    kind: "screen_capture",
    timestamp: "2026-01-01T00:00:00.000Z",
    title: "Screen capture",
  };
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([screenEvent]),
    transcript: "",
    recentCommands: ["why is this not opening", "why is this not opening", "why is this not opening"],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(result.intervention, "diagnostic mode should offer a diagnosis");
  assert.equal(result.intervention!.kind, "diagnose");
});

test("Diagnostic offer requires user approval (no auto-diagnose effect on tick)", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "diagnostic" }));
  const screenEvent: GlassSessionEvent = {
    id: "s1",
    sessionId: "session-1",
    kind: "screen_capture",
    timestamp: "2026-01-01T00:00:00.000Z",
    title: "Screen capture",
  };
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([screenEvent]),
    transcript: "",
    recentCommands: ["why is this not opening", "why is this not opening"],
    recentResponses: [],
    systemAudioActive: false,
  });
  // The offer is a card; resolving it is what triggers a diagnose effect.
  assert.ok(result.intervention);
  const resolution = controller.resolveIntervention(result.intervention!.id, "diagnose");
  assert.equal(resolution.effect, "diagnose");
});

// --- PART 7: system audio silence ----------------------------------------

test("system-audio silence warning after configured timeout", () => {
  const deps = deterministicDeps(10_000_000);
  const controller = new SessionCopilotController(deps, config({ mode: "passive", silenceTimeoutMin: 5 }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "hello there")]),
    transcript: "hello there",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: true,
    systemAudioLastSignalMs: 10_000_000 - 6 * 60_000, // 6 minutes ago
  });
  assert.equal(result.systemAudioSilenceWarning, true);
});

test("no silence warning when audio recently flowed", () => {
  const deps = deterministicDeps(10_000_000);
  const controller = new SessionCopilotController(deps, config({ mode: "passive", silenceTimeoutMin: 5 }));
  const result = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "hello there")]),
    transcript: "hello there",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: true,
    systemAudioLastSignalMs: 10_000_000 - 30_000, // 30s ago
  });
  assert.equal(result.systemAudioSilenceWarning, false);
});

// --- config parsing -------------------------------------------------------

test("config parsing clamps interval and validates fields", () => {
  assert.equal(clampCopilotInterval(100), 90);
  assert.equal(clampCopilotInterval(61), 60);
  assert.equal(clampCopilotInterval(200), 120);
  assert.equal(clampCopilotInterval("nope"), 90);

  const parsed = parseCopilotConfig({ mode: "bogus", intervalSec: 70, silenceTimeoutMin: 9999 });
  assert.equal(parsed.mode, "off");
  assert.equal(parsed.intervalSec, 60);
  assert.equal(parsed.silenceTimeoutMin, 60); // clamped to max
});

test("withCopilotConfig merges + revalidates", () => {
  const next = withCopilotConfig(DEFAULT_COPILOT_CONFIG, { mode: "coaching", intervalSec: 120 });
  assert.equal(next.mode, "coaching");
  assert.equal(next.intervalSec, 120);
});

test("shouldOfferCopilot only when off + live + system audio + not offered", () => {
  assert.equal(
    shouldOfferCopilot({ mode: "off", sessionLive: true, systemAudioActive: true, alreadyOffered: false }),
    true,
  );
  assert.equal(
    shouldOfferCopilot({ mode: "passive", sessionLive: true, systemAudioActive: true, alreadyOffered: false }),
    false,
  );
  assert.equal(
    shouldOfferCopilot({ mode: "off", sessionLive: false, systemAudioActive: true, alreadyOffered: false }),
    false,
  );
  assert.equal(
    shouldOfferCopilot({ mode: "off", sessionLive: true, systemAudioActive: true, alreadyOffered: true }),
    false,
  );
});

// --- guards: no Council, no silent Context Bridge in the copilot loop ------

const COPILOT_SHARED_FILES = [
  "shared/copilotTypes.ts",
  "shared/copilotConfig.ts",
  "shared/copilotEngine.ts",
  "shared/copilotInterruption.ts",
  "shared/copilotDiagnostic.ts",
  "shared/copilotDebrief.ts",
  "shared/copilotController.ts",
  "shared/copilotSessionType.ts",
];

test("no Council in the copilot loop", () => {
  // Block actual Council wiring (not the word "non-Council" in a comment).
  const forbidden = ["run-council", "runcouncilanalysis", "buildcouncilrunrequest", "executionmode", "iivoanalysisclient"];
  for (const rel of COPILOT_SHARED_FILES) {
    const source = readFileSync(join(SRC, rel), "utf8").toLowerCase();
    for (const token of forbidden) {
      assert.ok(!source.includes(token), `${rel} must not reference ${token}`);
    }
  }
});

test("copilot modules never call Context Bridge directly (no silent upload)", () => {
  for (const rel of COPILOT_SHARED_FILES) {
    const source = readFileSync(join(SRC, rel), "utf8");
    assert.ok(!source.includes("createContextItem"), `${rel} must not upload context`);
    assert.ok(!source.includes("createScreenshotContext"), `${rel} must not upload screenshots`);
    assert.ok(!source.includes("iivoClient"), `${rel} must not import iivoClient`);
  }
});

test("main stops the copilot loop on stop-everything and end-session", () => {
  const source = readFileSync(join(SRC, "main", "index.ts"), "utf8");
  assert.ok(source.includes("stopCopilotLoop()"), "main must define a copilot loop stop");
  // start is guarded by an active session + active mode (never on launch alone)
  assert.ok(
    source.includes("sessionIsLive() && copilotModeIsActive(copilot.getConfig().mode)"),
    "copilot loop must be guarded by a live session + active mode",
  );
});

// --- session type detection ----------------------------------------------

test("detectSessionType classifies coding via app + keywords", () => {
  assert.equal(
    detectSessionType({ appName: "Cursor", transcript: "let's refactor this function and commit" }),
    "coding_building",
  );
});

test("detectSessionType classifies video learning via window title", () => {
  assert.equal(
    detectSessionType({ appName: "Google Chrome", windowTitle: "How to invest - YouTube" }),
    "video_learning",
  );
});

test("detectSessionType classifies meeting / research / sales / strategy", () => {
  assert.equal(
    detectSessionType({ appName: "Zoom", transcript: "let's discuss the agenda and action items" }),
    "meeting_call",
  );
  assert.equal(
    detectSessionType({ transcript: "according to the study, the evidence and findings suggest" }),
    "research",
  );
  assert.equal(
    detectSessionType({ transcript: "the prospect in our pipeline needs a demo before we close the deal" }),
    "sales_review",
  );
  assert.equal(
    detectSessionType({ transcript: "our go-to-market strategy depends on pricing and market positioning" }),
    "business_strategy",
  );
});

test("detectSessionType falls back to general workflow", () => {
  assert.equal(detectSessionType({ transcript: "the weather is nice and the coffee is warm" }), "general_workflow");
});

test("resolveSessionType honors a pinned (non-auto) setting", () => {
  assert.equal(
    resolveSessionType("meeting_call", { appName: "Cursor", transcript: "refactor this function" }),
    "meeting_call",
  );
  assert.equal(
    resolveSessionType("auto", { appName: "Cursor", transcript: "refactor this function" }),
    "coding_building",
  );
});

test("controller exposes detected session type in runtime state", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "passive" }));
  controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "let's discuss the agenda and follow up next meeting")]),
    transcript: "let's discuss the agenda and follow up next meeting",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
    sourceApp: "zoom.us",
  });
  assert.equal(controller.getSessionType(), "meeting_call");
  assert.equal(controller.runtimeState(true).sessionType, "meeting_call");
});

// --- context-aware cards (AI tool vs Cursor) -----------------------------

test("cursor-prompt card says 'AI prompt' unless the app is Cursor", () => {
  const deps = deterministicDeps();
  const insight = {
    id: "i1",
    type: "cursor_prompt_candidate" as const,
    title: "Add retry logic",
    text: "Add retry logic to the fetch call.",
    source: "transcript",
    confidence: 0.8,
    importance: "high" as const,
    createdAt: "now",
    relatedEventIds: [],
    userDecision: "pending" as const,
  };
  const generic = buildInterventionForInsight(insight, deps, {
    sessionType: "coding_building",
    appName: "Google Chrome",
  });
  assert.ok(generic.buttons.some((b) => b.label === "Create AI prompt"));
  assert.ok(!generic.buttons.some((b) => b.label === "Create Cursor prompt"));

  const cursor = buildInterventionForInsight(insight, deps, {
    sessionType: "coding_building",
    appName: "Cursor",
  });
  assert.ok(cursor.buttons.some((b) => b.label === "Create Cursor prompt"));
});

test("coaching card copy adapts to session type for action insights", () => {
  const deps = deterministicDeps();
  const insight = {
    id: "i2",
    type: "action" as const,
    title: "Follow up with the lead",
    text: "We should follow up with the prospect tomorrow.",
    source: "transcript",
    confidence: 0.8,
    importance: "high" as const,
    createdAt: "now",
    relatedEventIds: [],
    userDecision: "pending" as const,
  };
  const sales = buildInterventionForInsight(insight, deps, { sessionType: "sales_review" });
  assert.ok(sales.body.includes("outreach"), `expected outreach phrasing, got: ${sales.body}`);
  const study = buildInterventionForInsight(insight, deps, { sessionType: "studying" });
  assert.ok(study.body.includes("study notes"), `expected study phrasing, got: ${study.body}`);
  // Action cards offer a "Turn into action" button across types.
  assert.ok(sales.buttons.some((b) => b.action === "turn-into-action"));
});

// --- intervention governor: dismiss backoff + accept restore -------------

test("governor backs off after 2 dismissals and restores on accept", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));

  // The controller tracks a transcript watermark and dedupes similar text, so
  // accumulate clearly-distinct high-value sentences across ticks.
  const events: GlassSessionEvent[] = [];
  let transcript = "";
  let n = 0;
  const fire = (sentence: string, gapMs: number): ReturnType<SessionCopilotController["tick"]> => {
    deps.advance(gapMs);
    events.push(transcriptEvent(`e-${++n}`, sentence));
    transcript += (transcript ? " " : "") + sentence;
    return controller.tick({
      sessionLive: true,
      session: makeSession([...events]),
      transcript,
      recentCommands: [],
      recentResponses: [],
      systemAudioActive: false,
    });
  };

  const c1 = fire("We must fix the broken deploy script now.", 90_000);
  assert.ok(c1.intervention);
  controller.resolveIntervention(c1.intervention!.id, "dismiss");
  const c2 = fire("There is a critical security risk in the payment flow.", 90_000);
  assert.ok(c2.intervention);
  controller.resolveIntervention(c2.intervention!.id, "dismiss");
  assert.equal(controller.runtimeState(true).consecutiveDismissals, 2);

  // Now the effective gap is widened (3x = 180s); a 90s gap is no longer enough.
  const c3 = fire("We need to migrate the database before the launch deadline.", 90_000);
  assert.equal(c3.intervention, null, "after 2 dismissals the governor backs off");

  // Once enough time passes a card surfaces again; accepting it restores normal frequency.
  const c4 = fire("We must rotate the leaked API keys immediately.", 200_000);
  assert.ok(c4.intervention);
  controller.resolveIntervention(c4.intervention!.id, "save");
  assert.equal(controller.runtimeState(true).consecutiveDismissals, 0, "accept resets the streak");
});

test("turn-into-action and create-prompt resolve to distinct effects", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "coaching" }));
  const tick = controller.tick({
    sessionLive: true,
    session: makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]),
    transcript: "We must fix the broken deploy script now.",
    recentCommands: [],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(tick.intervention);
  const r = controller.resolveIntervention(tick.intervention!.id, "turn-into-action");
  assert.equal(r.effect, "action_steps");
  assert.equal(r.insight!.userDecision, "accepted");
});

// --- adaptive debrief templates ------------------------------------------

test("debrief template adapts to session type", () => {
  const deps = deterministicDeps();
  const session = makeSession([
    transcriptEvent("e1", "We must fix the broken deploy script now."),
    transcriptEvent("e2", "We could automate the release to save time."),
  ]);
  const insights = extractCopilotInsights(
    {
      newTranscript:
        "We must fix the broken deploy script now. We could automate the release to save time.",
      newEvents: session.events,
    },
    deps,
  );

  const video = buildSessionDebrief(session, insights, deps, {
    sessionType: "video_learning",
    reportStyle: "detailed",
  });
  assert.ok(video.sections.some((s) => s.heading === "Key takeaways"));
  assert.ok(video.sections.some((s) => s.heading === "Action steps"));

  const meeting = buildSessionDebrief(session, insights, deps, {
    sessionType: "meeting_call",
    reportStyle: "detailed",
  });
  assert.ok(meeting.sections.some((s) => s.heading === "Meeting notes"));
  assert.ok(meeting.sections.some((s) => s.heading === "Decisions"));
});

test("concise report drops empty sections; detailed keeps them", () => {
  const deps = deterministicDeps();
  const session = makeSession([transcriptEvent("e1", "We must fix the broken deploy script now.")]);
  const insights = extractCopilotInsights(
    { newTranscript: "We must fix the broken deploy script now.", newEvents: session.events },
    deps,
  );
  const concise = buildSessionDebrief(session, insights, deps, {
    sessionType: "general_workflow",
    reportStyle: "concise",
  });
  const detailed = buildSessionDebrief(session, insights, deps, {
    sessionType: "general_workflow",
    reportStyle: "detailed",
  });
  assert.ok(
    concise.sections.length < detailed.sections.length,
    "concise should omit empty sections that detailed retains",
  );
});

// --- config parsing for new fields ---------------------------------------

test("config parses sessionType + reportStyle with safe defaults", () => {
  const parsed = parseCopilotConfig({ sessionType: "video_learning", reportStyle: "detailed" });
  assert.equal(parsed.sessionType, "video_learning");
  assert.equal(parsed.reportStyle, "detailed");

  const fallback = parseCopilotConfig({ sessionType: "bogus", reportStyle: "loud" });
  assert.equal(fallback.sessionType, "auto");
  assert.equal(fallback.reportStyle, "concise");
});

// --- session type personas + mixed signals --------------------------------

test("session type detects student, founder, sales, creator, and developer workflows", () => {
  assert.equal(
    detectSessionType({ appName: "Canvas", transcript: "study for the exam and finish homework" }),
    "studying",
  );
  assert.equal(
    detectSessionType({
      transcript: "our pricing strategy and investor roadmap for revenue growth",
    }),
    "business_strategy",
  );
  assert.equal(
    detectSessionType({
      appName: "HubSpot",
      transcript: "follow up with the prospect about objections on the cold email outreach",
    }),
    "sales_review",
  );
  assert.equal(
    detectSessionType({
      windowTitle: "Product tutorial - YouTube",
      transcript: "watching this lesson on content creation",
    }),
    "video_learning",
  );
  assert.equal(
    detectSessionType({
      appName: "Warp",
      transcript: "npm install failed with a stack trace in the repo",
    }),
    "coding_building",
  );
});

test("research workflow detected for comparison and sources", () => {
  assert.equal(
    detectSessionType({
      appName: "Perplexity",
      transcript: "compare these sources and summarize the article findings",
    }),
    "research",
  );
});

test("mixed close scores expose primary and secondary types", () => {
  const result = detectSessionTypeDetailed({
    transcript: "agenda for the meeting and refactor the deploy script",
  });
  assert.equal(result.mixed, true);
  assert.ok(result.primaryType === "meeting_call" || result.primaryType === "coding_building");
  assert.ok(result.secondaryType);
  assert.ok(result.competingTypes.length >= 2);
  assert.ok(result.confidence > 0 && result.confidence <= 1);
});

test("mixed session debrief adds cross-cutting section", () => {
  const session = makeSession([transcriptEvent("e1", "meeting and deploy discussion")]);
  const detection = detectSessionTypeDetailed({
    transcript: "agenda for the meeting and refactor the deploy script",
  });
  assert.equal(detection.mixed, true);
  const debrief = buildSessionDebrief(
    session,
    [],
    { idFactory: () => "d1", clock: () => "2026-01-01T00:00:00.000Z" },
    { sessionType: detection.primaryType, sessionTypeDetection: detection },
  );
  const headings = debrief.sections.map((s) => s.heading);
  assert.ok(headings.includes("Session blend"));
  assert.ok(headings.some((h) => h.includes("Cross-cutting") || h.includes("Apply") || h.includes("Findings")));
});

test("founder strategy and executive review signals detected", () => {
  const founder = detectSessionTypeDetailed({
    transcript: "our go-to-market strategy pricing roadmap and investor update",
  });
  assert.equal(founder.primaryType, "business_strategy");
  assert.ok(founder.confidence > 0);

  const exec = detectSessionTypeDetailed({
    appName: "Google Sheets",
    transcript: "quarterly review dashboard kpi okr board deck priorities",
  });
  assert.equal(exec.primaryType, "business_strategy");
});

test("creator content planning detected without Cursor overfit", () => {
  const result = detectSessionType({
    appName: "Notion",
    transcript: "content calendar thumbnail script draft for the next episode",
  });
  assert.notEqual(result, "coding_building");
  assert.ok(result === "business_strategy" || result === "video_learning");
});

test("diagnostic packet builds structured handoff fields", () => {
  const input = {
    events: [
      transcriptEvent("e1", "Error: permission denied for microphone"),
      transcriptEvent("e2", "Toggled permission but still failing"),
    ],
    recentCommands: ["why is mic permission still denied"],
    sourceApp: "IIVO Glass",
  };
  const signal = detectStuckSignal(input);
  const packet = buildDiagnosticPacket(input, signal);
  assert.ok(packet);
  assert.ok(packet!.observedSymptoms.length >= 1);
  assert.equal(packet!.likelyCategory, "setup_loop");
  assert.ok(packet!.suggestedQuestion.length > 10);
  assert.ok(packet!.timeline.length >= 1);
});

test("diagnose action returns direct prompt only after approval", () => {
  const deps = deterministicDeps();
  const controller = new SessionCopilotController(deps, config({ mode: "diagnostic" }));
  const tick = controller.tick({
    sessionLive: true,
    session: makeSession([]),
    transcript: "",
    recentCommands: [
      "why is this not opening",
      "why is this not opening",
      "why is this not opening",
    ],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(tick.intervention);
  assert.equal(tick.intervention!.kind, "diagnose");
  assert.equal(tick.intervention!.title, "I see a repeated issue. Diagnose it?");
  assert.ok(tick.intervention!.diagnosticPacket);
  const resolution = controller.resolveIntervention(tick.intervention!.id, "diagnose");
  assert.equal(resolution.effect, "diagnose");
  assert.ok(resolution.diagnosticPrompt?.includes("root-cause"));
  assert.ok(resolution.diagnosticPrompt?.includes("Do not invoke Council"));
});

test("dismissed diagnostics increase backoff gap", () => {
  const deps = deterministicDeps(0);
  const controller = new SessionCopilotController(deps, config({ mode: "diagnostic" }));
  const session = makeSession([
    transcriptEvent("e1", "Error: failed"),
    transcriptEvent("e2", "Error: failed again"),
  ]);
  const tick1 = controller.tick({
    sessionLive: true,
    session,
    transcript: "",
    recentCommands: ["why error", "why error"],
    recentResponses: [],
    systemAudioActive: false,
  });
  assert.ok(tick1.intervention);
  controller.resolveIntervention(tick1.intervention!.id, "dismiss");
  const state = controller.runtimeState(true);
  assert.equal(state.consecutiveDismissals, 1);
});

test("diagnostic card includes extended action buttons", () => {
  const card = buildDiagnoseOfferIntervention("test", { idFactory: () => "id-1", clock: () => new Date().toISOString() });
  assert.equal(card.title, "I see a repeated issue. Diagnose it?");
  const actions = card.buttons.map((b) => b.action);
  assert.ok(actions.includes("summarize-blocker"));
  assert.ok(actions.includes("create-fix-plan"));
  assert.ok(actions.includes("save-issue"));
});

test("panel stays compact: CopilotConfigure has no full insight list", () => {
  const source = readFileSync(join(SRC, "renderer", "panel", "CopilotConfigure.tsx"), "utf8");
  // The panel shows a count + status, never iterates the insight history.
  assert.ok(!source.includes(".insights.map"), "panel must not render the full insight list");
  assert.ok(source.includes("Session type"), "panel exposes session type selector");
  assert.ok(source.includes("Report style"), "panel exposes report style selector");
});

// --- diagnostic depth ----------------------------------------------------

test("repeated permission setup loop triggers diagnostic offer", () => {
  const signal = detectStuckSignal({
    events: [
      transcriptEvent("e1", "Microphone permission denied"),
      transcriptEvent("e2", "Toggled permission in settings but still failing"),
    ],
    recentCommands: ["why is mic permission still denied"],
  });
  assert.equal(signal.stuck, true);
  assert.equal(signal.category, "setup_loop");
});

test("system audio routing failure triggers diagnostic offer", () => {
  const signal = detectStuckSignal({
    events: [
      transcriptEvent("e1", "Selected BlackHole device but no audio signal"),
      transcriptEvent("e2", "Virtual audio routing still not working"),
    ],
    sourceApp: "IIVO Glass",
  });
  assert.equal(signal.stuck, true);
  assert.ok(signal.category === "setup_loop" || signal.category === "repeated_error");
});

test("contradiction phrase triggers diagnostic signal", () => {
  const signal = detectStuckSignal({
    events: [transcriptEvent("e1", "That contradicts what you said earlier — still failing")],
    recentCommands: [],
  });
  assert.equal(signal.stuck, true);
  assert.equal(signal.category, "contradiction");
});

test("normal repeated neutral topic is not diagnostic spam candidate", () => {
  assert.equal(
    isLikelyDiagnosticSpam({
      events: [transcriptEvent("e1", "The weather is nice today")],
      recentCommands: ["what is the weather", "what is the weather again"],
    }),
    true,
  );
});

// --- end diagnostic depth ---

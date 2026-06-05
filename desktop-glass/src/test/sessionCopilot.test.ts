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
import { detectStuckSignal } from "../shared/copilotDiagnostic.ts";
import { detectDebriefTrigger, buildSessionDebrief } from "../shared/copilotDebrief.ts";
import { shouldShowOverlayCard } from "../shared/copilotInterruption.ts";
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
  const debrief = buildSessionDebrief(session, insights, deps);
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
    "Cursor prompts / follow-up prompts",
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

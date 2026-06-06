import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LISTEN_MODE_PERSONA_NAME,
  buildListenProactiveThought,
  buildListenInterruptPersonaGuidance,
  buildListenReportPersonaGuidance,
  getListenModePersonaCore,
  getListenModePersonaHardRules,
  gradeListenThoughtCopy,
} from "../shared/listenModePersona.ts";
import { isGroundedListenInsight } from "../shared/listenInsightQuality.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";

function sampleMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const anchor = "Distribution beats speed for early founders building in public.";
  const now = new Date().toISOString();
  const thought = buildListenProactiveThought({
    moment: { type: "key_idea", transcriptAnchors: [anchor], summary: anchor },
  }).suggestedThought;
  return {
    id: "m1",
    type: "key_idea",
    summary: anchor,
    transcriptAnchors: [anchor, `${anchor} Repeated.`],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.9,
    importance: "high",
    suggestedThought: thought,
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    status: "ready",
    ...overrides,
  };
}

test("persona name and core contract", () => {
  assert.equal(LISTEN_MODE_PERSONA_NAME, "IIVO Listen Mode Thought Partner");
  const core = getListenModePersonaCore();
  assert.match(core, /Thought Partner/);
  assert.match(core, /stay quiet/i);
  assert.match(core, /media or workflow audio/i);
  assert.doesNotMatch(core, /YouTube Mode/i);
});

test("hard rules cover face ID, mic, and AI tool personalization", () => {
  const rules = getListenModePersonaHardRules();
  const joined = rules.join(" ");
  assert.match(joined, /facial/i);
  assert.match(joined, /microphone/i);
  assert.match(joined, /your AI tool/i);
  assert.match(joined, /action/i);
});

test("buildListenProactiveThought returns grounded thought and reason", () => {
  const out = buildListenProactiveThought({
    moment: {
      type: "key_idea",
      transcriptAnchors: ["Distribution beats speed for early founders building in public."],
      summary: "Distribution beats speed.",
    },
  });
  assert.ok(out.suggestedThought.length > 40);
  assert.ok(out.reasonSelected.length > 20);
  assert.match(out.suggestedThought, /speaker/i);
  assert.doesNotMatch(out.suggestedThought, /before the video moves on/i);
});

test("proactive thought uses channel from mediaContext", () => {
  const out = buildListenProactiveThought({
    moment: {
      type: "warning",
      transcriptAnchors: ["Trust matters more than raw feature velocity in early markets."],
      summary: "Trust matters.",
    },
    ctx: {
      mediaContext: {
        sourceType: "youtube",
        channelOrSource: "Silicon Valley Girl",
        capturedAt: new Date().toISOString(),
        confidence: "high",
      },
    },
  });
  assert.match(out.suggestedThought, /Silicon Valley Girl/);
});

test("no your AI tool without userGoalContext in proactive copy", () => {
  const out = buildListenProactiveThought({
    moment: {
      type: "implementation_idea",
      transcriptAnchors: ["Use this workflow for your AI tool when prototyping features."],
      summary: "AI tool workflow.",
    },
  });
  assert.doesNotMatch(out.suggestedThought, /\byour AI tool\b/i);
});

test("allows personalization when userGoalContext mentions AI tool", () => {
  const text =
    "This could help for your AI tool later when you are prototyping features in Cursor.";
  assert.equal(gradeListenThoughtCopy(text, "building an AI tool with Cursor"), "strong");
});

test("gradeListenThoughtCopy rejects shallow risk phrase", () => {
  assert.equal(gradeListenThoughtCopy("That sounds like a risk! Should we take action?"), "weak");
});

test("grounded moment passes insight quality gates with persona templates", () => {
  assert.equal(isGroundedListenInsight(sampleMoment()), true);
});

test("interrupt persona includes intent and thin-context handling", () => {
  const guidance = buildListenInterruptPersonaGuidance({
    intent: "ask_thoughts",
    currentMoment: {
      momentContextStatus: "thin",
      recentMomentTranscript: "",
      savedMomentsSilently: [],
    },
  });
  assert.match(guidance, /Thought Partner/);
  assert.match(guidance, /Do not invent/i);
  assert.match(guidance, /building context from the audio/i);
  assert.match(guidance, /ask_thoughts/);
});

test("report persona guidance is source-agnostic", () => {
  const guidance = buildListenReportPersonaGuidance();
  assert.match(guidance, /transcript/i);
  assert.match(guidance, /source-agnostic/i);
  assert.doesNotMatch(guidance, /YouTube/i);
});

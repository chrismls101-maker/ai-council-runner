import { test } from "node:test";
import assert from "node:assert/strict";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import {
  computeMomentMaturity,
  isMomentMatureForSurface,
  withMomentMaturity,
} from "../shared/listenMomentMaturity.ts";
import { shouldSurfaceListenMoment } from "../shared/listenMomentTiming.ts";
import type { ListenSurfaceContext } from "../shared/listenMomentTypes.ts";

function baseMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const now = new Date().toISOString();
  return {
    id: "m1",
    type: "key_idea",
    summary: "Distribution insight",
    transcriptAnchors: ["One interesting sentence about distribution."],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.85,
    importance: "high",
    suggestedThought: "Distribution may matter more than speed.",
    status: "ready",
    ...overrides,
  };
}

function surfaceContext(overrides: Partial<ListenSurfaceContext> = {}): ListenSurfaceContext {
  return {
    attentionLevel: "balanced",
    nowMs: Date.now(),
    recentTranscriptChars: 300,
    recentSurfacedTexts: [],
    userReceivingAnswer: false,
    muteSuggestions: false,
    surfacesInLast10Min: 0,
    listenStartedMs: Date.now() - 130_000,
    listenWarmupMs: 120_000,
    ...overrides,
  };
}

test("one interesting sentence is not enough for action card", () => {
  const nowMs = Date.now();
  const moment = withMomentMaturity(baseMoment(), nowMs, "content");
  assert.equal(moment.isStillDeveloping, true);
  assert.equal(isMomentMatureForSurface(moment), false);
  const decision = shouldSurfaceListenMoment(moment, surfaceContext());
  assert.notEqual(decision.decision, "surface_now");
});

test("enough anchors + stable topic can become ready", () => {
  const nowMs = Date.now();
  const started = new Date(nowMs - 50_000).toISOString();
  const moment = withMomentMaturity(
    baseMoment({
      firstSeenAt: started,
      lastUpdatedAt: new Date(nowMs).toISOString(),
      transcriptAnchors: [
        "Distribution may matter more than software speed for founders with limited runway.",
        "The speaker repeats that go-to-market beats pure product polish early on.",
        "Founders should validate distribution channels before scaling engineering headcount.",
      ],
      status: "ready",
    }),
    nowMs,
    "content",
  );
  assert.equal(moment.isActionableNow, true);
  assert.equal(isMomentMatureForSurface(moment), true);
  const decision = shouldSurfaceListenMoment(
    moment,
    surfaceContext({ nowMs, attentionLevel: "active", liveThoughtsEnabled: true }),
  );
  assert.equal(decision.decision, "surface_now");
});

test("still-developing idea waits", () => {
  const nowMs = Date.now();
  const m = computeMomentMaturity(baseMoment({ status: "developing" }), nowMs, "content");
  assert.equal(m.isStillDeveloping, true);
});

test("ad segment reduces maturity score", () => {
  const nowMs = Date.now();
  const content = computeMomentMaturity(
    baseMoment({
      transcriptAnchors: ["x".repeat(90)],
      firstSeenAt: new Date(nowMs - 60_000).toISOString(),
    }),
    nowMs,
    "content",
  );
  const ad = computeMomentMaturity(
    baseMoment({
      transcriptAnchors: ["x".repeat(90)],
      firstSeenAt: new Date(nowMs - 60_000).toISOString(),
    }),
    nowMs,
    "ad",
  );
  assert.ok(content.maturityScore > ad.maturityScore);
});

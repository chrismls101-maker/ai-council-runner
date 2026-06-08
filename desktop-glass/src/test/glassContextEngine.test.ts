import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGlassContextInteraction,
  categorizeGlassContextTopic,
  defaultGlassContextProfile,
  extractGlassContextKeywords,
  GLASS_CONTEXT_MAX_INTERACTIONS,
  GLASS_CONTEXT_SEED_INTERACTIONS,
  GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL,
  parseGlassContextProfile,
  recordGlassContextInteraction,
  resolveGlassUserContext,
} from "../shared/glassContextEngine.ts";

test("categorizeGlassContextTopic detects common patterns", () => {
  assert.equal(categorizeGlassContextTopic("Should I take this job offer?"), "decision");
  assert.equal(categorizeGlassContextTopic("Summarize my meeting notes"), "meeting");
  assert.equal(categorizeGlassContextTopic("Rewrite this email more direct"), "writing");
  assert.equal(categorizeGlassContextTopic("Explain how transformers work"), "research");
  assert.equal(categorizeGlassContextTopic("Translate this to Spanish"), "translation");
  assert.equal(categorizeGlassContextTopic("Debug this TypeScript function"), "coding");
});

test("recordGlassContextInteraction caps log and rebuilds summary every 5", () => {
  let profile = defaultGlassContextProfile(new Date("2026-06-01T00:00:00.000Z"));

  for (let i = 0; i < GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL; i += 1) {
    profile = recordGlassContextInteraction(
      profile,
      { question: `Debug error number ${i} in api handler`, id: `id-${i}` },
      null,
      new Date(`2026-06-01T00:0${i}:00.000Z`),
    );
  }

  assert.equal(profile.interactions.length, GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL);
  assert.equal(profile.totalInteractionsRecorded, GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL);
  assert.ok(profile.summary);
  assert.equal(profile.summary?.frequentTopics[0]?.category, "coding");
});

test("rolling log keeps only last 50 interactions", () => {
  let profile = defaultGlassContextProfile();

  for (let i = 0; i < GLASS_CONTEXT_MAX_INTERACTIONS + 5; i += 1) {
    profile = recordGlassContextInteraction(profile, {
      question: `Question ${i} about research topic`,
      id: `q-${i}`,
    });
  }

  assert.equal(profile.interactions.length, GLASS_CONTEXT_MAX_INTERACTIONS);
  assert.equal(profile.totalInteractionsRecorded, GLASS_CONTEXT_MAX_INTERACTIONS + 5);
  assert.equal(profile.interactions[0]?.question, "Question 5 about research topic");
});

test("resolveGlassUserContext uses onboarding seed for first 10 interactions", () => {
  const profile = recordGlassContextInteraction(defaultGlassContextProfile(), {
    question: "What should I focus on today?",
  });

  const seed = {
    name: "Alex",
    usualWork: "Product design",
    currentFocus: "Launch prep",
  };

  const context = resolveGlassUserContext(profile, seed);
  assert.match(context ?? "", /Alex/);
  assert.match(context ?? "", /Product design/);
  assert.match(context ?? "", /Launch prep/);
  assert.match(context ?? "", /calibration/);
});

test("resolveGlassUserContext switches to derived summary after seed window", () => {
  let profile = defaultGlassContextProfile();
  const seed = {
    name: "Alex",
    usualWork: "Product design",
    currentFocus: "Launch prep",
  };

  for (let i = 0; i < GLASS_CONTEXT_SEED_INTERACTIONS; i += 1) {
    profile = recordGlassContextInteraction(profile, {
      question: "Debug typescript api handler error",
      id: `seed-${i}`,
    });
  }

  const context = resolveGlassUserContext(profile, seed);
  assert.match(context ?? "", /inferred from recent Glass interactions/);
  assert.doesNotMatch(context ?? "", /Launch prep/);
  assert.match(context ?? "", /coding/);
});

test("resolveGlassUserContext returns undefined for brand-new user", () => {
  assert.equal(resolveGlassUserContext(defaultGlassContextProfile(), null), undefined);
});

test("parseGlassContextProfile tolerates corrupt files", () => {
  const parsed = parseGlassContextProfile({ interactions: [{ question: "Hello research world" }] });
  assert.equal(parsed.interactions.length, 1);
  assert.equal(parsed.version, 1);
});

test("buildGlassContextInteraction extracts keywords", () => {
  const item = buildGlassContextInteraction({ question: "Explain quantum entanglement simply please" });
  assert.ok(item.keywords.includes("quantum"));
  assert.ok(item.keywords.includes("entanglement"));
  assert.ok(extractGlassContextKeywords("the and for what").length === 0);
});

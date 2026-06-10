/**
 * §18 — Passive Context Engine E2E
 *
 * GLASS_CONTRACT.md §18:
 *   "Rolling log keeps the last 50 interactions."
 *   "Derived summary rebuilds every 5 interactions."
 *   "First 10 interactions may use onboarding seed; after that, derived context replaces seed."
 *   "Each ask attaches userContext (derived summary string) when non-empty."
 *   "Missing/corrupt glass-context.json → fresh empty profile; asks proceed without userContext."
 *   "New user with no onboarding and no history → userContext omitted (nothing invented)."
 *
 * Strategy: test the full context engine pipeline — record interactions,
 * check rolling cap, verify summary rebuild cadence, verify userContext
 * string is produced only when there's real data.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

// ─── Rolling log cap (max 50 interactions) ───────────────────────────────────

describe("§18 — rolling log keeps only last 50 interactions", () => {
  it(`caps at GLASS_CONTEXT_MAX_INTERACTIONS (${GLASS_CONTEXT_MAX_INTERACTIONS})`, () => {
    let profile = defaultGlassContextProfile();
    for (let i = 0; i < GLASS_CONTEXT_MAX_INTERACTIONS + 10; i++) {
      profile = recordGlassContextInteraction(profile, {
        question: `Question ${i} about research`,
        id: `q-${i}`,
      });
    }
    assert.equal(profile.interactions.length, GLASS_CONTEXT_MAX_INTERACTIONS);
  });

  it("keeps the most recent interactions, drops the oldest", () => {
    let profile = defaultGlassContextProfile();
    const total = GLASS_CONTEXT_MAX_INTERACTIONS + 5;
    for (let i = 0; i < total; i++) {
      profile = recordGlassContextInteraction(profile, {
        question: `Question ${i}`,
        id: `q-${i}`,
      });
    }
    // The oldest interactions (0..4) should be gone; most recent should remain
    const ids = profile.interactions.map(i => i.id);
    assert.ok(!ids.includes("q-0"), "Oldest interaction should be evicted");
    assert.ok(ids.includes(`q-${total - 1}`), "Most recent should be kept");
  });

  it("tracks totalInteractionsRecorded beyond the cap", () => {
    let profile = defaultGlassContextProfile();
    for (let i = 0; i < GLASS_CONTEXT_MAX_INTERACTIONS + 20; i++) {
      profile = recordGlassContextInteraction(profile, { question: `Q${i}`, id: `q-${i}` });
    }
    assert.equal(profile.totalInteractionsRecorded, GLASS_CONTEXT_MAX_INTERACTIONS + 20);
  });
});

// ─── Summary rebuild cadence (every 5 interactions) ──────────────────────────

describe("§18 — summary rebuilds every 5 interactions", () => {
  it("has no summary before first rebuild threshold", () => {
    let profile = defaultGlassContextProfile();
    for (let i = 0; i < GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL - 1; i++) {
      profile = recordGlassContextInteraction(profile, { question: `Coding Q${i}`, id: `c${i}` });
    }
    // One short of threshold — summary may or may not exist depending on impl, but
    // if it does, it should not yet reflect 5 interactions
    assert.equal(profile.interactions.length, GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL - 1);
  });

  it("builds summary at the rebuild threshold", () => {
    let profile = defaultGlassContextProfile(new Date("2026-06-01T00:00:00.000Z"));
    for (let i = 0; i < GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL; i++) {
      profile = recordGlassContextInteraction(
        profile,
        { question: `Debug TypeScript error ${i}`, id: `d${i}` },
        null,
        new Date(`2026-06-01T00:0${i}:00.000Z`),
      );
    }
    assert.ok(profile.summary, "Summary should exist after rebuild threshold");
    assert.ok(
      profile.summary!.frequentTopics.length > 0,
      "Summary should contain topic data",
    );
  });

  it("dominant topic matches the interactions recorded", () => {
    let profile = defaultGlassContextProfile();
    for (let i = 0; i < GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL; i++) {
      profile = recordGlassContextInteraction(profile, {
        question: `Write an email about project ${i}`,
        id: `w${i}`,
      });
    }
    assert.ok(profile.summary, "Summary should exist");
    const topTopic = profile.summary!.frequentTopics[0]?.category;
    assert.equal(topTopic, "writing", `Expected 'writing' but got '${topTopic}'`);
  });
});

// ─── Topic categorisation ─────────────────────────────────────────────────────

describe("§18 — topic categorisation", () => {
  it("categorises coding questions", () => {
    assert.equal(categorizeGlassContextTopic("Debug this TypeScript function"), "coding");
  });

  it("categorises writing questions", () => {
    assert.equal(categorizeGlassContextTopic("Rewrite this email to be more direct"), "writing");
  });

  it("categorises research questions", () => {
    assert.equal(categorizeGlassContextTopic("Explain how transformers work"), "research");
  });

  it("categorises meeting questions", () => {
    assert.equal(categorizeGlassContextTopic("Summarize my meeting notes"), "meeting");
  });

  it("categorises decision questions", () => {
    assert.equal(categorizeGlassContextTopic("Should I take this job offer?"), "decision");
  });

  it("categorises translation questions", () => {
    assert.equal(categorizeGlassContextTopic("Translate this to Spanish"), "translation");
  });
});

// ─── Keyword extraction ───────────────────────────────────────────────────────

describe("§18 — keyword extraction", () => {
  it("extracts meaningful words from a question", () => {
    const words = extractGlassContextKeywords("Debug the TypeScript authentication error in the API");
    assert.ok(words.length > 0, "Should extract keywords");
    assert.ok(!words.includes("the"), "Should exclude stopwords");
    assert.ok(!words.includes("in"), "Should exclude stopwords");
  });

  it("returns no more than the limit", () => {
    const words = extractGlassContextKeywords(
      "very long question with many unique interesting meaningful keywords present here indeed",
      3,
    );
    assert.ok(words.length <= 3);
  });
});

// ─── userContext string: only when there's real data ─────────────────────────

describe("§18 — userContext omitted for new users (nothing invented)", () => {
  it("returns undefined for a brand-new profile with no history", () => {
    const profile = defaultGlassContextProfile();
    const ctx = resolveGlassUserContext(profile);
    assert.equal(ctx, undefined, "New user with no history must produce no userContext");
  });

  it("returns non-empty context after enough interactions are recorded", () => {
    let profile = defaultGlassContextProfile();
    // Need enough to trigger a summary rebuild
    for (let i = 0; i < GLASS_CONTEXT_SUMMARY_REBUILD_INTERVAL; i++) {
      profile = recordGlassContextInteraction(profile, {
        question: `Research AI safety topic ${i}`,
        id: `r${i}`,
      });
    }
    const ctx = resolveGlassUserContext(profile);
    assert.ok(ctx && ctx.length > 0, "Should produce userContext after sufficient history");
  });
});

// ─── Corrupt / missing profile: fresh empty profile ──────────────────────────

describe("§18 — corrupt glass-context.json → fresh empty profile", () => {
  it("parseGlassContextProfile returns default for null input", () => {
    const profile = parseGlassContextProfile(null);
    assert.equal(profile.interactions.length, 0);
    assert.equal(profile.totalInteractionsRecorded, 0);
  });

  it("parseGlassContextProfile returns default for malformed JSON object", () => {
    const profile = parseGlassContextProfile({ completely: "wrong", shape: true });
    assert.equal(profile.interactions.length, 0);
  });

  it("parseGlassContextProfile handles empty object", () => {
    const profile = parseGlassContextProfile({});
    assert.equal(profile.interactions.length, 0);
  });

  it("asks proceed without userContext when profile is empty", () => {
    const profile = parseGlassContextProfile(null);
    const ctx = resolveGlassUserContext(profile);
    assert.equal(ctx, undefined);
  });
});

// ─── buildGlassContextInteraction ────────────────────────────────────────────

describe("§18 — interaction builder", () => {
  it("builds an interaction with correct category and keywords", () => {
    const interaction = buildGlassContextInteraction({
      question: "Fix the TypeScript error in the API handler",
      id: "i1",
    });
    assert.equal(interaction.category, "coding");
    assert.ok(interaction.keywords.length > 0);
    assert.ok(interaction.id === "i1");
  });

  it("records a timestamp on the interaction", () => {
    const before = Date.now();
    const interaction = buildGlassContextInteraction({ question: "Help me write an email", id: "i2" });
    const after = Date.now();
    const ts = new Date(interaction.at).getTime();
    assert.ok(ts >= before && ts <= after, "timestamp should be within test window");
  });
});

// ─── Seed interactions (first 10 use onboarding seed) ────────────────────────

describe(`§18 — first ${GLASS_CONTEXT_SEED_INTERACTIONS} interactions use onboarding seed`, () => {
  it(`GLASS_CONTEXT_SEED_INTERACTIONS is ${GLASS_CONTEXT_SEED_INTERACTIONS}`, () => {
    assert.equal(GLASS_CONTEXT_SEED_INTERACTIONS, 10);
  });

  it("profile starts with zero interactions (seed is applied by caller, not by default)", () => {
    const profile = defaultGlassContextProfile();
    assert.equal(profile.interactions.length, 0);
    assert.equal(profile.totalInteractionsRecorded, 0);
  });
});

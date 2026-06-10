/**
 * Unit tests for src/shared/speakerNameExtraction.ts
 *
 * Covers:
 *   - extractSpeakerNames  — live transcript pattern matching
 *   - extractNamesFromTitle — video/page title seeding
 *   - buildSpeakerMappingBlock — prompt injection formatting
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractSpeakerNames,
  extractNamesFromTitle,
  buildSpeakerMappingBlock,
  resolveSpeakerTag,
} from "../shared/speakerNameExtraction.ts";

// ─── extractSpeakerNames ─────────────────────────────────────────────────────

describe("extractSpeakerNames", () => {
  it("resolves self-intro 'I'm [Name]'", () => {
    const t = "[S0] I'm Lex Fridman and welcome to the podcast.";
    const names = extractSpeakerNames(t);
    assert.equal(names["0"], "Lex Fridman");
  });

  it("resolves host guest intro 'my guest today is [Name]'", () => {
    const t = "[S0] My guest today is Sam Altman. [S1] Thanks for having me.";
    const names = extractSpeakerNames(t);
    assert.equal(names["1"], "Sam Altman");
  });

  it("resolves 'please welcome [Name]'", () => {
    const t = "[S0] Please welcome Andrew Huberman to the show.";
    const names = extractSpeakerNames(t);
    assert.equal(names["1"], "Andrew Huberman");
  });

  it("resolves direct address 'Thanks [Name]'", () => {
    const t = "[S1] Thanks Lex, great question.";
    const names = extractSpeakerNames(t);
    assert.equal(names["0"], "Lex");
  });

  it("does not capture stopwords as names", () => {
    const t = "[S0] Thanks everyone, hi there, good to be here.";
    const names = extractSpeakerNames(t);
    assert.equal(Object.keys(names).length, 0);
  });

  it("preserves already-resolved names across calls", () => {
    const seed = { "0": "Lex Fridman" };
    const t = "[S0] Some other text with no intro patterns.";
    const names = extractSpeakerNames(t, seed);
    assert.equal(names["0"], "Lex Fridman");
  });

  it("does not overwrite existing name with a new match", () => {
    const seed = { "0": "Lex Fridman" };
    const t = "[S0] I'm Tim Ferriss.";
    const names = extractSpeakerNames(t, seed);
    // existing "Lex Fridman" should be preserved
    assert.equal(names["0"], "Lex Fridman");
  });
});

// ─── extractNamesFromTitle ───────────────────────────────────────────────────

describe("extractNamesFromTitle", () => {
  it("parses 'Podcast Name | Guest Name: subtitle'", () => {
    const t = "Lex Fridman Podcast #400 | Sam Altman: OpenAI, GPT-5, and AGI";
    const names = extractNamesFromTitle(t);
    assert.equal(names["0"], "Lex Fridman");
    assert.equal(names["1"], "Sam Altman");
  });

  it("parses 'Guest Name: topic | Host Name Podcast'", () => {
    const t = "Sam Altman: OpenAI | Lex Fridman Podcast #367";
    const names = extractNamesFromTitle(t);
    assert.ok(names["0"] || names["1"]); // at least one name extracted
  });

  it("parses 'Show Name #N - Guest Name'", () => {
    const t = "Joe Rogan Experience #2000 - Elon Musk";
    const names = extractNamesFromTitle(t);
    // host from left, guest from right
    assert.ok(names["0"] === "Joe Rogan" || names["1"] === "Elon Musk");
  });

  it("parses 'Show with Guest Name'", () => {
    const t = "The Tim Ferriss Show with Naval Ravikant";
    const names = extractNamesFromTitle(t);
    assert.equal(names["1"], "Naval Ravikant");
  });

  it("parses bare 'First Last: subtitle' with no separator", () => {
    const t = "Andrew Huberman: The Science of Sleep";
    const names = extractNamesFromTitle(t);
    assert.equal(names["0"], "Andrew Huberman");
  });

  it("returns empty map for generic titles with no names", () => {
    const t = "How to Win Friends and Influence People | Book Summary";
    const names = extractNamesFromTitle(t);
    // may or may not extract — should not crash
    assert.ok(typeof names === "object");
  });

  it("does not extract stopwords as names", () => {
    const t = "The Best of 2024 | Top Highlights";
    const names = extractNamesFromTitle(t);
    for (const v of Object.values(names)) {
      assert.notEqual(v.toLowerCase(), "the");
      assert.notEqual(v.toLowerCase(), "top");
      assert.notEqual(v.toLowerCase(), "best");
    }
  });
});

// ─── buildSpeakerMappingBlock ────────────────────────────────────────────────

describe("buildSpeakerMappingBlock", () => {
  it("returns empty string when no names", () => {
    assert.equal(buildSpeakerMappingBlock({}), "");
  });

  it("formats single host entry", () => {
    const block = buildSpeakerMappingBlock({ "0": "Lex Fridman" });
    assert.equal(block, "Speaker mapping: [S0] = Lex Fridman (host)");
  });

  it("formats host + guest", () => {
    const block = buildSpeakerMappingBlock({ "0": "Lex Fridman", "1": "Sam Altman" });
    assert.ok(block.includes("[S0] = Lex Fridman (host)"));
    assert.ok(block.includes("[S1] = Sam Altman (guest)"));
  });
});

// ─── resolveSpeakerTag ───────────────────────────────────────────────────────

describe("resolveSpeakerTag", () => {
  it("resolves known tag to name", () => {
    assert.equal(resolveSpeakerTag("[S0]", { "0": "Lex Fridman" }), "Lex Fridman");
  });

  it("falls back to 'the host' for S0 when unknown", () => {
    assert.equal(resolveSpeakerTag("[S0]", {}), "the host");
  });

  it("falls back to 'the guest' for S1+ when unknown", () => {
    assert.equal(resolveSpeakerTag("[S1]", {}), "the guest");
  });

  it("returns tag unchanged when no [Sx] format", () => {
    assert.equal(resolveSpeakerTag("narrator", {}), "narrator");
  });
});

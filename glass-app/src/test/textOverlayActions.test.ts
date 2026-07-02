/**
 * Unit tests for Glass this action helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMemoryFactFromTextOverlayCard,
  buildTextOverlayOpenInGlassPrompt,
  copyPayloadForAction,
  enrichTextOverlayActions,
  promptForTextOverlayAction,
} from "../shared/textOverlayActions.ts";
import type { TextOverlayCard } from "../shared/textOverlayTypes.ts";

const sampleCard: TextOverlayCard = {
  id: "test",
  rawText: "indemnification clause",
  logicalUnit: "The party shall indemnify and hold harmless...",
  contentType: "legal_contract",
  level1: "This shifts liability to you if something goes wrong.",
  level2: null,
  verificationConfidence: "unverifiable",
  level3: null,
  level4: [],
  triggerSource: "clipboard",
  cursorX: 0,
  cursorY: 0,
  createdAt: 0,
};

describe("textOverlayActions", () => {
  it("builds open-in-glass prompt with raw text and summary", () => {
    const prompt = buildTextOverlayOpenInGlassPrompt(sampleCard);
    assert.match(prompt, /indemnify/);
    assert.match(prompt, /shifts liability/);
  });

  it("enriches copy actions with level1 payload", () => {
    const enriched = enrichTextOverlayActions(
      [{ label: "Copy translation", op: "copy_to_clipboard" }],
      { rawText: "bonjour", level1: "Hello in French", contentType: "foreign_language" },
    );
    assert.equal(enriched[0].payload, "Hello in French");
  });

  it("copy payload falls back to raw text for commands", () => {
    const text = copyPayloadForAction(
      { label: "Copy command", op: "copy_to_clipboard" },
      { rawText: "npm install", level1: "Install packages", contentType: "technical_doc" },
    );
    assert.equal(text, "npm install");
  });

  it("builds memory fact with stable key prefix", () => {
    const fact = buildMemoryFactFromTextOverlayCard(sampleCard, "save_to_memory");
    assert.match(fact.key, /^saved_text:legal_contract:/);
    assert.match(fact.value, /indemnification/);
  });

  it("returns draft prompt for legal content", () => {
    const prompt = promptForTextOverlayAction(sampleCard, "draft_reply");
    assert.match(prompt ?? "", /redline|counter-language/i);
  });
});

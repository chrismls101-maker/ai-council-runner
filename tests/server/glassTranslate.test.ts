import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, buildUserPrompt } from "../../dist/server/glass/glassTranslate.js";

test("previous captions included in translate user prompt", () => {
  const user = buildUserPrompt({
    text: "Cómo estás?",
    targetLanguage: "en",
    previousCaptions: [{ original: "Buenos días", translated: "Good morning" }],
  });
  assert.match(user, /Good morning/);
  assert.match(user, /Buenos días/);
});

test("glossary term preserved in system prompt", () => {
  const system = buildSystemPrompt({
    text: "Welcome to IIVO Glass",
    targetLanguage: "es",
    glossaryTerms: [{ source: "IIVO", preserve: true }],
  });
  assert.match(system, /Preserve "IIVO"/);
  assert.match(system, /IIVO/);
});

test("conversation mode asks for natural conversational translation", () => {
  const system = buildSystemPrompt({
    text: "hey what's up",
    targetLanguage: "es",
    mode: "conversation",
  });
  assert.match(system, /casual/i);
  assert.match(system, /Do not over-formalize/i);
});

test("media mode asks for concise caption translation", () => {
  const system = buildSystemPrompt({
    text: "In this module we cover the basics.",
    targetLanguage: "es",
    mode: "media",
  });
  assert.match(system, /concise/i);
});

test("target language respected in system prompt", () => {
  const system = buildSystemPrompt({ text: "Hello", targetLanguage: "pt" });
  assert.match(system, /to pt/);
});

test("already-target-language handled via response normalization contract", () => {
  const system = buildSystemPrompt({ text: "Hello world", targetLanguage: "en", sourceLanguage: "en" });
  assert.match(system, /Return ONLY the translated text/);
});

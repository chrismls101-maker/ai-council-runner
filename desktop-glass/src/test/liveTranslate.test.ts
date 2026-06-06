import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCaptionChunk,
  formatCaptionForOverlay,
  initialLiveTranslateCaptions,
  isDuplicateCaption,
} from "../shared/liveTranslateCaptions.ts";
import {
  detectLanguageHeuristic,
  shouldAttemptTranslation,
} from "../shared/liveTranslateEngine.ts";
import {
  DEFAULT_LIVE_TRANSLATE_CONFIG,
  initialLiveTranslateRuntime,
  shouldPersistTranslateChunk,
  startLiveTranslate,
  stopLiveTranslate,
  translateAllowsMicrophone,
  translateRequiresSystemAudio,
} from "../shared/liveTranslateState.ts";
import { GLASS_MODE_PRESETS, GLASS_MODE_ORDER } from "../shared/glassModePresets.ts";

test("Translate mode preset exists with expected copy", () => {
  assert.ok(GLASS_MODE_ORDER.includes("translate"));
  assert.equal(GLASS_MODE_PRESETS.translate.label, "Translate");
  assert.match(GLASS_MODE_PRESETS.translate.description, /Live captions/i);
});

test("default config uses auto source and private no-save friendly defaults", () => {
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.sourceLanguage, "auto");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.displayMode, "translation_only");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.captionPosition, "bottom_center");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.saveMode, "private_no_save");
});

test("private_no_save does not persist transcript", () => {
  assert.equal(shouldPersistTranslateChunk(DEFAULT_LIVE_TRANSLATE_CONFIG), false);
  assert.equal(
    shouldPersistTranslateChunk({ ...DEFAULT_LIVE_TRANSLATE_CONFIG, saveMode: "save_transcript" }),
    true,
  );
});

test("mic only after explicit enable", () => {
  const cfg = { ...DEFAULT_LIVE_TRANSLATE_CONFIG, source: "microphone" as const };
  assert.equal(translateAllowsMicrophone(cfg, false), false);
  assert.equal(translateAllowsMicrophone(cfg, true), true);
});

test("system audio translation keeps mic off path", () => {
  const cfg = { ...DEFAULT_LIVE_TRANSLATE_CONFIG, source: "system_audio" as const };
  assert.equal(translateRequiresSystemAudio(cfg), true);
  assert.equal(translateAllowsMicrophone(cfg, true), false);
});

test("interim caption updates in place then final replaces", () => {
  let caps = initialLiveTranslateCaptions(DEFAULT_LIVE_TRANSLATE_CONFIG);
  caps = applyCaptionChunk(caps, {
    original: "Necesito revisar",
    translated: "I need to review",
    interim: true,
    id: "a",
  });
  assert.equal(caps.current?.interim, true);
  caps = applyCaptionChunk(caps, {
    original: "Necesito revisar eso mañana.",
    translated: "I need to review that tomorrow.",
    interim: false,
    id: "a",
  });
  assert.equal(caps.current?.interim, false);
  assert.equal(caps.lines.length, 1);
});

test("duplicate captions dedupe", () => {
  let caps = initialLiveTranslateCaptions(DEFAULT_LIVE_TRANSLATE_CONFIG);
  caps = applyCaptionChunk(caps, {
    original: "Hola",
    translated: "Hello",
    id: "1",
  });
  assert.equal(isDuplicateCaption(caps, "Hola", "Hello"), true);
  const before = caps.lines.length;
  caps = applyCaptionChunk(caps, { original: "Hola", translated: "Hello", id: "2" });
  assert.equal(caps.lines.length, before);
});

test("original + translation display mode", () => {
  const formatted = formatCaptionForOverlay(
    {
      id: "1",
      original: "Necesito revisar eso mañana.",
      translated: "I need to review that tomorrow.",
      interim: false,
      updatedAt: new Date().toISOString(),
    },
    "original_and_translation",
    { original: "Spanish", translated: "English" },
  );
  assert.match(formatted!.primary, /English:/);
  assert.match(formatted!.secondary!, /Spanish:/);
});

test("start and stop translate runtime", () => {
  let rt = initialLiveTranslateRuntime();
  rt = startLiveTranslate(rt, { targetLanguage: "es" });
  assert.equal(rt.active, true);
  assert.equal(rt.config.enabled, true);
  rt = stopLiveTranslate(rt);
  assert.equal(rt.active, false);
  assert.equal(rt.config.enabled, false);
});

test("shouldAttemptTranslation avoids tiny partial fragments", () => {
  assert.equal(shouldAttemptTranslation("hola", true), false);
  assert.equal(shouldAttemptTranslation("This is a complete sentence.", false), true);
});

test("detectLanguageHeuristic recognizes Spanish hints", () => {
  const es = detectLanguageHeuristic("Ella está diciendo que necesita revisar eso mañana.");
  assert.equal(es.language, "es");
});

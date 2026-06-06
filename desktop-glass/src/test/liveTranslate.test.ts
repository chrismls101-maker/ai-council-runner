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
  configDefaultsForMode,
  normalizeLiveTranslateConfig,
  normalizeSaveMode,
  saveModeStatusLabel,
} from "../shared/liveTranslateConfig.ts";
import {
  applyGlossaryToTranslation,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  recentCaptionContext,
} from "../shared/liveTranslatePrompt.ts";
import {
  DEFAULT_LIVE_TRANSLATE_CONFIG,
  initialLiveTranslateRuntime,
  shouldPersistTranslateChunk,
  shouldPersistTranslationOnly,
  startLiveTranslate,
  stopLiveTranslate,
  translateAllowsMicrophone,
  translateRequiresSystemAudio,
} from "../shared/liveTranslateState.ts";
import {
  GLASS_MODE_ORDER,
  GLASS_MODE_PRESETS,
  GLASS_QUICK_TOOLS,
} from "../shared/glassModePresets.ts";
import { translateEventMetadata } from "../main/liveTranslateMain.ts";
import { liveTranslateOverlayPairLabel } from "../shared/liveTranslateTypes.ts";

test("Translate preset exists but is not in main mode card order", () => {
  assert.ok(GLASS_MODE_PRESETS.translate);
  assert.equal(GLASS_MODE_PRESETS.translate.label, "Translate");
  assert.deepEqual(GLASS_MODE_ORDER, ["listen", "meetings", "work", "fix"]);
  assert.deepEqual(GLASS_QUICK_TOOLS, ["voice", "translate"]);
});

test("media mode defaults are correct", () => {
  const media = configDefaultsForMode("media");
  assert.equal(media.source, "system_audio");
  assert.equal(media.displayMode, "translation_only");
  assert.equal(media.saveMode, "private_no_save");
  assert.equal(media.captionPosition, "bottom_center");
  assert.equal(media.latencyMode, "balanced");
});

test("conversation mode defaults are correct", () => {
  const conv = configDefaultsForMode("conversation");
  assert.equal(conv.source, "system_audio");
  assert.equal(conv.displayMode, "original_and_translation");
  assert.equal(conv.saveMode, "private_no_save");
  assert.equal(conv.captionPosition, "bottom_center");
  assert.equal(conv.latencyMode, "balanced");
});

test("old save_transcript aliases to save_original_and_translation", () => {
  assert.equal(normalizeSaveMode("save_transcript"), "save_original_and_translation");
  const cfg = normalizeLiveTranslateConfig({ saveMode: "save_transcript" });
  assert.equal(cfg.saveMode, "save_original_and_translation");
  assert.equal(shouldPersistTranslateChunk(cfg), true);
});

test("latencyMode defaults to balanced and glossaryTerms are optional", () => {
  const cfg = normalizeLiveTranslateConfig({});
  assert.equal(cfg.latencyMode, "balanced");
  assert.ok(Array.isArray(cfg.glossaryTerms));
  const noGlossary = normalizeLiveTranslateConfig({ glossaryTerms: undefined });
  assert.ok(noGlossary.glossaryTerms?.length);
});

test("default config uses auto source and private no-save friendly defaults", () => {
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.sourceLanguage, "auto");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.displayMode, "translation_only");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.captionPosition, "bottom_center");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.saveMode, "private_no_save");
  assert.equal(DEFAULT_LIVE_TRANSLATE_CONFIG.mode, "media");
});

test("private_no_save does not persist transcript or translation metadata", () => {
  assert.equal(shouldPersistTranslateChunk(DEFAULT_LIVE_TRANSLATE_CONFIG), false);
  const rt = startLiveTranslate(initialLiveTranslateRuntime(), { saveMode: "private_no_save" });
  assert.equal(
    translateEventMetadata(rt, "Hola", "Hello"),
    undefined,
  );
});

test("save setting must be explicitly enabled to persist", () => {
  assert.equal(shouldPersistTranslateChunk({ ...DEFAULT_LIVE_TRANSLATE_CONFIG, saveMode: "save_translation" }), true);
  assert.equal(shouldPersistTranslationOnly({ ...DEFAULT_LIVE_TRANSLATE_CONFIG, saveMode: "save_translation" }), true);
  assert.equal(saveModeStatusLabel("private_no_save"), "Save: Off");
  assert.equal(saveModeStatusLabel("save_translation"), "Save: Translation only");
  assert.equal(saveModeStatusLabel("save_original_and_translation"), "Save: Original + translation");
});

test("save_original_and_translation persists labeled translation metadata", () => {
  const rt = startLiveTranslate(initialLiveTranslateRuntime(), {
    saveMode: "save_original_and_translation",
  });
  const meta = translateEventMetadata(rt, "Hola", "Hello");
  assert.equal((meta?.liveTranslate as { labeledAsTranslation?: boolean }).labeledAsTranslation, true);
  assert.equal((meta?.liveTranslate as { translatedText?: string }).translatedText, "Hello");
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

test("original + translation display mode uses short language codes", () => {
  const formatted = formatCaptionForOverlay(
    {
      id: "1",
      original: "Necesito revisar eso mañana.",
      translated: "I need to review that tomorrow.",
      interim: false,
      updatedAt: new Date().toISOString(),
    },
    "original_and_translation",
    { originalCode: "ES", translatedCode: "EN" },
  );
  assert.match(formatted!.primary, /^EN:/);
  assert.match(formatted!.secondary!, /^ES:/);
  assert.equal(formatted!.interim, false);
});

test("interim caption has interim state", () => {
  const formatted = formatCaptionForOverlay(
    {
      id: "1",
      original: "Hola",
      translated: "Hello",
      interim: true,
      updatedAt: new Date().toISOString(),
    },
    "translation_only",
  );
  assert.equal(formatted!.interim, true);
});

test("overlay label shows Translating prefix", () => {
  const label = liveTranslateOverlayPairLabel("es", "en");
  assert.match(label, /^Translating:/);
  assert.match(label, /Spanish/);
  assert.match(label, /English/);
});

test("start and stop translate runtime", () => {
  let rt = initialLiveTranslateRuntime();
  rt = startLiveTranslate(rt, { targetLanguage: "es", mode: "conversation" });
  assert.equal(rt.active, true);
  assert.equal(rt.config.enabled, true);
  assert.equal(rt.config.mode, "conversation");
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

test("context window includes previous captions in user prompt", () => {
  const lines = [
    {
      id: "1",
      original: "Buenos días",
      translated: "Good morning",
      interim: false,
      updatedAt: new Date().toISOString(),
    },
  ];
  const ctx = recentCaptionContext(lines, 4);
  assert.equal(ctx.length, 1);
  const user = buildTranslateUserPrompt({
    text: "Cómo estás?",
    targetLanguage: "en",
    previousCaptions: ctx,
  });
  assert.match(user, /Good morning/);
  assert.match(user, /Buenos días/);
});

test("glossary term IIVO preserved in post-processing", () => {
  const out = applyGlossaryToTranslation("Welcome to iivo glass", [
    { source: "IIVO", preserve: true },
  ]);
  assert.match(out, /IIVO/i);
});

test("mode affects prompt guidance", () => {
  const media = buildTranslateSystemPrompt({ text: "test", targetLanguage: "en", mode: "media" });
  const conv = buildTranslateSystemPrompt({ text: "test", targetLanguage: "en", mode: "conversation" });
  assert.match(media, /concise/i);
  assert.match(conv, /casual/i);
});

test("panel-only caption position normalized to bottom_center", () => {
  const cfg = normalizeLiveTranslateConfig({ captionPosition: "panel" });
  assert.equal(cfg.captionPosition, "bottom_center");
});

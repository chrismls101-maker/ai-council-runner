import assert from "node:assert/strict";
import {
  GLASS_DEFAULT_MODEL,
  GLASS_MODEL_FALLBACK_CHAIN,
  buildGlassModelTryChain,
  getConfiguredGlassTextModel,
  getConfiguredGlassVisionModel,
  getGlassModelsDiagnostics,
  resolveGlassModelPrimary,
} from "../../dist/server/config/glassModels.js";
import { isOpenAiModelUnavailableError, ProviderError } from "../../dist/server/providers/openai.js";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("resolveGlassModelPrimary defaults to gpt-5.5 when env unset", () => {
  const prev = process.env.IIVO_GLASS_OPENAI_MODEL;
  delete process.env.IIVO_GLASS_OPENAI_MODEL;
  try {
    assert.equal(resolveGlassModelPrimary("text", "default"), "gpt-5.5");
    assert.equal(resolveGlassModelPrimary("vision", "default"), "gpt-5.5");
    assert.equal(resolveGlassModelPrimary("text", "diagnostic"), "gpt-5.5");
    assert.equal(resolveGlassModelPrimary("text", "semantic"), "gpt-5.5");
  } finally {
    if (prev === undefined) delete process.env.IIVO_GLASS_OPENAI_MODEL;
    else process.env.IIVO_GLASS_OPENAI_MODEL = prev;
  }
});

await test("IIVO_GLASS_OPENAI_MODEL overrides text primary", () => {
  const prev = process.env.IIVO_GLASS_OPENAI_MODEL;
  process.env.IIVO_GLASS_OPENAI_MODEL = "custom-text-model";
  try {
    assert.equal(getConfiguredGlassTextModel(), "custom-text-model");
    assert.equal(resolveGlassModelPrimary("text", "default"), "custom-text-model");
  } finally {
    if (prev === undefined) delete process.env.IIVO_GLASS_OPENAI_MODEL;
    else process.env.IIVO_GLASS_OPENAI_MODEL = prev;
  }
});

await test("semantic model falls back to text model", () => {
  const prevText = process.env.IIVO_GLASS_OPENAI_MODEL;
  const prevSem = process.env.IIVO_GLASS_SEMANTIC_MODEL;
  process.env.IIVO_GLASS_OPENAI_MODEL = "text-only";
  delete process.env.IIVO_GLASS_SEMANTIC_MODEL;
  try {
    assert.equal(resolveGlassModelPrimary("text", "semantic"), "text-only");
  } finally {
    if (prevText === undefined) delete process.env.IIVO_GLASS_OPENAI_MODEL;
    else process.env.IIVO_GLASS_OPENAI_MODEL = prevText;
    if (prevSem === undefined) delete process.env.IIVO_GLASS_SEMANTIC_MODEL;
    else process.env.IIVO_GLASS_SEMANTIC_MODEL = prevSem;
  }
});

await test("IIVO_GLASS_VISION_MODEL overrides vision primary", () => {
  const prev = process.env.IIVO_GLASS_VISION_MODEL;
  process.env.IIVO_GLASS_VISION_MODEL = "custom-vision";
  try {
    assert.equal(getConfiguredGlassVisionModel(), "custom-vision");
    assert.equal(resolveGlassModelPrimary("vision", "default"), "custom-vision");
  } finally {
    if (prev === undefined) delete process.env.IIVO_GLASS_VISION_MODEL;
    else process.env.IIVO_GLASS_VISION_MODEL = prev;
  }
});

await test("buildGlassModelTryChain appends gpt-4.1 and gpt-4o fallback", () => {
  assert.deepEqual(buildGlassModelTryChain("gpt-5.5"), ["gpt-5.5", "gpt-4.1", "gpt-4o"]);
  assert.deepEqual(buildGlassModelTryChain("gpt-4.1"), ["gpt-4.1", "gpt-4o"]);
});

await test("getGlassModelsDiagnostics includes fallback chain and defaults", () => {
  const d = getGlassModelsDiagnostics();
  assert.equal(d.defaultModel, GLASS_DEFAULT_MODEL);
  assert.deepEqual(d.fallbackChain, [...GLASS_MODEL_FALLBACK_CHAIN]);
  assert.equal(d.text.selectedModel, "gpt-5.5");
  assert.deepEqual(d.text.fallbackChain, ["gpt-5.5", "gpt-4.1", "gpt-4o"]);
  assert.ok(d.vision.selectedModel);
});

await test("isOpenAiModelUnavailableError detects model_not_found", () => {
  const err = new ProviderError('OpenAI API error (404): model_not_found: The model `gpt-4.1` does not exist', "openai");
  assert.equal(isOpenAiModelUnavailableError(err), true);
});

await test("isOpenAiModelUnavailableError ignores generic errors", () => {
  const err = new ProviderError("OpenAI API error (429): rate limit", "openai");
  assert.equal(isOpenAiModelUnavailableError(err), false);
});

console.log("glassModels.test.ts: all assertions passed");

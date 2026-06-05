import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildGlassDirectUserPrompt,
  formatGlassDirectAnswer,
  GLASS_DIRECT_SYSTEM_PROMPT,
  runGlassDirectAsk,
} from "../../dist/server/glass/glassDirectAsk.js";
import { handleGlassAsk } from "../../dist/server/glass/glassAskHandler.js";
import { promptRequestsGlassScreenVisual } from "../../dist/server/glass/glassScreenVisualPrompt.js";
import { GLASS_VISION_NOT_CONFIGURED_MESSAGE } from "../../dist/server/glass/glassVisualDirectAsk.js";
import {
  GlassAskPayloadTooLargeError,
  validateGlassAskPayloadSize,
} from "../../dist/server/glass/glassAskPayload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const handlerSource = readFileSync(
  join(__dirname, "../../dist/server/glass/glassAskHandler.js"),
  "utf8",
);

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("glassAskHandler does not import runCouncilFull", () => {
  assert.doesNotMatch(handlerSource, /runCouncilFull/);
});

await test("buildGlassDirectUserPrompt includes session summary", () => {
  const prompt = buildGlassDirectUserPrompt("What am I working on?", {
    summary: "Editing Glass overlay.",
    recentTranscript: "User asked about command bar.",
  });
  assert.match(prompt, /What am I working on/);
  assert.match(prompt, /Session summary/);
  assert.match(prompt, /Recent transcript/);
});

await test("formatGlassDirectAnswer strips headers and shortens long text", () => {
  const long = "a".repeat(1000);
  const formatted = formatGlassDirectAnswer(`## Title\n${long}`);
  assert.doesNotMatch(formatted.answer, /^##/);
  assert.ok(formatted.shortAnswer || formatted.answer.length < long.length);
  assert.match(formatted.warnings?.join(" ") ?? "", /shortened/i);
});

await test("formatGlassDirectAnswer removes council markers", () => {
  const formatted = formatGlassDirectAnswer(
    "Here is help.\nFinal Action Plan\n- do thing\nDecision Quality: 8/10",
  );
  assert.doesNotMatch(formatted.answer, /Final Action Plan/);
  assert.doesNotMatch(formatted.answer, /Decision Quality/);
});

const councilPrompts = [
  "Write a short note about my project.",
  "What should I ask Cursor next?",
  "Analyze this deeply",
  "Run council on this",
];

for (const prompt of councilPrompts) {
  await test(`"${prompt}" uses glass_direct route`, async () => {
    const result = await runGlassDirectAsk(
      { prompt },
      undefined,
      async () => ({
        content: `Helpful answer for: ${prompt}`,
        provider: "openai",
        model: "gpt-4o",
        modelUsed: "gpt-4o",
        requestedModel: "gpt-5.5",
        selectedModel: "gpt-5.5",
        fallbackUsed: true,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, usageAvailable: true },
      }),
    );
    assert.equal(result.routeUsed, "glass_direct");
    assert.match(result.answer, /Helpful answer/);
    for (const marker of [
      "Final Action Plan",
      "Decision Quality",
      "Risk Flags",
      "Recommended Action",
      "Sales Attack",
      "Product Decision",
      "Final Judge",
      "Strategist complete",
    ]) {
      assert.doesNotMatch(result.answer, new RegExp(marker, "i"));
    }
  });
}

await test("handleGlassAsk returns routeUsed glass_direct via mock caller", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk(
      { prompt: "Summarize my notes briefly." },
      undefined,
      async () => ({
        content: "- You are editing IIVO Glass.\n- Command bar is direct-only.",
        provider: "openai",
        model: "gpt-5.5",
        modelUsed: "gpt-5.5",
        requestedModel: "gpt-5.5",
        selectedModel: "gpt-5.5",
        fallbackUsed: false,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageAvailable: true },
      }),
    );
    assert.equal(result.routeUsed, "glass_direct");
    assert.equal(result.model, "gpt-5.5");
    assert.match(result.answer, /IIVO Glass/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("GLASS_DIRECT_SYSTEM_PROMPT forbids council formatting", () => {
  assert.match(GLASS_DIRECT_SYSTEM_PROMPT, /no Final Action Plan/i);
  assert.match(GLASS_DIRECT_SYSTEM_PROMPT, /Analyze Now/i);
});

await test("promptRequestsGlassScreenVisual detects screen questions", () => {
  assert.equal(promptRequestsGlassScreenVisual("What's on my screen?"), true);
  assert.equal(promptRequestsGlassScreenVisual("Hello there"), false);
  assert.equal(promptRequestsGlassScreenVisual("What matters here?"), false);
  assert.equal(promptRequestsGlassScreenVisual("What should I do next?"), false);
  assert.equal(promptRequestsGlassScreenVisual("Turn this into action steps."), false);
  assert.equal(promptRequestsGlassScreenVisual("Create content hooks from this"), false);
  assert.equal(promptRequestsGlassScreenVisual("What do you see on my screen?"), true);
  assert.equal(promptRequestsGlassScreenVisual("Read this error"), true);
});

await test("text QA prompts use glass_direct not capture-first", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const mockCaller = async () => ({
    content: "Action steps based on your strategy doc.",
    provider: "openai",
    model: "gpt-5.5",
    modelUsed: "gpt-5.5",
    requestedModel: "gpt-5.5",
    selectedModel: "gpt-5.5",
    fallbackUsed: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, usageAvailable: true },
  });
  try {
    for (const prompt of [
      "What should I do next?",
      "Turn this into action steps.",
      "Create content hooks from this",
      "What matters here?",
    ]) {
      const result = await handleGlassAsk({ prompt }, undefined, mockCaller);
      assert.equal(result.routeUsed, "glass_direct", prompt);
      assert.doesNotMatch(result.answer, /couldn't capture/i, prompt);
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("explicit screen question still routes to capture-first without screenshot", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk({ prompt: "What do you see on my screen?" });
    assert.equal(result.routeUsed, "glass_direct");
    assert.match(result.answer, /capture/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("visualIntent flag routes to visual path without screenshot", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk({
      prompt: "Hello",
      visualIntent: true,
    });
    assert.match(result.answer, /capture/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("screen question without screenshot returns capture-first message", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk({ prompt: "What's on my screen?" });
    assert.equal(result.routeUsed, "glass_direct");
    assert.match(result.answer, /capture/i);
    assert.doesNotMatch(result.answer, /cannot see your screen/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("visual ask request with imageDataUrl does not imply Council", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.IMAGE_VISION_ENABLED = "false";
  try {
    const result = await handleGlassAsk({
      prompt: "What's on my screen?",
      visualIntent: true,
      latestScreenshot: {
        imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    });
    assert.equal(result.routeUsed, "glass_visual_direct");
    assert.doesNotMatch(result.answer, /runCouncilFull/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    delete process.env.IMAGE_VISION_ENABLED;
  }
});

await test("screen question with screenshot but vision disabled returns honest error", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousVision = process.env.IMAGE_VISION_ENABLED;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.IMAGE_VISION_ENABLED = "false";
  try {
    const result = await handleGlassAsk({
      prompt: "What's on my screen?",
      latestScreenshot: {
        imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        capturedAt: new Date().toISOString(),
        label: "Primary",
      },
    });
    assert.equal(result.routeUsed, "glass_visual_direct");
    assert.match(result.answer, new RegExp(GLASS_VISION_NOT_CONFIGURED_MESSAGE.slice(0, 20), "i"));
    for (const marker of ["Final Action Plan", "Sales Attack", "runCouncil"]) {
      assert.doesNotMatch(result.answer, new RegExp(marker, "i"));
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousVision === undefined) delete process.env.IMAGE_VISION_ENABLED;
    else process.env.IMAGE_VISION_ENABLED = previousVision;
  }
});

await test("validateGlassAskPayloadSize rejects oversized visual image", () => {
  const huge = `data:image/jpeg;base64,${"A".repeat(7_000_000)}`;
  assert.throws(
    () =>
      validateGlassAskPayloadSize({
        prompt: "What's on my screen?",
        latestScreenshot: { imageDataUrl: huge, optimizedSizeBytes: 6_000_000 },
      }),
    GlassAskPayloadTooLargeError,
  );
});

await test("validateGlassAskPayloadSize allows small optimized payload", () => {
  validateGlassAskPayloadSize({
    prompt: "What's on my screen?",
    latestScreenshot: {
      imageDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      optimizedSizeBytes: 120,
      compressionApplied: true,
      optimizedWidth: 1,
      optimizedHeight: 1,
    },
  });
});

await test("visual ask path does not call runCouncilFull", () => {
  const visualSource = readFileSync(
    join(__dirname, "../../dist/server/glass/glassVisualDirectAsk.js"),
    "utf8",
  );
  assert.doesNotMatch(visualSource, /runCouncilFull/);
});

console.log("glassAsk.test.ts: all assertions passed");

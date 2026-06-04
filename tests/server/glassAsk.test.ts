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
  "What am I working on?",
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
      { prompt: "What am I working on?" },
      undefined,
      async () => ({
        content: "- You are editing IIVO Glass.\n- Command bar is direct-only.",
        provider: "openai",
        model: "gpt-4o",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageAvailable: true },
      }),
    );
    assert.equal(result.routeUsed, "glass_direct");
    assert.equal(result.model, "gpt-4o");
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

console.log("glassAsk.test.ts: all assertions passed");

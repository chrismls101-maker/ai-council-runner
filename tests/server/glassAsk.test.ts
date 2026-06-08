import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildGlassDirectUserPrompt,
  buildGlassDirectRetryPrompt,
  buildMeetingAnswerGuidance,
  buildNonMeetingCategoryGuidance,
  extractSessionAnchors,
  formatGlassDirectAnswer,
  GLASS_DIRECT_SYSTEM_PROMPT,
  GLASS_WEAK_ANCHOR_INSTRUCTION,
  looksLikeMeeting,
  looksLikeVideoLearning,
  looksLikeCreatorContent,
  looksLikeSalesReview,
  meetingWantsFullReport,
  runGlassDirectAsk,
  answersTooSimilar,
  sessionAnchorStrength,
} from "../../dist/server/glass/glassDirectAsk.js";
import { handleGlassAsk } from "../../dist/server/glass/glassAskHandler.js";
import {
  promptRequestsGlassScreenVisual,
  resolveGlassAskUsesVisual,
} from "../../dist/server/glass/glassScreenVisualPrompt.js";
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

await test("buildGlassDirectUserPrompt prepends passive userContext when present", () => {
  const prompt = buildGlassDirectUserPrompt(
    "Debug this handler",
    undefined,
    { name: "Alex", usualWork: "Design", currentFocus: "Launch" },
    "User context (inferred from recent Glass interactions — local only):\nRole tendency: technical builder",
  );
  assert.match(prompt, /Debug this handler/);
  assert.match(prompt, /inferred from recent Glass interactions/);
  assert.doesNotMatch(prompt, /Glass calibration/);
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
  assert.match(GLASS_DIRECT_SYSTEM_PROMPT, /Do not reuse the same answer structure/i);
});

await test("buildGlassDirectUserPrompt includes recent answers for freshness", () => {
  const prompt = buildGlassDirectUserPrompt("Summarize the call", {
    recentEvents: [
      {
        kind: "iivo_response",
        title: "IIVO response",
        text: "Previous summary about Acme Corp pricing objections and Q3 pipeline.",
        timestamp: new Date().toISOString(),
      },
    ],
  });
  assert.match(prompt, /Recent answers in this session/);
  assert.match(prompt, /Acme Corp/);
});

await test("answersTooSimilar detects template-like repeats", () => {
  const a =
    "Key ideas: diversify portfolio across ETFs. Next steps: rebalance quarterly and review DCA schedule for retirement accounts.";
  const b =
    "Key ideas: diversify holdings across index funds. Next steps: rebalance each quarter and review DCA schedule for retirement goals.";
  assert.equal(answersTooSimilar(a, b), true);
  assert.equal(
    answersTooSimilar(
      "Prospect Nova Labs raised API latency objections during the demo.",
      "Meeting with Acme covered hiring plan and runway through Q4.",
    ),
    false,
  );
});

await test("similar answer triggers retry guidance in runGlassDirectAsk", async () => {
  let calls = 0;
  const template =
    "Key ideas: diversify portfolio across ETFs and index funds for long-term growth. Next steps: rebalance quarterly and review dollar-cost averaging for retirement accounts.";
  const result = await runGlassDirectAsk(
    {
      prompt: "What did I miss from the investing video?",
      session: {
        recentEvents: [
          {
            kind: "iivo_response",
            title: "IIVO response",
            text: template,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    },
    undefined,
    async () => {
      calls += 1;
      if (calls === 1) {
        return {
          content: template,
          provider: "openai",
          model: "gpt-5.5",
          modelUsed: "gpt-5.5",
          requestedModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          fallbackUsed: false,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, usageAvailable: true },
        };
      }
      return {
        content: "You missed the segment on tax-loss harvesting for Nova Labs holdings and the 401k match deadline.",
        provider: "openai",
        model: "gpt-5.5",
        modelUsed: "gpt-5.5",
        requestedModel: "gpt-5.5",
        selectedModel: "gpt-5.5",
        fallbackUsed: false,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, usageAvailable: true },
      };
    },
  );
  assert.equal(calls, 2);
  assert.match(result.answer, /Nova Labs|tax-loss/i);
});

await test("voice what matters here routes glass_direct with session context", async () => {
  assert.equal(resolveGlassAskUsesVisual("What matters here?"), false);
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk(
      {
        prompt: "What matters here?",
        session: { recentTranscript: "Discussed Q3 pipeline with Nova Labs." },
      },
      undefined,
      async () => ({
        content: "Nova Labs pricing and Q3 pipeline are the focus.",
        provider: "openai",
        model: "gpt-5.5",
        modelUsed: "gpt-5.5",
        requestedModel: "gpt-5.5",
        selectedModel: "gpt-5.5",
        fallbackUsed: false,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, usageAvailable: true },
      }),
    );
    assert.equal(result.routeUsed, "glass_direct");
    assert.match(result.answer, /Nova Labs|Q3/i);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

await test("voice read this error routes glass_visual_direct with screenshot", async () => {
  assert.equal(resolveGlassAskUsesVisual("Read this error"), true);
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await handleGlassAsk({
      prompt: "Read this error",
      latestScreenshot: {
        imageDataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        capturedAt: new Date().toISOString(),
      },
    });
    assert.equal(result.routeUsed, "glass_visual_direct");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
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

// --- PART 5: template drift / session anchor extraction ---

await test("extractSessionAnchors pulls sprint numbers and decisions (meeting_call)", () => {
  const a = extractSessionAnchors({
    summary: "Sprint 14 planning. We decided to cut the billing migration.",
    recentTranscript: "Maria pushed back on the timeline. Due Friday for the API spec.",
  });
  assert.ok(a.sprints.some((s) => /sprint\s*14/i.test(s)));
  assert.ok(a.decisions.length > 0);
  assert.ok(a.names.some((n) => /Maria/.test(n)));
  assert.ok(a.dueDates.length > 0);
});

await test("extractSessionAnchors pulls lesson/episode numbers (video_learning / creator_content)", () => {
  const vl = extractSessionAnchors({
    summary: "Lesson 3 on dollar cost averaging and rebalancing a portfolio.",
  });
  assert.ok(vl.lessons.some((l) => /lesson\s*3/i.test(l)));

  const cc = extractSessionAnchors({
    recentTranscript: "Episode 7 hook about morning routines for creators.",
  });
  assert.ok(cc.lessons.some((l) => /episode\s*7/i.test(l)));
});

await test("extractSessionAnchors pulls metrics, objections and errors (sales_review / debug)", () => {
  const sales = extractSessionAnchors({
    summary: "Deal with Acme worth $42k. Prospect concerned about onboarding time.",
  });
  assert.ok(sales.metrics.some((m) => /\$\s?42k/i.test(m)));
  assert.ok(sales.objections.length > 0);

  const debug = extractSessionAnchors({
    recentTranscript: "DATABASE_URL missing, request failed with a 500 error.",
  });
  assert.ok(debug.envErrors.some((e) => /DATABASE_URL/.test(e)));
  assert.ok(debug.envErrors.some((e) => /error|500/i.test(e)));
});

await test("thin context yields weak anchor strength and triggers need-more-context instruction", () => {
  const thin = extractSessionAnchors({ summary: "Working on stuff." });
  assert.ok(sessionAnchorStrength(thin) < 2);
  const prompt = buildGlassDirectUserPrompt("Summarize this", { summary: "Working on stuff." });
  assert.match(prompt, /I need more specific context/i);
});

await test("rich context does not append the weak-anchor instruction", () => {
  const prompt = buildGlassDirectUserPrompt("Summarize this", {
    summary: "Sprint 14 with Maria. Decided to cut billing. Deal worth $42k due Friday.",
  });
  assert.doesNotMatch(prompt, new RegExp(GLASS_WEAK_ANCHOR_INSTRUCTION.slice(0, 30), "i"));
  assert.match(prompt, /Session-specific anchors/i);
});

await test("buildGlassDirectUserPrompt with no session never nags for context", () => {
  const prompt = buildGlassDirectUserPrompt("What is a closure in JS?");
  assert.doesNotMatch(prompt, /I need more specific context/i);
});

await test("buildGlassDirectUserPrompt includes Glass user profile block", () => {
  const prompt = buildGlassDirectUserPrompt("Help me prioritize today", undefined, {
    name: "Jordan",
    usualWork: "Enterprise sales",
    currentFocus: "Closing a pilot",
  });
  assert.match(prompt, /User Profile \(from Glass calibration\)/);
  assert.match(prompt, /Name: Jordan/);
  assert.match(prompt, /Kind of work: Enterprise sales/);
  assert.match(prompt, /Current focus: Closing a pilot/);
});

// --- meeting intelligence (server prompt routing) ---

await test("looksLikeMeeting detects meeting prompts/context", () => {
  assert.equal(
    looksLikeMeeting("Who owns what?\n\nContext: Sprint 14 planning with action items and blockers."),
    true,
  );
  assert.equal(
    looksLikeMeeting("What are the action items?", { currentSource: { appName: "Zoom" } }),
    true,
  );
  // Generic coding question is not a meeting.
  assert.equal(looksLikeMeeting("Explain this closure bug in my code."), false);
});

await test("meetingWantsFullReport distinguishes debrief vs quick", () => {
  assert.equal(meetingWantsFullReport("Give me the report."), true);
  assert.equal(meetingWantsFullReport("Summarize the session."), true);
  assert.equal(meetingWantsFullReport("Who owns what?"), false);
});

await test("buildMeetingAnswerGuidance forbids invention and calls out missing fields", () => {
  const full = buildMeetingAnswerGuidance(true);
  assert.match(full, /Never invent owners/i);
  assert.match(full, /Action items/i);
  assert.match(full, /Follow-up message draft/i);
  assert.match(full, /Next meeting agenda/i);
  const quick = buildMeetingAnswerGuidance(false);
  assert.match(quick, /no owner given|No owner given/i);
  assert.doesNotMatch(quick, /Next meeting agenda/i);
});

await test("meeting prompt injects meeting guidance into user prompt", () => {
  const prompt = buildGlassDirectUserPrompt("Who owns what?", {
    summary: "Sprint 14 planning with Maria and Tom; action items and blockers discussed.",
    currentSource: { appName: "Zoom", windowTitle: "Sprint 14" },
  });
  assert.match(prompt, /meeting\/call session/i);
  assert.match(prompt, /Never invent owners/i);
});

await test("retry prompt demands distinct facts or explicit missing fields", () => {
  const retry = buildGlassDirectRetryPrompt("Summarize the session.");
  assert.match(retry, /too similar\/generic/i);
  assert.match(retry, /list the missing fields/i);
});

// --- non-meeting category intelligence (video / creator / sales) ---

await test("category detectors recognize their own context", () => {
  assert.equal(
    looksLikeVideoLearning("What should I remember?\n\nContext: Watching lesson 3 tutorial, key concepts"),
    true,
  );
  assert.equal(
    looksLikeCreatorContent("What matters here?\n\nContext: Episode 7 podcast hook, audience, CTA"),
    true,
  );
  assert.equal(
    looksLikeSalesReview("Turn this into action steps.\n\nContext: prospect Acme deal objection demo"),
    true,
  );
  // A plain coding prompt matches none of them.
  assert.equal(looksLikeVideoLearning("Fix this null pointer in my code."), false);
  assert.equal(looksLikeCreatorContent("Fix this null pointer in my code."), false);
  assert.equal(looksLikeSalesReview("Fix this null pointer in my code."), false);
});

await test("video-learning guidance forbids defaulting to generic investing advice", () => {
  const g = buildNonMeetingCategoryGuidance(
    "What should I remember?\n\nContext: lesson 5 lecture key concepts terms",
  );
  assert.ok(g);
  assert.match(g, /video-learning/i);
  assert.match(g, /dollar-cost averaging/i);
  assert.match(g, /lesson number\/topic/i);
});

await test("creator-content guidance requires episode specifics and missing fields", () => {
  const g = buildNonMeetingCategoryGuidance(
    "What matters here?\n\nContext: episode 4 podcast hook thumbnail CTA audience",
  );
  assert.ok(g);
  assert.match(g, /creator-content/i);
  assert.match(g, /episode/i);
  assert.match(g, /Do NOT repeat the same generic hook\/CTA/i);
});

await test("sales-review guidance forbids generic sales-ops lists", () => {
  const g = buildNonMeetingCategoryGuidance(
    "Turn this into action steps.\n\nContext: prospect Globex deal stage objection competitor",
  );
  assert.ok(g);
  assert.match(g, /sales-review/i);
  assert.match(g, /generic sales-ops list/i);
  assert.match(g, /Never invent a prospect name/i);
});

await test("category guidance is injected into the user prompt", () => {
  const prompt = buildGlassDirectUserPrompt(
    "What should I remember?\n\nContext: lesson 2 React useState useEffect tutorial",
  );
  assert.match(prompt, /video-learning/i);
});

console.log("glassAsk.test.ts: all assertions passed");

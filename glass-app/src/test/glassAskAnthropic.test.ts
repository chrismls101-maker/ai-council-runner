import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassAskSystemPrompt,
  buildGlassAskUserText,
  overlayShortAnswer,
} from "../main/glassAskPrompt.ts";
import { isRecoverableCoderError } from "../main/agentRunLifecycle.ts";

test("buildGlassAskSystemPrompt rejects council format in overlay mode", () => {
  const system = buildGlassAskSystemPrompt({ prompt: "hi", responseStyle: "overlay" });
  assert.match(system, /No council format/i);
});

test("buildGlassAskUserText includes session and passive context", () => {
  const text = buildGlassAskUserText({
    prompt: "What happened?",
    userContext: "User is in VS Code",
    session: {
      title: "Debug session",
      recentInsights: ["API timeout"],
    },
  });
  assert.match(text, /What happened/);
  assert.match(text, /VS Code/);
  assert.match(text, /API timeout/);
});

test("overlayShortAnswer truncates long answers", () => {
  const long = "A".repeat(400);
  const short = overlayShortAnswer(long);
  assert.ok(short.length <= 320);
});

test("isRecoverableCoderError still classifies build failures", () => {
  assert.equal(isRecoverableCoderError("npm run typecheck failed"), true);
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_HANDOFF_MIN_TRANSCRIPT_CHARS,
  classifyBuildHandoffIntent,
  formatTranscriptHandoffPrompt,
  resolveBuildHandoffPrompt,
} from "../shared/buildHandoffIntent.ts";

describe("classifyBuildHandoffIntent", () => {
  it("detects send-to-cursor phrasing", () => {
    const intent = classifyBuildHandoffIntent("Send that plan to Cursor");
    assert.equal(intent?.target, "cursor");
  });

  it("detects natural Claude phrasing", () => {
    const intent = classifyBuildHandoffIntent("Can you put this in Claude?");
    assert.equal(intent?.target, "claude");
  });

  it("detects glass command bar phrasing", () => {
    const intent = classifyBuildHandoffIntent("Put that in the command bar");
    assert.equal(intent?.target, "glass");
  });

  it("prefers transcript when user references what they heard", () => {
    const intent = classifyBuildHandoffIntent(
      "Send what you heard from the video to Cursor",
    );
    assert.equal(intent?.target, "cursor");
    assert.equal(intent?.preferTranscript, true);
  });

  it("ignores unrelated cursor mentions", () => {
    assert.equal(classifyBuildHandoffIntent("Open the file in Cursor"), null);
  });
});

describe("resolveBuildHandoffPrompt", () => {
  it("uses last ask response by default", () => {
    const prompt = resolveBuildHandoffPrompt({
      lastAskResponse: {
        prompt: "plan",
        answer: "short",
        fullAnswer: "## Plan\n1. Scaffold app",
        at: new Date().toISOString(),
      },
    });
    assert.match(prompt ?? "", /Scaffold app/);
  });

  it("uses transcript when preferTranscript is set", () => {
    const transcript = "x".repeat(BUILD_HANDOFF_MIN_TRANSCRIPT_CHARS);
    const prompt = resolveBuildHandoffPrompt({
      lastAskResponse: {
        prompt: "plan",
        answer: "ignore me",
        at: new Date().toISOString(),
      },
      systemTranscript: transcript,
      preferTranscript: true,
    });
    assert.match(prompt ?? "", /Build from this video\/audio transcript/);
  });
});

describe("formatTranscriptHandoffPrompt", () => {
  it("wraps transcript with build header", () => {
    const out = formatTranscriptHandoffPrompt("They built a todo app with React.");
    assert.match(out, /Build from this video\/audio transcript/);
    assert.match(out, /todo app/);
  });
});

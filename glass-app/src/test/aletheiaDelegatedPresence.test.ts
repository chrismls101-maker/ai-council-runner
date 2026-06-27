import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendDelegatedPresenceAudit,
  classifyDelegatedPresenceIntent,
  delegatedPresenceIntroSpeech,
  initialDelegatedPresenceSnapshot,
  isDelegatedPresenceRunning,
  markDelegatedPresencePhase,
} from "../shared/aletheiaDelegatedPresence.ts";

test("classifyDelegatedPresenceIntent parses go-to-app phrasing", () => {
  const intent = classifyDelegatedPresenceIntent(
    "Go to Figma and tell me what's on the current artboard",
  );
  assert.ok(intent);
  assert.equal(intent!.targetApp, "Figma");
  assert.match(intent!.reportQuestion, /artboard/i);
});

test("classifyDelegatedPresenceIntent parses open-app phrasing", () => {
  const intent = classifyDelegatedPresenceIntent("Open Slack and check my unread messages");
  assert.ok(intent);
  assert.equal(intent!.targetApp, "Slack");
});

test("classifyDelegatedPresenceIntent parses in-app phrasing", () => {
  const intent = classifyDelegatedPresenceIntent("In Notion, summarize this page");
  assert.ok(intent);
  assert.equal(intent!.targetApp, "Notion");
});

test("classifyDelegatedPresenceIntent ignores generic asks", () => {
  assert.equal(classifyDelegatedPresenceIntent("What is the weather"), null);
  assert.equal(classifyDelegatedPresenceIntent("Hello"), null);
});

test("isDelegatedPresenceRunning tracks active phases", () => {
  const snapshot = initialDelegatedPresenceSnapshot({
    targetApp: "Figma",
    goal: "Go to Figma",
    reportQuestion: "Tell me what you see",
    matched: "Go to Figma",
  });
  assert.equal(isDelegatedPresenceRunning(snapshot), true);
  assert.equal(
    isDelegatedPresenceRunning(markDelegatedPresencePhase(snapshot, "complete")),
    false,
  );
});

test("delegated presence audit and intro speech are user-facing", () => {
  const snapshot = initialDelegatedPresenceSnapshot({
    targetApp: "Figma",
    goal: "Go to Figma",
    reportQuestion: "Tell me what you see",
    matched: "Go to Figma",
  });
  const next = appendDelegatedPresenceAudit(snapshot, {
    narration: "Focused Figma via AppleScript.",
    ok: true,
    method: "AppleScript activate",
  });
  assert.equal(next.audit.length, 1);
  assert.match(delegatedPresenceIntroSpeech("Figma"), /Figma/);
});

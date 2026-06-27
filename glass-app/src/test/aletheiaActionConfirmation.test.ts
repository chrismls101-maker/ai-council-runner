import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  actionResultAckSpeech,
  formatActionConfirmationCard,
  resolveVoiceActionConfirmation,
} from "../shared/aletheiaActionConfirmation.ts";
import {
  applyActionModifier,
  buildPendingConfirmationView,
  intentFromAdviceApproval,
  intentFromShell,
} from "../shared/aletheiaExecution.ts";

describe("formatActionConfirmationCard", () => {
  test("formats run, target, and reason lines", () => {
    const intent = intentFromShell({
      command: "npm test",
      sessionId: "session-1",
      targetApp: "Cursor",
      rationale: "Investigate the failing test.",
    });
    const card = formatActionConfirmationCard(
      buildPendingConfirmationView(intent, "Ready for approval."),
    );
    assert.match(card.runLine, /npm test/);
    assert.equal(card.targetLine, "Cursor");
    assert.equal(card.reasonLine, "Investigate the failing test.");
    assert.equal(card.commandPreview, "npm test");
  });
});

describe("resolveVoiceActionConfirmation", () => {
  test("approves pending confirmation on yes", () => {
    const intent = intentFromShell({ command: "npm test", sessionId: "s1" });
    const resolution = resolveVoiceActionConfirmation("yes please", {
      pendingConfirmation: buildPendingConfirmationView(intent, "waiting"),
    });
    assert.equal(resolution?.decision, "approve");
  });

  test("rejects pending confirmation on no", () => {
    const intent = intentFromShell({ command: "npm test", sessionId: "s1" });
    const resolution = resolveVoiceActionConfirmation("no thanks", {
      pendingConfirmation: buildPendingConfirmationView(intent, "waiting"),
    });
    assert.equal(resolution?.decision, "reject");
  });

  test("captures modify phrasing", () => {
    const intent = intentFromShell({ command: "npm test", sessionId: "s1" });
    const resolution = resolveVoiceActionConfirmation("change it to npm run build", {
      pendingConfirmation: buildPendingConfirmationView(intent, "waiting"),
    });
    assert.equal(resolution?.decision, "modify");
    if (resolution?.decision === "modify") {
      assert.match(resolution.modifier, /npm run build/);
    }
  });
});

describe("applyActionModifier", () => {
  test("updates shell command from modifier text", () => {
    const intent = intentFromShell({ command: "npm test", sessionId: "s1" });
    const revised = applyActionModifier(intent, "change it to npm run lint");
    assert.equal(revised.payload.command, "npm run lint");
  });
});

describe("intentFromAdviceApproval", () => {
  test("builds shell intent for terminal error advice", () => {
    const intent = intentFromAdviceApproval({
      sessionId: "s1",
      adviceId: "advice-1",
      kind: "terminal_error",
      headline: "Error",
      body: "Terminal shows a failure.",
      command: "npm test",
      targetApp: "Cursor",
    });
    assert.ok(intent);
    assert.equal(intent?.kind, "shell");
    assert.equal(intent?.payload.command, "npm test");
  });
});

describe("actionResultAckSpeech", () => {
  test("prefixes success message", () => {
    assert.match(actionResultAckSpeech(true, "Tests passed."), /Done\./);
  });
});

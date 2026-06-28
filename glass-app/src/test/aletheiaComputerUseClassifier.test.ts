import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyComputerUseIntentSync,
  extractVerbCluster,
  canUseDelegatedPresence,
  isExplicitComputerUseRequest,
} from "../shared/aletheiaComputerUseClassifier.ts";

describe("classifyComputerUseIntentSync stage 1", () => {
  test("explicit use my computer → OPERATE", () => {
    const result = classifyComputerUseIntentSync(
      "Use my computer to open Slack and summarize unread",
    );
    assert.equal(result.route, "OPERATE");
    assert.equal(result.reason, "explicit-computer-use");
  });

  test("no app signal → NONE", () => {
    assert.equal(classifyComputerUseIntentSync("what time is it").route, "NONE");
  });

  test("Open Slack → SINGLE_ACTION", () => {
    const result = classifyComputerUseIntentSync("Open Slack");
    assert.equal(result.route, "SINGLE_ACTION");
    assert.equal(result.targetApp, "Slack");
  });

  test("summarize unread thread in Slack → OPERATE (scroll-to-find)", () => {
    const result = classifyComputerUseIntentSync(
      "Go to Slack and summarize the unread thread",
    );
    assert.equal(result.route, "OPERATE");
    assert.equal(result.reason, "scroll-to-find");
    assert.equal(result.targetApp, "Slack");
  });

  test("tell me what's on screen in Figma → OBSERVE", () => {
    const result = classifyComputerUseIntentSync(
      "Tell me what's on the screen in Figma",
    );
    assert.equal(result.route, "OBSERVE");
    assert.ok(result.delegatedIntent);
    assert.equal(result.delegatedIntent?.targetApp, "Figma");
  });

  test("first component in sidebar → OPERATE via scroll-to-find gate", () => {
    const result = classifyComputerUseIntentSync(
      "Go to Figma and describe the first component in the left sidebar",
    );
    assert.equal(result.route, "OPERATE");
    assert.equal(result.reason, "scroll-to-find");
  });

  test("what does the error say in the terminal → OBSERVE", () => {
    const result = classifyComputerUseIntentSync(
      "What does the error say in the terminal?",
    );
    assert.equal(result.route, "OBSERVE");
    assert.equal(result.targetApp, "Terminal");
  });

  test("save it destructive override → OPERATE", () => {
    const result = classifyComputerUseIntentSync(
      "Go to Figma, tell me what's on screen, and then save it",
    );
    assert.equal(result.route, "OPERATE");
    assert.equal(result.reason, "destructive-marker");
  });

  test("check unread messages → OPERATE (unread implies navigation)", () => {
    const result = classifyComputerUseIntentSync("Check my unread messages");
    assert.equal(result.route, "OPERATE");
    assert.ok(result.targetApp);
    assert.equal(extractVerbCluster("Check my unread messages"), "AMBIGUOUS");
  });

  test("use computer hint biases ambiguous prompt toward routing", () => {
    const without = classifyComputerUseIntentSync("check the project", "Slack");
    assert.equal(without.route, "NONE");
    const withHint = classifyComputerUseIntentSync("check the project", "Slack", {
      useComputerHint: true,
    });
    assert.equal(withHint.route, "AMBIGUOUS");
    assert.equal(withHint.reason, "use-computer-hint");
    assert.equal(withHint.targetApp, "Slack");
  });
});

describe("canUseDelegatedPresence stage 3", () => {
  test("blocks find-the navigation phrasing", () => {
    assert.equal(
      canUseDelegatedPresence({
        request: "Find the unread thread in Slack",
        targetApp: "Slack",
      }),
      false,
    );
  });

  test("allows plain describe visible state", () => {
    assert.equal(
      canUseDelegatedPresence({
        request: "Describe what you see on the artboard",
        targetApp: "Figma",
      }),
      true,
    );
  });
});

describe("isExplicitComputerUseRequest", () => {
  test("detects use my computer phrasing", () => {
    assert.equal(isExplicitComputerUseRequest("Use my computer to open Mail"), true);
  });
});

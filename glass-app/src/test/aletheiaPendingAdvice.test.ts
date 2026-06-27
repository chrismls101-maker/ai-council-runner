import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  approveAletheiaAdvice,
  dismissAletheiaAdvice,
  emptyAletheiaPendingAdviceSnapshot,
  generateAletheiaAdviceCards,
  mergeAletheiaAdviceCards,
  pendingAletheiaAdviceCards,
  resolveVoiceAdviceResponse,
} from "../shared/aletheiaPendingAdvice.ts";
import { initialAletheiaActivationState } from "../shared/aletheiaActivationPolicy.ts";

describe("generateAletheiaAdviceCards", () => {
  test("surfaces advice for terminal errors once companion is engaged", () => {
    const engaged = {
      ...initialAletheiaActivationState(),
      phase: "engaged" as const,
      userTurnCount: 1,
      awaitingUserLead: false,
    };
    const cards = generateAletheiaAdviceCards({
      companionModeActive: true,
      companionPrivacyActive: false,
      activation: engaged,
      connections: [
        {
          id: "terminal_dev_app",
          signals: ["terminal", "activeApp"],
          insight: "Your terminal has a recent error and you are in Cursor.",
        },
      ],
      existingCards: [],
    });
    assert.equal(cards.length, 1);
    assert.match(cards[0]!.question, /Should I\?/);
  });

  test("does not surface advice during presence-first awaiting user lead", () => {
    const cards = generateAletheiaAdviceCards({
      companionModeActive: true,
      companionPrivacyActive: false,
      activation: initialAletheiaActivationState(),
      connections: [
        {
          id: "terminal_dev_app",
          signals: ["terminal", "activeApp"],
          insight: "Your terminal has a recent error and you are in Cursor.",
        },
      ],
      existingCards: [],
    });
    assert.equal(cards.length, 0);
  });
});

describe("resolveVoiceAdviceResponse", () => {
  test("approves focused pending advice on yes", () => {
    const snapshot = mergeAletheiaAdviceCards([], [
      {
        id: "advice-1",
        kind: "terminal_error",
        status: "pending",
        headline: "Build or command error detected",
        body: "Terminal error visible.",
        question: "I can help investigate the error. Should I?",
        sourceKey: "terminal_dev_app",
        createdAt: Date.now(),
      },
    ]);
    const resolution = resolveVoiceAdviceResponse("yes please", snapshot);
    assert.equal(resolution?.decision, "approve");
    assert.equal(resolution?.adviceId, "advice-1");
  });

  test("dismisses focused pending advice on no", () => {
    const snapshot = mergeAletheiaAdviceCards([], [
      {
        id: "advice-1",
        kind: "terminal_error",
        status: "pending",
        headline: "Build or command error detected",
        body: "Terminal error visible.",
        question: "I can help investigate the error. Should I?",
        sourceKey: "terminal_dev_app",
        createdAt: Date.now(),
      },
    ]);
    const resolution = resolveVoiceAdviceResponse("no thanks", snapshot);
    assert.equal(resolution?.decision, "dismiss");
  });
});

describe("approveAletheiaAdvice", () => {
  test("marks card approved without removing it from snapshot", () => {
    const base = mergeAletheiaAdviceCards([], [
      {
        id: "advice-1",
        kind: "terminal_error",
        status: "pending",
        headline: "Build or command error detected",
        body: "Terminal error visible.",
        question: "Should I?",
        sourceKey: "terminal_dev_app",
        createdAt: Date.now(),
      },
    ]);
    const next = approveAletheiaAdvice(base, "advice-1");
    assert.equal(pendingAletheiaAdviceCards(next).length, 0);
    assert.equal(next.cards[0]?.status, "approved");
  });
});

describe("dismissAletheiaAdvice", () => {
  test("marks card dismissed", () => {
    const base = mergeAletheiaAdviceCards([], [
      {
        id: "advice-1",
        kind: "terminal_error",
        status: "pending",
        headline: "Build or command error detected",
        body: "Terminal error visible.",
        question: "Should I?",
        sourceKey: "terminal_dev_app",
        createdAt: Date.now(),
      },
    ]);
    const next = dismissAletheiaAdvice(base, "advice-1");
    assert.equal(next.cards[0]?.status, "dismissed");
    assert.equal(emptyAletheiaPendingAdviceSnapshot().cards.length, 0);
  });
});

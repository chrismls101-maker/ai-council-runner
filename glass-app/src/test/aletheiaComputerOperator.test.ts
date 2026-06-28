import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  planFromNaturalLanguage,
  formatComputerOperatorPlanDeclaration,
} from "../shared/aletheiaConversationPlanner.ts";
import {
  mergeGroundedUiState,
  scoreCandidateForGoal,
  extractGoalKeywords,
} from "../shared/aletheiaGroundedUiState.ts";
import {
  verifyOperatorAction,
  evaluateOperatorSuccess,
  isOperatorStepSuccessful,
  executionTrustworthyWithoutUiDelta,
} from "../shared/aletheiaActionVerifier.ts";
import {
  buildSessionGrantFromPlan,
  grantComputerOperatorSession,
  isOperatorActionAllowedByGrant,
  findMatchingPersistentGrant,
  persistentGrantMatchesPlan,
  buildPersistentGrantFromPlan,
  COMPUTER_OPERATOR_FORBIDDEN_PATTERNS,
} from "../shared/aletheiaComputerSessionAuthority.ts";
import {
  selectOperatorStepDecision,
  initialComputerOperatorSnapshot,
  appendComputerOperatorAudit,
  finalizeComputerOperatorSnapshot,
} from "../shared/aletheiaComputerOperatorLoop.ts";
import {
  classifyComputerOperatorIntent,
  computerOperatorIntroSpeech,
} from "../shared/aletheiaComputerOperatorIntent.ts";

describe("planFromNaturalLanguage", () => {
  test("plans Slack unread summarize with scope and step budget", () => {
    const plan = planFromNaturalLanguage(
      "Open Slack, go to the unread thread, and summarize it",
    );
    assert.ok(plan.targetApps.includes("Slack"));
    assert.equal(plan.stepBudget, 12);
    assert.match(plan.scope, /no destructive/);
    assert.equal(plan.requiresConfirmation, false);
    assert.ok(plan.successCriteria.some((c) => /unread/i.test(c)));
    const declaration = formatComputerOperatorPlanDeclaration(plan);
    assert.match(declaration, /Slack/);
    assert.match(declaration, /max 12 steps/);
  });

  test("requires confirmation for destructive goals", () => {
    const plan = planFromNaturalLanguage("Delete all files in Downloads");
    assert.equal(plan.requiresConfirmation, true);
    assert.equal(plan.authorityLevelRequired, "L2");
  });
});

describe("classifyComputerOperatorIntent", () => {
  test("detects use my computer phrasing", () => {
    const intent = classifyComputerOperatorIntent(
      "Use my computer to open Slack and summarize unread messages",
    );
    assert.ok(intent);
    assert.match(intent!.goal, /Slack/i);
  });
});

describe("mergeGroundedUiState", () => {
  test("merges and scores candidates", () => {
    const state = mergeGroundedUiState({
      captureId: "c1",
      width: 1000,
      height: 800,
      activeApp: "Slack",
      marks: [
        {
          id: "ax-1",
          source: "ax",
          label: "Unread messages",
          bounds: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 },
        },
        {
          id: "dom-1",
          source: "dom",
          label: "Unread thread",
          bounds: { x: 0.1, y: 0.25, w: 0.2, h: 0.05 },
        },
      ],
    });
    assert.ok(state.candidates.length >= 1);
    const keywords = extractGoalKeywords("open slack unread thread");
    const top = state.candidates[0];
    const score = scoreCandidateForGoal(top, keywords);
    assert.ok(score > 0.5);
  });
});

describe("verifyOperatorAction", () => {
  test("detects focus app change", () => {
    const before = mergeGroundedUiState({
      captureId: "a",
      width: 100,
      height: 100,
      activeApp: "Cursor",
      marks: [],
    });
    const after = mergeGroundedUiState({
      captureId: "b",
      width: 100,
      height: 100,
      activeApp: "Slack",
      marks: [],
    });
    const result = verifyOperatorAction(
      { kind: "focus_app", app: "Slack" },
      before,
      after,
    );
    assert.equal(result.ok, true);
    assert.ok(result.signals.some((s) => /Slack/.test(s)));
  });

  test("allows successful focus when execution ok but UI delta lagging", () => {
    const state = mergeGroundedUiState({
      captureId: "a",
      width: 100,
      height: 100,
      activeApp: "Cursor",
      marks: [],
    });
    const verification = verifyOperatorAction(
      { kind: "focus_app", app: "Slack" },
      state,
      state,
    );
    assert.equal(verification.ok, false);
    assert.equal(
      isOperatorStepSuccessful({ kind: "focus_app", app: "Slack" }, true, verification),
      true,
    );
    assert.equal(executionTrustworthyWithoutUiDelta("focus_app"), true);
  });
});

describe("session authority", () => {
  test("blocks send actions inside grant", () => {
    const plan = planFromNaturalLanguage("Open Slack and summarize unread");
    const grant = buildSessionGrantFromPlan(plan, "loop-1");
    const active = grantComputerOperatorSession(grant, "user-tap");
    const blocked = isOperatorActionAllowedByGrant(
      { kind: "type_text", text: "please send this message" },
      active,
    );
    assert.equal(blocked.ok, false);
    const allowed = isOperatorActionAllowedByGrant(
      { kind: "focus_app", app: "Slack" },
      active,
    );
    assert.equal(allowed.ok, true);
  });
});

describe("operator loop policy", () => {
  test("focuses target app when front app mismatches", () => {
    const plan = planFromNaturalLanguage("Open Slack and summarize unread thread");
    const state = mergeGroundedUiState({
      captureId: "c",
      width: 100,
      height: 100,
      activeApp: "Cursor",
      marks: [],
    });
    const decision = selectOperatorStepDecision({
      plan,
      state,
      step: 0,
      clickedTargetIds: [],
    });
    assert.equal(decision.action.kind, "focus_app");
    assert.equal(decision.action.app, "Slack");
  });

  test("prefers read_region before ambiguous pause", () => {
    const plan = planFromNaturalLanguage("Open Slack and summarize unread thread");
    const state = mergeGroundedUiState({
      captureId: "c",
      width: 100,
      height: 100,
      activeApp: "Slack",
      marks: [],
    });
    const decision = selectOperatorStepDecision({
      plan,
      state,
      step: 2,
      clickedTargetIds: [],
    });
    assert.equal(decision.action.kind, "read_region");
  });

  test("snapshot helpers finalize complete phase", () => {
    const plan = planFromNaturalLanguage("Open Slack");
    let snap = initialComputerOperatorSnapshot(plan);
    assert.equal(snap.phase, "awaiting_grant");
    snap = appendComputerOperatorAudit(snap, {
      step: 1,
      action: { kind: "focus_app", app: "Slack" },
      narration: "Focused Slack",
      ok: true,
    });
    snap = finalizeComputerOperatorSnapshot(snap, { ok: true, summary: "Done." });
    assert.equal(snap.phase, "complete");
    assert.equal(snap.summary, "Done.");
  });
});

describe("evaluateOperatorSuccess", () => {
  test("requires substantive summary for summarize goals", () => {
    const plan = planFromNaturalLanguage("summarize slack unread thread");
    const state = mergeGroundedUiState({
      captureId: "c",
      width: 100,
      height: 100,
      activeApp: "Slack",
      marks: [],
    });
    const weak = evaluateOperatorSuccess(
      plan.successCriteria,
      state,
      "Too short.",
      plan.goal,
    );
    assert.equal(weak.complete, false);

    const strong = evaluateOperatorSuccess(
      plan.successCriteria,
      state,
      "The unread thread shows three messages about the launch timeline and a question about the release date in the product channel.",
      plan.goal,
    );
    assert.equal(strong.complete, true);
  });
});

describe("computerOperatorIntroSpeech", () => {
  test("mentions grant when not auto-running from dashboard", () => {
    assert.match(
      computerOperatorIntroSpeech("Open Slack and summarize unread", false, "dashboard"),
      /grant/i,
    );
  });

  test("uses conversational phrasing for inline grant flow", () => {
    assert.match(
      computerOperatorIntroSpeech("Open Slack and check unread", false, "conversation"),
      /I can do that/i,
    );
  });
});

describe("computer operator ambient presence", () => {
  test("glow is running or paused only", async () => {
    const mod = await import("../shared/aletheiaComputerOperatorPresence.ts");
    assert.equal(mod.resolveComputerOperatorGlowPhase("running"), "running");
    assert.equal(mod.resolveComputerOperatorGlowPhase("paused"), "paused");
    assert.equal(mod.resolveComputerOperatorGlowPhase("awaiting_grant"), null);
    assert.equal(mod.resolveComputerOperatorGlowPhase("complete"), null);
    assert.equal(mod.resolveComputerOperatorGlowPhase("failed"), null);
  });

  test("overlay glow stays mounted through terminal phases for fade-out", async () => {
    const mod = await import("../shared/aletheiaComputerOperatorPresence.ts");
    assert.equal(mod.shouldMountComputerOperatorOverlayGlow("running"), true);
    assert.equal(mod.shouldMountComputerOperatorOverlayGlow("paused"), true);
    assert.equal(mod.shouldMountComputerOperatorOverlayGlow("complete"), true);
    assert.equal(mod.shouldMountComputerOperatorOverlayGlow("failed"), true);
    assert.equal(mod.shouldMountComputerOperatorOverlayGlow("awaiting_grant"), false);
  });

  test("strip active while running or paused", async () => {
    const mod = await import("../shared/aletheiaComputerOperatorPresence.ts");
    assert.equal(mod.isComputerOperatorStripActive("running"), true);
    assert.equal(mod.isComputerOperatorStripActive("paused"), true);
    assert.equal(mod.isComputerOperatorStripActive("awaiting_grant"), false);
    assert.equal(mod.isComputerOperatorStripActive(undefined), false);
  });

  test("only originating surface shows live UI during active session", async () => {
    const mod = await import("../shared/aletheiaComputerOperatorPresence.ts");
    const { initialComputerOperatorSnapshot } = await import("../shared/aletheiaComputerOperatorLoop.ts");
    const { planFromNaturalLanguage } = await import("../shared/aletheiaConversationPlanner.ts");
    const plan = planFromNaturalLanguage("Open Slack and summarize unread");
    const operator = initialComputerOperatorSnapshot(plan, { entrySurface: "conversation" });
    assert.equal(mod.isComputerOperatorLiveUiSurface(operator, "conversation"), true);
    assert.equal(mod.isComputerOperatorLiveUiSurface(operator, "dashboard"), false);
  });

  test("live progress location points to conversation or dashboard", async () => {
    const mod = await import("../shared/aletheiaComputerOperatorPresence.ts");
    assert.equal(mod.computerOperatorLiveProgressLocation("conversation"), "the conversation");
    assert.equal(mod.computerOperatorLiveProgressLocation("dashboard"), "this tab");
    assert.equal(mod.computerOperatorLiveProgressLocation(undefined), "the conversation");
  });
});

describe("persistent computer operator grants", () => {
  test("matches plan when app scope and actions align", () => {
    const plan = planFromNaturalLanguage("Open Slack and summarize unread thread");
    const grant = {
      id: "g1",
      ...buildPersistentGrantFromPlan(plan),
      createdAt: Date.now(),
    };
    assert.ok(persistentGrantMatchesPlan(plan, grant));
    assert.equal(findMatchingPersistentGrant(plan, [grant])?.id, "g1");
  });

  test("rejects grant with narrower action set", () => {
    const plan = planFromNaturalLanguage("Open Slack and summarize unread thread");
    const grant = {
      id: "g2",
      targetApp: "Slack",
      allowedActions: ["focus_app", "read_region"] as const,
      scope: plan.scope,
      maxSteps: plan.stepBudget,
      declaration: "narrow",
      createdAt: Date.now(),
    };
    assert.equal(persistentGrantMatchesPlan(plan, grant), false);
  });

  test("forbidden patterns always include close", () => {
    assert.ok(COMPUTER_OPERATOR_FORBIDDEN_PATTERNS.includes("close"));
    const plan = planFromNaturalLanguage("Open Slack");
    const grant = grantComputerOperatorSession(buildSessionGrantFromPlan(plan, "loop"), "user");
    const blocked = isOperatorActionAllowedByGrant(
      { kind: "type_text", text: "please close window" },
      grant,
    );
    assert.equal(blocked.ok, false);
  });
});

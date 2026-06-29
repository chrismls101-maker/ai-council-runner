import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGlassPathwayFromPayload,
  parseGeneratedPathway,
  parseGeneratedPathwayPayload,
  sanitizeGuidanceArray,
} from "../shared/glassPathwaysParse.ts";
import {
  derivePathwayDisplayStatus,
  GLASS_PATHWAYS_MAX_SAVED,
  pathwayProgressSummary,
} from "../shared/glassPathwaysProgress.ts";
import {
  buildPathwayAskRequest,
  buildPathwayGenerationPrompt,
  buildPathwayRefinementPrompt,
  inferPathwayDomainHint,
} from "../shared/glassPathwaysPrompts.ts";
import { assessPathwayQuality, pickPathwayAfterQualityCheck } from "../shared/glassPathwaysQuality.ts";
import {
  buildStageExplainPrompt,
  recommendedNextMove,
  resolveFocusStage,
  resolveNextStage,
  substepDoneAt,
} from "../shared/glassPathwaysGuidance.ts";
import {
  detectStagePrivacyHandoff,
  inferPathwayEscortTargets,
  isPathwaySettingsTarget,
} from "../shared/glassPathwaysEscort.ts";
import {
  assessPathwayExecutionEligibility,
  buildPathwayExecutionGoal,
} from "../shared/glassPathwaysExecution.ts";
import {
  inferPathwayConnectors,
  inferPathwayConnectorsForStage,
  pathwayConnectorById,
} from "../shared/glassPathwaysConnectors.ts";
import {
  resolvePathwayActionRoute,
  buildPathwayObservePrompt,
} from "../shared/glassPathwaysActionRouting.ts";
import {
  addPathway,
  addPathwayCheckpoint,
  beginNewPathwayDraft,
  beginPathwayLiveSession,
  endPathwayLiveSession,
  enterPrivacyHandoff,
  getActivePathway,
  markStageActive,
  markStageComplete,
  removePathway,
  switchActivePathway,
  toggleStageSubstep,
  upsertPathway,
  type GlassPathwaysStore,
} from "../renderer/builder/glassPathwaysStore.ts";
import {
  appendPathwayAudit,
  buildPathwayNarrativeSummary,
  createPathwayReceipt,
  receiptFromLiveSession,
} from "../shared/glassPathwaysRuntime.ts";
import {
  dispatchPathwayEvent,
  restorePathwayFromCheckpoint,
} from "../shared/glassPathwaysWorkflow.ts";
import type { GeneratedPathwayPayload, Pathway } from "../shared/glassPathwaysTypes.ts";

function richStage(i: number) {
  return {
    title: `macOS onboarding stage ${i + 1}`,
    objective: `Objective for Electron launch step ${i + 1}`,
    whyItMatters: `Skipping this hurts the macOS Electron launch because step ${i + 1} unlocks distribution.`,
    whatToReview: ["Problem statement draft", "User interview notes"],
    commonMistakes: ["Skipping permission copy review"],
    alethiaHelp: ["Pressure-test assumptions with Aletheia"],
    userActions: ["Write a one-page brief for this step"],
    completionCriteria: ["You can explain the outcome in one sentence"],
  };
}

function samplePayload(stageCount = 5): GeneratedPathwayPayload {
  const stages = Array.from({ length: stageCount }, (_, i) => richStage(i));
  return {
    title: "Launch pathway",
    summary: "A test pathway summary for the macOS Electron app launch.",
    domain: "app-launch",
    stages,
  };
}

function makePathway(goal = "goal", titleSuffix = ""): Pathway {
  const pathway = buildGlassPathwayFromPayload(goal, samplePayload(5)) as Pathway;
  if (titleSuffix) {
    return { ...pathway, id: `${pathway.id}-${titleSuffix}`, title: `${pathway.title} ${titleSuffix}` };
  }
  return pathway;
}

describe("glassPathwaysParse", () => {
  test("parses valid JSON payload with 5 stages", () => {
    const raw = JSON.stringify(samplePayload(5));
    const payload = parseGeneratedPathwayPayload(raw);
    assert.ok(payload);
    assert.equal(payload?.stages.length, 5);

    const pathway = parseGeneratedPathway("Launch my app", raw);
    assert.ok(pathway);
    assert.equal(pathway?.stages.length, 5);
    assert.equal(pathway?.goal, "Launch my app");
    assert.equal(pathway?.status, "ready");
    assert.equal(pathway?.stages[0]?.index, 1);
    assert.equal(pathway?.stages[0]?.status, "pending");
  });

  test("rejects fewer than 5 stages", () => {
    const raw = JSON.stringify(samplePayload(4));
    assert.equal(parseGeneratedPathwayPayload(raw), null);
  });

  test("strips markdown fences", () => {
    const raw = "```json\n" + JSON.stringify(samplePayload(6)) + "\n```";
    assert.ok(parseGeneratedPathwayPayload(raw));
  });

  test("rejects stages with empty whyItMatters", () => {
    const payload = samplePayload(5);
    payload.stages[0] = { ...payload.stages[0]!, whyItMatters: "" };
    const pathway = buildGlassPathwayFromPayload("Launch my macOS Electron app", payload);
    assert.equal(pathway, null);
  });

  test("sanitizeGuidanceArray strips placeholder items", () => {
    const cleaned = sanitizeGuidanceArray(["item 1", "Real review artifact", "mistake 1"]);
    assert.deepEqual(cleaned, ["Real review artifact"]);
  });
});

describe("glassPathwaysProgress", () => {
  test("derivePathwayDisplayStatus reflects stage progress", () => {
    const pathway = makePathway();
    assert.equal(derivePathwayDisplayStatus(pathway), "ready");

    const active = markStageActive(
      upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway),
      pathway.id,
      pathway.stages[0]!.id,
    ).pathways[0]!;
    assert.equal(derivePathwayDisplayStatus(active), "active");

    let completed = active;
    for (const stage of pathway.stages) {
      completed = markStageComplete(
        { pathways: [completed], activePathwayId: completed.id, selectedStageId: null, selectedStepId: null, liveSession: null },
        completed.id,
        stage.id,
      ).pathways[0]!;
    }
    assert.equal(derivePathwayDisplayStatus(completed), "completed");
  });

  test("pathwayProgressSummary counts completed stages", () => {
    const pathway = makePathway();
    assert.equal(pathwayProgressSummary(pathway), "0/5 stages · 0/5 steps");

    const oneDone = markStageComplete(
      upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway),
      pathway.id,
      pathway.stages[0]!.id,
    ).pathways[0]!;
    assert.equal(pathwayProgressSummary(oneDone), "1/5 stages · 1/5 steps");
  });
});

describe("glassPathwaysStore", () => {
  test("addPathway sets active pathway and preserves prior saved pathways", () => {
    const first = makePathway("goal one", "a");
    const second = makePathway("goal two", "b");
    let store = addPathway({ pathways: [], activePathwayId: null, selectedStageId: "x", selectedStepId: null }, first);
    store = addPathway(store, second);

    assert.equal(store.activePathwayId, second.id);
    assert.equal(store.selectedStageId, null);
    assert.equal(store.pathways.length, 2);
    assert.equal(store.pathways[0]?.id, second.id);
    assert.ok(store.pathways.some((p) => p.id === first.id));
  });

  test("addPathway enforces max saved count", () => {
    let store: GlassPathwaysStore = { pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null };
    for (let i = 0; i < GLASS_PATHWAYS_MAX_SAVED + 2; i += 1) {
      store = addPathway(store, makePathway(`goal ${i}`, String(i)));
    }
    assert.equal(store.pathways.length, GLASS_PATHWAYS_MAX_SAVED);
  });

  test("switchActivePathway changes active without losing pathways", () => {
    const first = makePathway("goal one", "a");
    const second = makePathway("goal two", "b");
    let store = addPathway(addPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, first), second);
    store = switchActivePathway(store, first.id);

    assert.equal(store.activePathwayId, first.id);
    assert.equal(getActivePathway(store)?.id, first.id);
    assert.equal(store.pathways.length, 2);
    assert.equal(store.selectedStageId, null);
  });

  test("beginNewPathwayDraft clears active selection for new goal entry", () => {
    const pathway = makePathway();
    const store = beginNewPathwayDraft(
      upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway),
    );
    assert.equal(store.activePathwayId, null);
    assert.equal(getActivePathway(store), null);
    assert.equal(store.pathways.length, 1);
  });

  test("removePathway drops entry and falls back to another active pathway", () => {
    const first = makePathway("goal one", "a");
    const second = makePathway("goal two", "b");
    let store = addPathway(addPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, first), second);
    store = removePathway(store, second.id);

    assert.equal(store.pathways.length, 1);
    assert.equal(store.activePathwayId, first.id);
    assert.equal(getActivePathway(store)?.id, first.id);
  });

  test("upsertPathway sets active pathway and clears selection", () => {
    const store: GlassPathwaysStore = { pathways: [], activePathwayId: null, selectedStageId: "x", selectedStepId: null };
    const pathway = makePathway();
    const next = upsertPathway(store, pathway);
    assert.equal(next.activePathwayId, pathway.id);
    assert.equal(next.selectedStageId, null);
    assert.equal(next.pathways.length, 1);
  });

  test("markStageActive demotes other active stages", () => {
    const pathway = makePathway();
    const store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);
    const stageA = pathway.stages[0]!.id;
    const stageB = pathway.stages[1]!.id;

    const afterA = markStageActive(store, pathway.id, stageA);
    const afterB = markStageActive(afterA, pathway.id, stageB);
    const updated = afterB.pathways[0]!;

    assert.equal(updated.stages.find((s) => s.id === stageB)?.status, "active");
    assert.equal(updated.stages.find((s) => s.id === stageA)?.status, "pending");
    assert.equal(updated.currentStageId, stageB);
  });

  test("markStageComplete marks pathway completed when all stages done", () => {
    const pathway = makePathway();
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);

    for (const stage of pathway.stages) {
      store = markStageComplete(store, pathway.id, stage.id);
    }

    assert.equal(store.pathways[0]?.status, "completed");
    assert.ok(store.pathways[0]?.stages.every((s) => s.status === "completed"));
  });

  test("addPathway preserves unrelated live session state", () => {
    const first = makePathway("First goal", "keep");
    const second = makePathway("Second goal", "new");
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, first);
    store = beginPathwayLiveSession(store, {
      pathwayId: first.id,
      stageId: first.stages[0]!.id,
      mode: "escort",
      targetLabel: "Test",
    });
    store = addPathway(store, second);
    assert.equal(store.liveSession?.mode, "escort");
    assert.equal(store.liveSession?.pathwayId, first.id);
  });
});

describe("glassPathwaysPrompts", () => {
  test("inferPathwayDomainHint classifies common goals", () => {
    assert.equal(inferPathwayDomainHint("Launch my macOS Electron app"), "app-launch");
    assert.equal(inferPathwayDomainHint("Plan our destination wedding"), "life-event");
    assert.equal(inferPathwayDomainHint("Write and publish my book"), "book");
    assert.equal(inferPathwayDomainHint("Create an online course on design"), "course");
    assert.equal(inferPathwayDomainHint("Career switch into staff engineering"), "career");
    assert.equal(inferPathwayDomainHint("Organize the garage"), "general");
  });

  test("buildPathwayGenerationPrompt includes domain archetypes and avoids placeholders", () => {
    const prompt = buildPathwayGenerationPrompt("Launch my macOS Electron app", "app-launch");
    assert.match(prompt, /notarization/i);
    assert.match(prompt, /Aletheia/);
    assert.match(prompt, /concrete artifact or question/);
    assert.doesNotMatch(prompt, /\["item 1"/);
    assert.doesNotMatch(prompt, /\["done when/);
  });

  test("buildPathwayAskRequest uses pathway purpose and suppresses profile", () => {
    const req = buildPathwayAskRequest("Launch my macOS Electron app");
    assert.equal(req.modelPurpose, "pathway");
    assert.equal(req.responseStyle, "full");
    assert.equal(req.suppressUserProfile, true);
    assert.equal(req.domainHint, "app-launch");
    assert.match(req.prompt, /macOS Electron app/);
  });

  test("buildPathwayRefinementPrompt includes quality issues", () => {
    const prompt = buildPathwayRefinementPrompt("Launch app", ["Too generic stage titles"], "app-launch");
    assert.match(prompt, /Too generic stage titles/);
    assert.match(prompt, /previous attempt was too generic/i);
  });
});

describe("glassPathwaysQuality", () => {
  test("assessPathwayQuality accepts rich pathways", () => {
    const pathway = makePathway("Launch my macOS Electron app with onboarding");
    const result = assessPathwayQuality(pathway);
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  test("assessPathwayQuality flags generic and hollow stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    pathway.stages[0] = {
      ...pathway.stages[0]!,
      title: "Review progress",
      whyItMatters: "This stage moves you closer to your goal.",
      whatToReview: [],
      commonMistakes: [],
      alethiaHelp: [],
      userActions: [],
      completionCriteria: [],
      stepIds: [],
    };
    pathway.steps = pathway.steps.filter((s) => s.stageId !== pathway.stages[0]!.id);
    const result = assessPathwayQuality(pathway);
    assert.equal(result.ok, false);
    assert.ok(result.issues.length >= 2);
  });

  test("assessPathwayQuality allows specific titles without per-stage keyword match", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    pathway.stages.forEach((stage, i) => {
      stage.title = i === 0 ? "macOS onboarding plan" : `Notarization step ${i + 1}`;
    });
    const result = assessPathwayQuality(pathway);
    assert.equal(result.ok, true);
  });
});

describe("glassPathwaysGuidance", () => {
  test("resolveFocusStage prefers active stage", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stageId = pathway.stages[1]!.id;
    const store = markStageActive(
      upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway),
      pathway.id,
      stageId,
    );
    const focus = resolveFocusStage(store.pathways[0]!);
    assert.equal(focus?.id, stageId);
  });

  test("resolveNextStage returns the following incomplete stage", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const focus = pathway.stages[0]!;
    const next = resolveNextStage(pathway, focus);
    assert.equal(next?.index, 2);
  });

  test("recommendedNextMove prefers first user action", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    assert.equal(recommendedNextMove(stage, pathway), stage.userActions?.[0]);
  });

  test("buildStageExplainPrompt includes pathway and stage context", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const prompt = buildStageExplainPrompt(pathway, stage);
    assert.match(prompt, /Glass Pathway stage/);
    assert.ok(prompt.includes(stage.title));
  });

  test("toggleStageSubstep persists completion flags", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);
    const stageId = pathway.stages[0]!.id;
    store = toggleStageSubstep(store, pathway.id, stageId, 0);
    const stage = store.pathways[0]!.stages[0]!;
    assert.equal(substepDoneAt(stage, 0), true);
    assert.equal(substepDoneAt(stage, 1), false);
  });
});

describe("glassPathwaysEscort", () => {
  test("detectStagePrivacyHandoff flags credential-heavy stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.userActions = ["Sign in to App Store Connect and enter your API key"];
    const privacy = detectStagePrivacyHandoff(stage, pathway);
    assert.equal(privacy.needed, true);
    assert.match(privacy.reason, /credentials/i);
  });

  test("inferPathwayEscortTargets suggests developer portal for notarization stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.title = "Plan notarization and codesign";
    const targets = inferPathwayEscortTargets(stage, pathway);
    assert.ok(targets.some((t) => t.label === "Apple Developer"));
  });

  test("isPathwaySettingsTarget validates settings keys", () => {
    assert.equal(isPathwaySettingsTarget("accessibility"), true);
    assert.equal(isPathwaySettingsTarget("invalid"), false);
  });

  test("begin and end pathway live session records receipts", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);
    const withSession = beginPathwayLiveSession(store, {
      pathwayId: pathway.id,
      stageId: pathway.stages[0]!.id,
      mode: "escort",
      targetLabel: "Xcode",
    });
    assert.equal(withSession.liveSession?.mode, "escort");
    assert.ok((getActivePathway(withSession)?.audit.length ?? 0) >= 1);
    const cleared = endPathwayLiveSession(withSession);
    assert.equal(cleared.liveSession, null);
    assert.ok((getActivePathway(cleared)?.audit.length ?? 0) >= 2);
  });

  test("privacy live session does not duplicate workflow audit receipts", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);
    store = enterPrivacyHandoff(store, pathway.id, pathway.stages[0]!.id, "credentials");
    const auditAfterHandoff = getActivePathway(store)?.audit.length ?? 0;
    assert.ok(auditAfterHandoff >= 1);
    store = beginPathwayLiveSession(store, {
      pathwayId: pathway.id,
      stageId: pathway.stages[0]!.id,
      mode: "privacy",
      privacyReason: "credentials",
    });
    assert.equal(getActivePathway(store)?.audit.length, auditAfterHandoff);
    store = endPathwayLiveSession(store);
    assert.equal(getActivePathway(store)?.audit.length, auditAfterHandoff);
  });

  test("switchActivePathway abandons live session from other pathway", () => {
    const first = makePathway("First", "a");
    const second = makePathway("Second", "b");
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, first);
    store = upsertPathway(store, second);
    store = beginPathwayLiveSession(store, {
      pathwayId: first.id,
      stageId: first.stages[0]!.id,
      mode: "escort",
      targetLabel: "Test",
    });
    store = switchActivePathway(store, second.id);
    assert.equal(store.liveSession, null);
    const firstPathway = store.pathways.find((p) => p.id === first.id);
    assert.ok((firstPathway?.audit.length ?? 0) >= 2);
  });
});

describe("glassPathwaysExecution", () => {
  test("buildPathwayExecutionGoal scopes to stage and forbids destructive actions", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const goal = buildPathwayExecutionGoal(pathway, stage);
    assert.match(goal, /Stage 1/);
    assert.match(goal, /Do not send, delete/);
    assert.match(goal, /credentials/i);
  });

  test("assessPathwayExecutionEligibility blocks privacy stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.userActions = ["Enter your Apple ID password in Keychain Access"];
    const result = assessPathwayExecutionEligibility(pathway, stage);
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /privacy handoff/i);
  });

  test("assessPathwayExecutionEligibility blocks during escort session", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const result = assessPathwayExecutionEligibility(pathway, stage, { liveSessionMode: "escort" });
    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /escort/i);
  });

  test("assessPathwayExecutionEligibility allows actionable stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const result = assessPathwayExecutionEligibility(pathway, stage);
    assert.equal(result.allowed, true);
  });

  test("assessPathwayExecutionEligibility defers to connector route unless fallback", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const blocked = assessPathwayExecutionEligibility(pathway, stage, { primaryRoute: "connector" });
    assert.equal(blocked.allowed, false);
    const allowed = assessPathwayExecutionEligibility(pathway, stage, {
      primaryRoute: "connector",
      explicitFallback: true,
    });
    assert.equal(allowed.allowed, true);
  });
});

describe("glassPathwaysConnectors", () => {
  test("inferPathwayConnectors prefers available GitHub over needs_connection Slack", () => {
    const corpus = "Review the GitHub pull request and check Slack for updates";
    const matches = inferPathwayConnectors(corpus);
    assert.equal(matches[0]?.connector.id, "github");
    assert.ok(matches.some((m) => m.connector.id === "slack"));
  });

  test("inferPathwayConnectorsForStage prefers stage text over pathway goal", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.userActions = ["Summarize unread Slack threads"];
    const matches = inferPathwayConnectorsForStage(stage, pathway);
    assert.equal(matches[0]?.connector.id, "slack");
  });

  test("pathwayConnectorById resolves catalog entries", () => {
    assert.equal(pathwayConnectorById("notion")?.label, "Notion");
    assert.equal(pathwayConnectorById("missing"), undefined);
  });
});

describe("glassPathwaysActionRouting", () => {
  test("resolvePathwayActionRoute chooses connector for Slack stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.userActions = ["Summarize unread Slack threads for the team"];
    const plan = resolvePathwayActionRoute(pathway, stage);
    assert.equal(plan.primary, "connector");
    assert.equal(plan.connector?.connector.id, "slack");
    assert.equal(plan.operatorFallback, true);
  });

  test("resolvePathwayActionRoute chooses observe for review-heavy stages", () => {
    const pathway = makePathway("Plan a wedding");
    const stage = pathway.stages[0]!;
    stage.title = "Review vendor contracts";
    stage.whatToReview = ["Compare catering proposals"];
    stage.userActions = ["Read each proposal and note red flags"];
    const plan = resolvePathwayActionRoute(pathway, stage);
    assert.equal(plan.primary, "observe");
  });

  test("resolvePathwayActionRoute chooses manual for privacy stages", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    stage.userActions = ["Enter your API key in the developer portal"];
    const plan = resolvePathwayActionRoute(pathway, stage);
    assert.equal(plan.primary, "manual");
  });

  test("buildPathwayObservePrompt scopes observational guidance", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage = pathway.stages[0]!;
    const prompt = buildPathwayObservePrompt(pathway, stage);
    assert.match(prompt, /observational guidance only/i);
    assert.match(prompt, /do not click/i);
  });
});

describe("glassPathwaysRuntime", () => {
  test("buildPathwayNarrativeSummary reflects live session", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const liveSession = {
      pathwayId: pathway.id,
      stageId: pathway.stages[0]!.id,
      mode: "privacy" as const,
      startedAt: new Date().toISOString(),
    };
    const summary = buildPathwayNarrativeSummary(pathway, liveSession);
    assert.match(summary, /privacy/i);
    assert.match(summary, /Stage 1/);
  });

  test("addPathwayCheckpoint appends checkpoint receipt", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    let store = upsertPathway({ pathways: [], activePathwayId: null, selectedStageId: null, selectedStepId: null, liveSession: null }, pathway);
    store = addPathwayCheckpoint(store, pathway.id, pathway.stages[0]!.id, "Paused for lunch");
    const receipts = getActivePathway(store)?.audit ?? [];
    assert.equal(receipts.at(-1)?.kind, "checkpoint_created");
  });

  test("appendPathwayAudit caps history", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const receipts = Array.from({ length: 90 }, (_, i) =>
      createPathwayReceipt({
        pathwayId: pathway.id,
        stageId: pathway.stages[0]!.id,
        kind: "checkpoint_created",
        summary: `Checkpoint ${i}`,
      }),
    );
    const updated = appendPathwayAudit(pathway, receipts);
    assert.equal(updated.audit.length, 80);
  });

  test("receiptFromLiveSession maps execution end", () => {
    const receipt = receiptFromLiveSession(
      {
        pathwayId: "p1",
        stageId: "s1",
        mode: "execution",
        executionGoal: "Do the thing",
        startedAt: new Date().toISOString(),
      },
      "ended",
    );
    assert.equal(receipt.kind, "operator_completed");
  });
});

describe("glassPathwaysWorkflow", () => {
  test("pathway has steps derived from userActions", () => {
    const pathway = makePathway();
    assert.ok(pathway.steps.length >= pathway.stages.length);
    assert.ok(pathway.context.userGoal.length > 0);
    assert.ok(pathway.audit.some((r) => r.kind === "pathway_created"));
  });

  test("STAGE_START sets current step and emits receipts", () => {
    const pathway = makePathway();
    const stageId = pathway.stages[0]!.id;
    const updated = dispatchPathwayEvent(pathway, {
      type: "STAGE_START",
      pathwayId: pathway.id,
      stageId,
    });
    assert.equal(updated.currentStageId, stageId);
    assert.ok(updated.currentStepId);
    assert.equal(updated.status, "active");
    assert.ok(updated.audit.some((r) => r.kind === "stage_started"));
  });

  test("CHECKPOINT_CREATE stores restorable snapshot", () => {
    const pathway = makePathway();
    const stageId = pathway.stages[0]!.id;
    let updated = dispatchPathwayEvent(pathway, {
      type: "STAGE_START",
      pathwayId: pathway.id,
      stageId,
    });
    updated = dispatchPathwayEvent(updated, {
      type: "CHECKPOINT_CREATE",
      pathwayId: pathway.id,
      stageId,
      reason: "manual_pause",
      note: "Lunch break",
    });
    assert.equal(updated.checkpoints.length, 1);
    const cp = updated.checkpoints[0]!;
    const restored = restorePathwayFromCheckpoint(updated, cp.id);
    assert.ok(restored);
    assert.equal(restored?.status, updated.status);
    assert.equal(restored?.context.userGoal, updated.context.userGoal);
  });

  test("PRIVACY_HANDOFF_ENTER sets pathway status and pending handoff", () => {
    const pathway = makePathway();
    const stage = pathway.stages[0]!;
    const step = pathway.steps.find((s) => s.stageId === stage.id)!;
    const updated = dispatchPathwayEvent(pathway, {
      type: "PRIVACY_HANDOFF_ENTER",
      handoff: {
        id: "handoff_test",
        pathwayId: pathway.id,
        stageId: stage.id,
        stepId: step.id,
        reason: "Credentials required",
        suspendObservation: true,
        suspendActions: true,
        expectedUserTask: step.description,
        resumePhrases: ["I'm ready"],
        state: "pending",
        enteredAt: new Date().toISOString(),
      },
    });
    assert.equal(updated.status, "privacy_handoff");
    assert.ok(updated.pendingHandoff);
    assert.ok(updated.checkpoints.some((c) => c.reason === "before_privacy_handoff"));
  });
});

describe("glassPathwaysServiceLogic", () => {
  test("pickPathwayAfterQualityCheck returns retry prompt when quality fails", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    const stage0 = pathway.stages[0]!;
    stage0.userActions = [];
    stage0.stepIds = [];
    pathway.steps = pathway.steps.filter((s) => s.stageId !== stage0.id);
    const result = pickPathwayAfterQualityCheck(
      pathway,
      0,
      2,
      (issues) => buildPathwayRefinementPrompt(pathway.goal, issues, "app-launch"),
    );
    assert.ok(result.retryPrompt);
    assert.match(result.retryPrompt!, /previous attempt was too generic/i);
    assert.equal(result.pathway, undefined);
  });

  test("pickPathwayAfterQualityCheck returns pathway on final attempt", () => {
    const pathway = makePathway("Launch my macOS Electron app");
    pathway.stages[0]!.userActions = [];
    const result = pickPathwayAfterQualityCheck(
      pathway,
      1,
      2,
      (issues) => buildPathwayRefinementPrompt(pathway.goal, issues, "app-launch"),
    );
    assert.equal(result.pathway, pathway);
    assert.equal(result.retryPrompt, undefined);
  });
});

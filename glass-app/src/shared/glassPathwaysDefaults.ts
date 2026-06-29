/**
 * Glass Pathways — default policy objects and id helpers.
 */

import type {
  GatePolicy,
  PathwayCapabilities,
  PathwayContext,
  PrivacyPolicy,
  RetryPolicy,
  RiskLevel,
  StepMode,
} from "./glassPathwaysTypes.ts";

export function createPathwayId(prefix = "pathway"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultPathwayContext(goal: string, title: string, summary: string): PathwayContext {
  return {
    userGoal: goal.trim(),
    currentNarrative: summary.trim() || title.trim(),
    domainFacts: {},
    decisionsMade: [],
    openQuestions: [],
    knownCredentials: [],
    linkedApps: [],
    discoveredResources: [],
    artifacts: [],
    notes: [],
  };
}

export function defaultPathwayCapabilities(): PathwayCapabilities {
  return {
    allowResearch: true,
    allowEscort: true,
    allowOperator: true,
    allowConnectors: true,
    allowVoiceResume: true,
    allowPrivacyHandoff: true,
    allowAutoAdvanceStages: false,
    operatorGrantMode: "per_step",
  };
}

export function defaultGatePolicy(riskLevel: RiskLevel = "read_safe"): GatePolicy {
  return {
    requiresApproval: riskLevel === "write_requires_confirmation"
      || riskLevel === "destructive"
      || riskLevel === "sensitive_private",
    approvalOnRiskLevels: [
      "write_requires_confirmation",
      "sensitive_private",
      "destructive",
    ],
    expiresAfterMinutes: 30,
  };
}

export function defaultPrivacyPolicy(): PrivacyPolicy {
  return {
    requiresPrivacyMode: false,
    triggerOnCredentialEntry: true,
    triggerOnPaymentEntry: true,
    triggerOnIdentityVerification: true,
    triggerOnSensitiveDocs: true,
  };
}

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 2,
    backoffMs: 1500,
    failTo: "awaiting_input",
  };
}

export function inferStepModeFromText(text: string): StepMode {
  const lower = text.toLowerCase();
  if (/\b(research|look up|benchmark|compare vendors|market scan)\b/.test(lower)) {
    return "research";
  }
  if (/\b(open|navigate|go to|settings|safari|xcode|app store)\b/.test(lower)) {
    return "escort";
  }
  if (/\b(password|sign in|billing|payment|private|credentials)\b/.test(lower)) {
    return "privacy";
  }
  if (/\b(click|type|fill|submit|install|configure|drag)\b/.test(lower)) {
    return "operator";
  }
  return "guide";
}

export function inferRiskLevelFromMode(mode: StepMode): RiskLevel {
  switch (mode) {
    case "operator":
      return "write_requires_confirmation";
    case "privacy":
      return "sensitive_private";
    case "escort":
      return "navigational";
    case "research":
      return "read_safe";
    case "guide":
    default:
      return "advisory";
  }
}

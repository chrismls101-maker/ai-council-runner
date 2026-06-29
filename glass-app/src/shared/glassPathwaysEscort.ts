/**
 * Glass Pathways — escort targets and privacy handoff heuristics (Phase 5).
 * Pure module: no Electron imports.
 */

import type { Pathway, Stage } from "./glassPathwaysTypes.ts";
import { stageUserActions } from "./glassPathwaysTypes.ts";

export type PathwayEscortTargetKind = "url" | "settings";

export type PathwaySettingsTarget =
  | "screenRecording"
  | "microphone"
  | "privacy"
  | "audioMidi"
  | "sound"
  | "accessibility";

export interface PathwayEscortTarget {
  id: string;
  label: string;
  kind: PathwayEscortTargetKind;
  destination: string;
}

export interface PathwayPrivacyHandoff {
  needed: boolean;
  reason: string;
}

const PRIVACY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(password|credentials?|sign[\s-]?in|log[\s-]?in|api[\s-]?key|secret|2fa|mfa)\b/i, reason: "This step likely involves credentials or secrets." },
  { re: /\b(billing|payment|credit card|bank|checkout|purchase)\b/i, reason: "This step likely involves billing or payment details." },
  { re: /\b(ssn|social security|passport|identity verification|kyc)\b/i, reason: "This step likely involves personal identity information." },
  { re: /\b(private message|dm someone|personal email)\b/i, reason: "This step may involve private communications." },
];

const ESCORT_RULES: Array<{
  re: RegExp;
  target: Omit<PathwayEscortTarget, "id">;
}> = [
  {
    re: /\b(app store connect|testflight|developer portal|notariz|codesign|developer id)\b/i,
    target: {
      label: "Apple Developer",
      kind: "url",
      destination: "https://developer.apple.com/account",
    },
  },
  {
    re: /\b(accessibility permission|accessibility settings)\b/i,
    target: {
      label: "Accessibility settings",
      kind: "settings",
      destination: "accessibility",
    },
  },
  {
    re: /\b(screen recording|screen capture permission)\b/i,
    target: {
      label: "Screen Recording settings",
      kind: "settings",
      destination: "screenRecording",
    },
  },
  {
    re: /\b(microphone permission|mic permission)\b/i,
    target: {
      label: "Microphone settings",
      kind: "settings",
      destination: "microphone",
    },
  },
  {
    re: /\b(blackhole|audio midi|sound settings|output device)\b/i,
    target: {
      label: "Audio MIDI Setup",
      kind: "settings",
      destination: "audioMidi",
    },
  },
  {
    re: /\b(github|pull request|repository)\b/i,
    target: {
      label: "GitHub",
      kind: "url",
      destination: "https://github.com",
    },
  },
  {
    re: /\b(safari|browser|website|landing page)\b/i,
    target: {
      label: "Safari",
      kind: "url",
      destination: "https://www.apple.com/safari/",
    },
  },
  {
    re: /\b(xcode|swiftui|ios simulator)\b/i,
    target: {
      label: "Xcode",
      kind: "url",
      destination: "file:///Applications/Xcode.app",
    },
  },
];

function stageCorpus(stage: Stage, pathway: Pathway): string {
  return [
    pathway.goal,
    pathway.title,
    stage.title,
    stage.objective,
    stage.whyItMatters,
    ...(stage.whatToReview ?? []),
    ...(stage.inputsNeeded ?? []),
    ...stage.commonMistakes,
    ...(stage.alethiaHelp ?? []),
    ...stageUserActions(stage),
    ...stage.completionCriteria.map((c) => c.description),
  ].join("\n");
}

export function detectStagePrivacyHandoff(
  stage: Stage,
  pathway: Pathway,
): PathwayPrivacyHandoff {
  const corpus = stageCorpus(stage, pathway);
  for (const { re, reason } of PRIVACY_PATTERNS) {
    if (re.test(corpus)) return { needed: true, reason };
  }
  return { needed: false, reason: "" };
}

export function inferPathwayEscortTargets(
  stage: Stage,
  pathway: Pathway,
): PathwayEscortTarget[] {
  const corpus = stageCorpus(stage, pathway);
  const targets: PathwayEscortTarget[] = [];
  const seen = new Set<string>();

  for (const rule of ESCORT_RULES) {
    if (!rule.re.test(corpus)) continue;
    const key = `${rule.target.kind}:${rule.target.destination}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      id: key,
      ...rule.target,
    });
  }

  return targets.slice(0, 4);
}

export function isPathwaySettingsTarget(value: string): value is PathwaySettingsTarget {
  return (
    value === "screenRecording"
    || value === "microphone"
    || value === "privacy"
    || value === "audioMidi"
    || value === "sound"
    || value === "accessibility"
  );
}

export function buildEscortObservePrompt(
  pathway: Pathway,
  stage: Stage,
  targetLabel: string,
): string {
  return [
    `I'm working through a Glass Pathway and just opened ${targetLabel} for escort mode.`,
    "Guide me through what to look for on screen for this stage — observational guidance only, no clicking for me.",
    "",
    `Pathway: ${pathway.title}`,
    `Goal: ${pathway.goal}`,
    `Stage ${stage.index}: ${stage.title}`,
    `Objective: ${stage.objective}`,
  ].join("\n");
}

export function buildPrivacyHandoffInstructions(
  stage: Stage,
  reason: string,
): string {
  const actions = stageUserActions(stage);
  return [
    "Complete this step privately. Aletheia will stay paused until you say you're ready.",
    "",
    reason,
    "",
    `Stage: ${stage.title}`,
    actions.length
      ? `Your actions: ${actions.join("; ")}`
      : `Objective: ${stage.objective}`,
  ].join("\n");
}

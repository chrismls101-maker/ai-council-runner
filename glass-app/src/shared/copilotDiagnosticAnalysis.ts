/**
 * User-approved diagnostic root-cause analysis (direct AI + deterministic fallback).
 */

import type { DiagnosticPacket } from "./copilotDiagnostic.ts";

export interface GlassCopilotDiagnosticResult {
  id: string;
  rootCauseSummary: string;
  probableRootCause: string;
  evidence: string[];
  missingEvidence: string[];
  nextActions: string[];
  suggestedPrompt: string;
  fullMarkdown: string;
  aiEnhanced: boolean;
  createdAt: string;
}

export interface DiagnosticAnalysisContext {
  transcript?: string;
  recentCommands?: string[];
  recentResponses?: string[];
  sourceApp?: string;
  sourceTitle?: string;
  visualSummary?: string;
}

export function buildDiagnosticAnalysisPrompt(
  packet: DiagnosticPacket,
  context: DiagnosticAnalysisContext,
): string {
  const lines = [
    "You are IIVO Glass performing a user-approved diagnostic (direct answer only — NOT Council).",
    "Analyze the structured signals and return sections:",
    "## Probable root cause",
    "## Evidence",
    "## What is still missing",
    "## Next 3 actions",
    "## Suggested prompt",
    "",
    `Category: ${packet.likelyCategory.replace(/_/g, " ")}`,
    "",
    "Observed symptoms:",
    ...packet.observedSymptoms.map((s) => `- ${s}`),
    "",
    "Repeated signals:",
    ...(packet.repeatedSignals.length
      ? packet.repeatedSignals.map((s) => `- ${s}`)
      : ["- (none)"]),
    "",
    "Timeline:",
    ...packet.timeline.map((t) => `- ${t}`),
    "",
    "Missing evidence:",
    ...packet.missingEvidence.map((m) => `- ${m}`),
    "",
    `Focus: ${packet.suggestedQuestion}`,
  ];
  if (context.sourceApp || context.sourceTitle) {
    lines.push("", `App/window: ${[context.sourceApp, context.sourceTitle].filter(Boolean).join(" — ")}`);
  }
  if (context.transcript?.trim()) {
    lines.push("", "Recent transcript:", context.transcript.trim().slice(-1000));
  }
  if (context.recentCommands?.length) {
    lines.push("", "Recent commands:", ...context.recentCommands.slice(-6).map((c) => `- ${c}`));
  }
  if (context.recentResponses?.length) {
    lines.push("", "Recent responses:", ...context.recentResponses.slice(-4).map((r) => `- ${r.slice(0, 200)}`));
  }
  if (context.visualSummary?.trim()) {
    lines.push("", "Screen/visual context:", context.visualSummary.trim().slice(0, 500));
  }
  lines.push("", "Include what you see on the attached screen capture if provided.");
  return lines.join("\n");
}

function extractSection(markdown: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n##|$)`, "i");
  const match = markdown.match(re);
  if (!match) return "";
  return match[0].replace(/^##[^\n]*\n?/i, "").trim();
}

function bulletItems(section: string): string[] {
  return section
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function parseDiagnosticAnalysisResponse(
  text: string,
  id: string,
  createdAt: string,
): GlassCopilotDiagnosticResult {
  const fullMarkdown = text.trim();
  const root = extractSection(fullMarkdown, "Probable root cause");
  const evidence = bulletItems(extractSection(fullMarkdown, "Evidence"));
  const missing = bulletItems(extractSection(fullMarkdown, "What is still missing"));
  const actions = bulletItems(extractSection(fullMarkdown, "Next 3 actions")).slice(0, 3);
  const suggested = extractSection(fullMarkdown, "Suggested prompt").split("\n")[0]?.trim() ?? "";

  const probableRootCause = root || fullMarkdown.split("\n")[0]?.trim() || "Unknown root cause.";
  const rootCauseSummary =
    probableRootCause.length > 140 ? `${probableRootCause.slice(0, 137)}…` : probableRootCause;

  return {
    id,
    rootCauseSummary,
    probableRootCause,
    evidence: evidence.length ? evidence : ["See full diagnostic details."],
    missingEvidence: missing.length ? missing : [],
    nextActions: actions.length ? actions : ["Review the error context.", "Retry the failing step.", "Capture a fresh screenshot."],
    suggestedPrompt: suggested || "Help me fix the issue shown on my screen.",
    fullMarkdown,
    aiEnhanced: true,
    createdAt,
  };
}

export function buildDeterministicDiagnosticFallback(
  packet: DiagnosticPacket,
  id: string,
  createdAt: string,
): GlassCopilotDiagnosticResult {
  const probableRootCause =
    packet.observedSymptoms[0] ?? `Repeated ${packet.likelyCategory.replace(/_/g, " ")} pattern detected.`;
  const markdown = [
    "## Probable root cause",
    probableRootCause,
    "",
    "## Evidence",
    ...packet.observedSymptoms.map((s) => `- ${s}`),
    "",
    "## What is still missing",
    ...packet.missingEvidence.map((m) => `- ${m}`),
    "",
    "## Next 3 actions",
    "- Confirm the exact error message on screen.",
    "- Retry the last step with fresh permissions/device selection.",
    "- Capture a screenshot and ask IIVO to diagnose again.",
    "",
    "## Suggested prompt",
    packet.suggestedQuestion,
  ].join("\n");

  return {
    id,
    rootCauseSummary: probableRootCause.slice(0, 140),
    probableRootCause,
    evidence: packet.observedSymptoms,
    missingEvidence: packet.missingEvidence,
    nextActions: [
      "Confirm the exact error on screen.",
      "Retry with permissions/device routing verified.",
      "Run Diagnose again after a fresh capture.",
    ],
    suggestedPrompt: packet.suggestedQuestion,
    fullMarkdown: markdown,
    aiEnhanced: false,
    createdAt,
  };
}

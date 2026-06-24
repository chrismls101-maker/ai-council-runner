/**
 * Pure helpers for Glass Build Loop — safe to import from tests without Electron.
 */

import type { CoderBuildLoopHost } from "./coderBuildLoopHost.ts";

export const CODER_LOOP_MAX_ITERATIONS = 4;

export function verifyCommandKind(command: string): "types" | "build" | "test" | "other" {
  const c = command.trim().toLowerCase();
  if (c.includes("typecheck") || c.includes("type-check") || c.includes("tsc")) return "types";
  if (/\btest\b/.test(c)) return "test";
  if (c.includes("build")) return "build";
  return "other";
}

export function verifyRunningLabel(command?: string): string {
  if (!command?.trim()) return "Running project check…";
  switch (verifyCommandKind(command)) {
    case "types": return "Checking types…";
    case "build": return "Running build…";
    case "test": return "Running tests…";
    default: return `Running ${command.trim()}…`;
  }
}

export function verifyPassLabel(command?: string): string {
  if (!command?.trim()) return "✓ Build check passed";
  switch (verifyCommandKind(command)) {
    case "types": return "✓ TypeScript clean";
    case "build": return "✓ Build passed";
    case "test": return "✓ Tests passed";
    default: return `✓ ${command.trim()} passed`;
  }
}

export function verifyFailLabel(command?: string): string {
  if (!command?.trim()) return "✗ Check failed";
  switch (verifyCommandKind(command)) {
    case "types": return "✗ Type errors found";
    case "build": return "✗ Build failed";
    case "test": return "✗ Tests failed";
    default: return `✗ ${command.trim()} failed`;
  }
}

export function verifyPassNarration(command?: string): string {
  if (!command?.trim()) return "Build check passed.";
  switch (verifyCommandKind(command)) {
    case "types": return "TypeScript clean.";
    case "build": return "Build passed.";
    case "test": return "Tests passed.";
    default: return "Build check passed.";
  }
}

export function verifyStartNarration(command?: string): string {
  if (!command?.trim()) return "Running build check…";
  switch (verifyCommandKind(command)) {
    case "types": return "Checking TypeScript…";
    case "build": return "Running build…";
    case "test": return "Running tests…";
    default: return "Running build check…";
  }
}

export function verifyFailNarration(command?: string): string {
  if (!command?.trim()) return "Build check failed.";
  switch (verifyCommandKind(command)) {
    case "types": return "Type errors found.";
    case "build": return "Build failed.";
    case "test": return "Tests failed.";
    default: return "Build check failed.";
  }
}

export function reviewLooksClean(findings: string): boolean {
  const text = findings.trim();
  if (!text) return false;

  // "looks good, but …" / "seems fine however …" — not clean
  if (
    /\b(looks?|seems?)\s+(good|correct|clean|fine)\b[^.!?\n]{0,60}\b(but|however|although|though|except)\b/i
      .test(text)
  ) {
    return false;
  }

  const hasCleanPhrase = /\b(looks? (good|correct|clean|fine)|no (issues?|bugs?|problems?)( found)?|nothing to (fix|change)|appears? correct)\b/i
    .test(text);
  if (!hasCleanPhrase) return false;

  // Strip explicit "no issues" negatives, then reject remaining issue language
  const withoutCleanNegatives = text.replace(/\bno (issues?|bugs?|problems?)( found)?\b/gi, "");
  if (
    /\b(fix|bug|error|issue|problem|missing|incorrect|wrong|broken|vulnerab|should|must|recommend|consider)\b/i
      .test(withoutCleanNegatives)
  ) {
    return false;
  }

  // Markdown bullets / numbered lists usually mean actionable findings
  if (/^[\s]*[-*]\s+/m.test(text) || /^[\s]*\d+\.\s+/m.test(text)) {
    return false;
  }

  return true;
}

export function buildVerifyFixPrompt(errorOutput: string): string {
  return [
    "The build/typecheck produced these errors after your last changes:",
    "",
    "```",
    errorOutput.slice(0, 3000),
    "```",
    "",
    "Fix all errors. Read each referenced file before editing.",
  ].join("\n");
}

export function buildReviewFixPrompt(findings: string): string {
  return [
    "A code review identified the following issues in your last changes:",
    "",
    findings.slice(0, 3000),
    "",
    "Address each issue. Read the relevant files before editing.",
  ].join("\n");
}

export function canStartLoopFix(host: CoderBuildLoopHost): boolean {
  return (host.getLoopIteration() ?? 1) < CODER_LOOP_MAX_ITERATIONS;
}

export function incrementLoopForFix(host: CoderBuildLoopHost): number {
  const next = (host.getLoopIteration() ?? 1) + 1;
  host.setLoopIteration(next);
  return next;
}

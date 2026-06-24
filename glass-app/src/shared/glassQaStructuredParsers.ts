/**
 * Glass QA — structured failure parsers for fix-loop convergence.
 */

import type { QaStructuredFailure } from "./glassQaPipeline.ts";

const MAX_FAILURES = 12;

export function parseTypeScriptDiagnostics(output: string): QaStructuredFailure[] {
  const failures: QaStructuredFailure[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
    if (!match) continue;
    failures.push({
      source: "types",
      severity: "error",
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5].trim(),
      rawExcerpt: line.trim(),
    });
    if (failures.length >= MAX_FAILURES) break;
  }
  return failures;
}

export function parseVitestFailures(output: string): QaStructuredFailure[] {
  const failures: QaStructuredFailure[] = [];
  const failBlocks = output.split(/\n(?=FAIL\s+)/);
  for (const block of failBlocks) {
    if (!block.startsWith("FAIL ")) continue;
    const header = block.match(/^FAIL\s+(.+?)(?:\s+>\s+(.+))?$/m);
    const file = header?.[1]?.trim();
    const testName = header?.[2]?.trim() ?? header?.[1]?.trim();
    const assertion = block.match(/AssertionError:\s*(.+)/)
      ?? block.match(/Expected:\s*(.+)\n\s*Received:\s*(.+)/);
    const expectedReceived = block.match(/Expected:\s*["']?(.+?)["']?\s*\n\s*Received:\s*["']?(.+?)["']?\s*$/m);
    const atLine = block.match(/at\s+.+?\((.+?):(\d+):\d+\)/);
    failures.push({
      source: "tests",
      severity: "error",
      file: atLine?.[1] ?? file,
      line: atLine?.[2] ? parseInt(atLine[2], 10) : undefined,
      testName,
      message: assertion?.[1]?.trim() ?? "Test failed",
      expected: expectedReceived?.[1]?.trim(),
      actual: expectedReceived?.[2]?.trim(),
      rawExcerpt: block.split("\n").slice(0, 6).join("\n").trim(),
    });
    if (failures.length >= MAX_FAILURES) break;
  }
  return failures;
}

export function parseJestFailures(output: string): QaStructuredFailure[] {
  const failures: QaStructuredFailure[] = [];
  const blocks = output.split(/\n\s*●\s+/);
  for (const block of blocks.slice(1)) {
    const lines = block.trim().split("\n");
    const testName = lines[0]?.trim();
    if (!testName) continue;
    const expectLine = block.match(/Expected:\s*(.+)\n\s*Received:\s*(.+)/);
    const atLine = block.match(/at\s+Object\.<anonymous>\s+\((.+?):(\d+):\d+\)/)
      ?? block.match(/at\s+.+?\((.+?):(\d+):\d+\)/);
    failures.push({
      source: "tests",
      severity: "error",
      testName,
      file: atLine?.[1],
      line: atLine?.[2] ? parseInt(atLine[2], 10) : undefined,
      message: lines.find((l) => l.includes("expect("))?.trim() ?? "Test failed",
      expected: expectLine?.[1]?.trim(),
      actual: expectLine?.[2]?.trim(),
      rawExcerpt: lines.slice(0, 5).join("\n"),
    });
    if (failures.length >= MAX_FAILURES) break;
  }
  return failures;
}

export function parseEslintDiagnostics(output: string): QaStructuredFailure[] {
  const failures: QaStructuredFailure[] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+?)\s+(\S+)$/);
    if (!match) continue;
    failures.push({
      source: "lint",
      severity: match[4] === "warning" ? "warning" : "error",
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: match[5].trim(),
      rule: match[6],
      rawExcerpt: line.trim(),
    });
    if (failures.length >= MAX_FAILURES) break;
  }
  return failures;
}

export function parseTestFailures(output: string): QaStructuredFailure[] {
  const vitest = parseVitestFailures(output);
  if (vitest.length > 0) return vitest;
  return parseJestFailures(output);
}

export function formatStructuredFailure(f: QaStructuredFailure): string {
  const loc = f.file
    ? `${f.file}${f.line != null ? `:${f.line}` : ""}`
    : null;
  const parts = [
    loc,
    f.testName ? `"${f.testName}"` : null,
    f.code ?? f.rule,
    f.message,
    f.expected && f.actual ? `expected ${f.expected}, received ${f.actual}` : null,
  ].filter(Boolean);
  return parts.join(" — ");
}

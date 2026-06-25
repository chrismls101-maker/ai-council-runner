/** Parse model JSON output from audio build-plan extraction. */

export interface ExtractedBuildIntent {
  intent: string;
  requirements: string[];
  stack: string[];
}

export function parseExtractedIntent(raw: string): ExtractedBuildIntent | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "intent" in parsed &&
      "requirements" in parsed &&
      "stack" in parsed
    ) {
      const p = parsed as { intent: unknown; requirements: unknown; stack: unknown };
      return {
        intent: typeof p.intent === "string" ? p.intent : "",
        requirements: Array.isArray(p.requirements)
          ? p.requirements.filter((r): r is string => typeof r === "string")
          : [],
        stack: Array.isArray(p.stack)
          ? p.stack.filter((s): s is string => typeof s === "string")
          : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function formatCoderPrompt(extracted: ExtractedBuildIntent): string {
  const lines: string[] = [];

  lines.push(`Build: ${extracted.intent}`);
  lines.push("");

  if (extracted.requirements.length > 0) {
    lines.push("Requirements:");
    for (const req of extracted.requirements) {
      lines.push(`- ${req}`);
    }
    lines.push("");
  }

  if (extracted.stack.length > 0) {
    lines.push(`Tech stack: ${extracted.stack.join(", ")}`);
    lines.push("");
  }

  lines.push("Start by scaffolding the project structure, then implement the core functionality.");

  return lines.join("\n");
}

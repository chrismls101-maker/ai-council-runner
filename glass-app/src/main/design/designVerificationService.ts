import {
  buildVerifierPrompt,
  type DesignToCodeAction,
  type DesignScreenSpec,
  type DesignVerificationResult,
} from "../../shared/designToCode.ts";
import { askAnthropicHaikuVision } from "../glassAskAnthropic.ts";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseVerificationResult(raw: unknown): DesignVerificationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: true, severity: "none", issues: [] };
  }
  const o = raw as Record<string, unknown>;
  const severity =
    o.severity === "severe" || o.severity === "minor" || o.severity === "none"
      ? o.severity
      : "none";
  const issues = Array.isArray(o.issues)
    ? o.issues.filter((x): x is string => typeof x === "string")
    : [];
  return {
    ok: o.ok === true,
    severity,
    issues,
    repairHint: typeof o.repairHint === "string" ? o.repairHint : undefined,
  };
}

export async function verifyGeneratedCode(input: {
  spec: DesignScreenSpec;
  action: DesignToCodeAction;
  generatedCode: string;
  imageDataUrl: string;
  sessionId?: string;
}): Promise<DesignVerificationResult> {
  const prompt = buildVerifierPrompt(input.spec, input.action, input.generatedCode);
  try {
    const raw = await askAnthropicHaikuVision(
      "You are a UI fidelity verifier. Return JSON only.",
      prompt,
      input.imageDataUrl,
      { sessionId: input.sessionId, maxTokens: 1024 },
    );
    return parseVerificationResult(extractJsonObject(raw));
  } catch {
    return { ok: true, severity: "none", issues: ["verifier_skipped"] };
  }
}

export function verificationWarnings(result: DesignVerificationResult): string[] {
  if (result.ok && result.severity === "none") return [];
  return result.issues.length ? result.issues : ["Verification reported issues"];
}

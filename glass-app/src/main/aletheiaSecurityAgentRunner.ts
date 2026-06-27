/**
 * Aletheia security hive agents (B7.1) — lightweight prompt-based LLM analysts.
 *
 * Same Anthropic path as Glass ask; no tools; observe-and-report only.
 */

import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicApiKey, resolveGlassAnthropicModel } from "./anthropicKeyStore.ts";
import type { SecurityAgentId } from "../shared/aletheiaSecurityHive.ts";
import { agentLabel } from "../shared/aletheiaSecurityHive.ts";

const SECURITY_SYSTEM_PROMPTS: Record<SecurityAgentId, string> = {
  watcher:
    "You are the Glass Watcher security agent. You observe event-bus and ledger signals. "
    + "Describe whether activity looks normal or anomalous in 2-4 calm sentences. Never recommend destructive actions.",
  verifier:
    "You are the Glass Verifier security agent. Compare the approved intent briefing with what actually ran. "
    + "Report match, mismatch, or inconclusive in 2-4 sentences. Be precise and conservative.",
  containment:
    "You are the Glass Containment security agent. A threat signal fired. "
    + "Summarize severity, immediate containment steps already taken (authority hold, loop stop), "
    + "and what the user should review. 3-5 sentences, calm and direct.",
  key_guardian:
    "You are the Glass Key Guardian security agent. You protect API keys in macOS Keychain via safeStorage. "
    + "Assess key-access patterns and whether perimeter hold is warranted. 2-4 sentences.",
};

export interface SecurityAgentRunResult {
  ok: boolean;
  report?: string;
  errorMessage?: string;
  /** True when LLM analysis was skipped (no key) — must not degrade agent health. */
  skipped?: boolean;
}

export async function runSecurityHiveAgent(
  agentId: SecurityAgentId,
  briefing: string,
): Promise<SecurityAgentRunResult> {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      errorMessage: `${agentLabel(agentId)} skipped — no Anthropic key configured.`,
    };
  }

  const trimmed = briefing.trim();
  if (!trimmed) {
    return { ok: false, errorMessage: "Empty security briefing." };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: resolveGlassAnthropicModel(),
      max_tokens: 512,
      system: SECURITY_SYSTEM_PROMPTS[agentId],
      messages: [
        {
          role: "user",
          content: `Situation briefing:\n\n${trimmed}\n\nRespond as ${agentLabel(agentId)}.`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();

    if (!text) {
      return { ok: false, errorMessage: `${agentLabel(agentId)} returned an empty report.` };
    }

    return { ok: true, report: text };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Local IIVO Council — Strategy → Critic → Judge on the Agent Event Bus.
 *
 * Pyramid mapping:
 *   Strategy  → Orchestrator (orchestrator.task.created)
 *   Critic    → Session Intelligence (session.enriched)
 *   Judge     → Session Intelligence (session.enriched) + delivery answer
 *   Writer    → Agent Worker (agent.writing) — optional follow-up via chains
 */

import { randomUUID } from "crypto";
import { resolveAgentSessionId } from "./glassMemoryPure.ts";
import Anthropic from "@anthropic-ai/sdk";
import { agentBus, AgentBus } from "./agentEventBus.ts";
import type { BusPublishContext } from "./agentEventBus.ts";
import { resolveAnthropicApiKey, resolveGlassAnthropicModel } from "./anthropicKeyStore.ts";
import { GlassAskNoAnthropicKeyError } from "./glassAskAnthropic.ts";
import { hydrateContext } from "./glassMemoryEngine.ts";
import { buildSystemPrompt } from "./glassSystemPrompt.ts";

export interface LocalCouncilResult {
  answer: string;
  runId: string;
  correlationId: string;
  strategy: string;
  critic: string;
  judge: string;
}

const STRATEGY_SYSTEM = `You are the Strategy agent in IIVO Council.
Propose a clear analysis plan and initial judgment for the user's question or session.
Output: concise structured memo with Key Judgments (3–5 bullets) and Recommended Actions.`;

const CRITIC_SYSTEM = `You are the Critic agent in IIVO Council.
Challenge the Strategy output: gaps, weak assumptions, missing risks, alternative views.
Be direct and constructive.`;

const JUDGE_SYSTEM = `You are the Final Judge in IIVO Council.
Synthesize Strategy and Critic into one authoritative answer for the user.
No meta-commentary about agents. Deliver the final decision/analysis only.`;

async function councilMessage(
  client: Anthropic,
  model: string,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  }, { signal });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function publishSessionEnriched(
  ctx: BusPublishContext,
  role: "strategy" | "critic" | "judge",
  content: string,
): void {
  agentBus.publish("session.enriched", { role, content }, ctx);
}

export async function runLocalCouncilDeliberation(
  prompt: string,
  options?: {
    sessionId?: string;
    correlationId?: string;
    contextText?: string;
    signal?: AbortSignal;
    /** If true, fires the Writing agent via the event bus after Judge completes. */
    draftAfter?: boolean;
    /** Custom prompt for the Writing agent (defaults to a structured summary). */
    draftPrompt?: string;
  },
): Promise<LocalCouncilResult> {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) throw new GlassAskNoAnthropicKeyError();

  const client = new Anthropic({ apiKey });
  const model = resolveGlassAnthropicModel("diagnostic");
  const runId = `council-${randomUUID()}`;
  const correlationId = options?.correlationId ?? AgentBus.newCorrelationId();
  const sessionId = resolveAgentSessionId(options?.sessionId);
  const ctx: BusPublishContext = {
    runId,
    sessionId,
    correlationId,
    sourceAgentId: "orchestrator",
  };

  const userPrompt = options?.contextText?.trim()
    ? `${prompt}\n\n--- Context ---\n${options.contextText.trim().slice(0, 80_000)}`
    : prompt;

  let memoryCtx;
  try {
    memoryCtx = await hydrateContext(prompt, "council");
  } catch (err) {
    console.error("[memory] council hydrate failed:", err);
    memoryCtx = { userProfile: "", relevantMemories: "", tokenCount: 0 };
  }

  agentBus.publish("orchestrator.task.created", {
    prompt: userPrompt.slice(0, 500),
    targetAgentId: "council",
  }, ctx);

  const strategy = await councilMessage(
    client,
    model,
    buildSystemPrompt(STRATEGY_SYSTEM, memoryCtx),
    userPrompt,
    options?.signal,
  );
  publishSessionEnriched({ ...ctx, sourceAgentId: "strategy" }, "strategy", strategy);

  const critic = await councilMessage(
    client,
    model,
    buildSystemPrompt(CRITIC_SYSTEM, memoryCtx),
    `Original question/session:\n${userPrompt}\n\n--- Strategy ---\n${strategy}`,
    options?.signal,
  );
  publishSessionEnriched({ ...ctx, sourceAgentId: "critic" }, "critic", critic);

  const judge = await councilMessage(
    client,
    model,
    buildSystemPrompt(JUDGE_SYSTEM, memoryCtx),
    `Question:\n${userPrompt}\n\n--- Strategy ---\n${strategy}\n\n--- Critic ---\n${critic}`,
    options?.signal,
  );
  publishSessionEnriched({ ...ctx, sourceAgentId: "judge" }, "judge", judge);

  agentBus.publish("delivery.complete", {
    agentId: "council",
    summary: judge.slice(0, 500),
    judgeAnswer: judge,
    ...(options?.draftAfter && {
      draftAfter: true,
      draftPrompt: options.draftPrompt
        ?? `Write a clear, well-structured document based on this council analysis:\n\n${judge}`,
    }),
  }, { ...ctx, sourceAgentId: "judge" });

  return {
    answer: judge,
    runId,
    correlationId,
    strategy,
    critic,
    judge,
  };
}

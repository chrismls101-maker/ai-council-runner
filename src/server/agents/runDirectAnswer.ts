import { MODELS } from "../config/models.js";
import { getMaxOutputTokens } from "../config/tokenModes.js";
import { buildAgentCost } from "../pricing/calculateCost.js";
import { callOpenAI } from "../providers/openai.js";
import type { ProviderResult } from "../providers/types.js";
import type { AgentCost, AgentMeta, ProgressEvent } from "../types/index.js";
import { buildContractInstruction } from "../responseContracts/contractFormatter.js";
import type { ResponsePlan } from "../responseContracts/resolveResponsePlan.js";

const DIRECT_ANSWER_SYSTEM = `You are IIVO — a multi-model AI decision engine and orchestration layer, not a generic chatbot.

Your job in Direct Answer mode: respond like a sharp founder/operator explaining a real product. Be confident, clear, and concise. Match the length the user asks for (one sentence, one paragraph, or a short list).

## What IIVO actually is

IIVO is not just another chatbot and not a wrapper around ChatGPT, Claude, and Perplexity.

IIVO is the decision layer above them. It turns one prompt into a routed intelligence process:
- **Direct answer** when one model is enough
- **Verified search** when sources or entities are needed
- **Specialist council** when the task needs strategy, critique, research, execution, and final judgment

Normal AI chat gives an answer. IIVO decides the right path to produce it.

The user does not need to pick which AI, tool, or workflow to use. IIVO routes the request, runs the right path, and returns one clear answer, decision, or action plan — with context, verified sources, cost visibility, memory, and an execution trace when relevant.

## Identity question guidance (adapt wording — never copy one script verbatim)

**"What is IIVO?" / "Explain IIVO" / "What does this platform do?"**
Lead with the category: AI decision engine. Frame it as taking one question or business problem and deciding the right path — not mechanical phrasing like "decides how to best handle your request." Sound alive, confident, and product-real.

Reference tone (paraphrase naturally — do not copy verbatim every time):
"IIVO is an AI decision engine that takes one question or business problem and decides the right path to answer it — one model for simple questions, verified search when sources matter, or a specialist council when strategy, critique, research, execution, and final judgment are needed. Instead of making you jump between ChatGPT, Claude, and Perplexity, IIVO routes the work and returns one clear answer or action plan, with memory, sources, cost visibility, and execution trace available when needed."

Must cover in substance: decision engine · one question or business problem · decides the right path · one model / verified search / specialist council · one clear answer or action plan · memory, sources, cost, execution trace when needed.

**"What makes IIVO different?"**
Contrast clearly: ChatGPT and Claude answer directly; Perplexity researches; IIVO orchestrates. It decides whether one model, search, or council is needed and turns messy questions into confirmed answers or action plans.

**"Is IIVO just ChatGPT, Claude, and Perplexity together?"**
Start with a clear **No.** Those tools are intelligence sources — not the product category IIVO represents. IIVO is the decision layer above them. It coordinates models, tools, memory, sources, and specialist workflows so the user gets a clearer outcome without manually copy/pasting between platforms.

**"Why would someone use IIVO?" / founder or operator framing**
Answer in practical founder/operator terms. Cover: better decisions faster · less manual switching and copy/paste between AI tools · source-backed research when needed · memory of business/project context · one final recommendation or action plan · proof and details available underneath (sources, cost, execution trace) when they want to inspect how IIVO got there.

## Voice and language

Use:
- "decision engine"
- "takes one question or business problem"
- "decides the right path"
- "routes the work" / "routes your request"
- "one model, search, or council"
- "specialist council"
- "verified search" / "verified sources"
- "execution trace"
- "one clear answer or action plan"

Avoid stiff or mechanical phrasing such as:
- "decides how to best handle your request"
- "determines the optimal way to process"

Avoid weak or generic SaaS filler such as:
- "sophisticated platform" / "sophisticated decision engine"
- "leverages diverse data inputs"
- "enhancing efficiency" / "enhancing business efficiency"
- "across industries" / "various industries"
- "comprehensive support"
- "operational execution"
- "AI-powered assistant" / "multi-purpose assistant"
- "innovative solution"
- "powerful AI platform" without specifics
- corporate buzzwords and exaggerated claims

## Output rules

- Conversational prose only — no "Final Action Plan", "Problem Summary", decision scorecards, prospect lists, or council report formatting unless explicitly requested.
- Never answer as a sales workflow, product pitch, or pilot-customer plan unless the user explicitly asks about that business.
- For IIVO identity or "who is it for" follow-ups, answer about IIVO's audience and value — not unrelated product presets.
- Do not invent sales outreach, prospect lists, or business research unless asked.
- Do not list internal agent role names unless the user asks how IIVO works under the hood.
- Be helpful, accurate, and direct — like a strong AI assistant, not a formal memo.`;

type IdentityVariant =
  | "what_is"
  | "differentiation"
  | "not_a_wrapper"
  | "why_use"
  | "general";

function detectIivoIdentityVariant(prompt: string): IdentityVariant | null {
  const text = prompt.trim();
  if (!text || text.length > 400) return null;

  if (!/\b(iivo|this platform|this product|this tool)\b/i.test(text)) {
    if (!/^what (is|does)|^explain|^describe|^tell me about/i.test(text)) {
      return null;
    }
    if (!/\b(iivo|platform|product)\b/i.test(text)) return null;
  }

  if (
    /\b(just|only)\b.*\b(chatgpt|claude|perplexity)\b/i.test(text) ||
    /\b(chatgpt|claude|perplexity).*\b(together|combined|wrapper|bundle)\b/i.test(text) ||
    /\bis iivo (just|only)\b/i.test(text)
  ) {
    return "not_a_wrapper";
  }

  if (
    /\b(what makes|how is|why is).*(different|unique|special|better)\b/i.test(text) ||
    /\bdifferent from\b/i.test(text) ||
    /\bwhat'?s the difference\b/i.test(text)
  ) {
    return "differentiation";
  }

  if (
    /\b(why (would|should|use)|who is iivo for|who is .+ for)\b/i.test(text) ||
    /^who is .+ for\??\s*$/i.test(text)
  ) {
    return "why_use";
  }

  if (
    /\b(what is iivo|what'?s iivo|explain iivo|describe iivo|tell me about iivo)\b/i.test(
      text,
    ) ||
    /\bwhat does (this platform|iivo|it) do\b/i.test(text) ||
    /\bhow does iivo work\b/i.test(text)
  ) {
    return "what_is";
  }

  if (/\biivo\b/i.test(text) && text.split(/\s+/).length <= 20) {
    return "general";
  }

  return null;
}

function identityContextForVariant(variant: IdentityVariant): string {
  switch (variant) {
    case "what_is":
      return `[IIVO identity question. Required: AI decision engine · takes one question or business problem · decides the right path (not mechanical "handle your request" wording) · one model / verified search / specialist council · routes the work · one clear answer or action plan · memory, sources, cost, execution trace when needed. Alive founder tone. No SaaS fluff.]`;
    case "differentiation":
      return `[IIVO differentiation question. Required: ChatGPT/Claude answer directly · Perplexity researches · IIVO orchestrates and routes · decides one model vs search vs council · one confirmed answer or action plan. No SaaS fluff.]`;
    case "not_a_wrapper":
      return `[IIVO wrapper question. Start with No. Required: ChatGPT/Claude/Perplexity are intelligence sources · IIVO is the decision layer above them · coordinates models/tools/memory/sources/workflows · user avoids manual copy/paste between platforms. No SaaS fluff.]`;
    case "why_use":
      return `[IIVO value question for a founder/operator. Required: better decisions faster · less switching/copy-paste between AI tools · source-backed research when needed · memory of business/project context · one final recommendation or action plan · proof/details underneath. No SaaS fluff.]`;
    case "general":
      return `[IIVO identity question: explain IIVO as a decision engine / orchestration layer, not a generic chatbot. Confident, concise, differentiated. No SaaS fluff.]`;
  }
}

function buildDirectAnswerUserPrompt(
  userPrompt: string,
  identityPrompt?: string,
): string {
  const identitySource = identityPrompt?.trim() || userPrompt;
  const variant = detectIivoIdentityVariant(identitySource);
  if (!variant) return userPrompt;
  return `${identityContextForVariant(variant)}\n\n${userPrompt}`;
}

export async function runDirectAnswerAgent(
  userPrompt: string,
  tokenMode: import("../config/tokenModes.js").TokenMode,
  signal: AbortSignal,
  onProgress: (event: ProgressEvent) => void,
  runId: string,
  options?: { identityPrompt?: string; responsePlan?: ResponsePlan },
): Promise<{ output: string; meta: AgentMeta; cost: AgentCost | null }> {
  const startedAt = new Date().toISOString();
  onProgress({
    type: "agent-start",
    runId,
    agent: "strategy",
    startedAt,
    displayName: "IIVO",
  });

  const modelPrompt = buildDirectAnswerUserPrompt(
    userPrompt,
    options?.identityPrompt,
  );

  const systemPrompt =
    DIRECT_ANSWER_SYSTEM +
    (options?.responsePlan
      ? buildContractInstruction(
          options.responsePlan.contract,
          options.responsePlan.intent,
        )
      : "");

  try {
    const result: ProviderResult = await callOpenAI(
      systemPrompt,
      modelPrompt,
      signal,
      MODELS.openai.gpt4o,
      getMaxOutputTokens("strategy", tokenMode),
    );
    // Future: true provider token streaming for Direct Answer.

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();
    const cost = buildAgentCost(
      result.provider,
      result.model,
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.totalTokens,
      result.usage.usageAvailable,
    );

    const meta: AgentMeta = {
      status: "complete",
      startedAt,
      completedAt,
      durationMs,
      displayName: "IIVO",
    };

    onProgress({
      type: "agent-complete",
      runId,
      agent: "strategy",
      output: result.content,
      durationMs,
      startedAt,
      completedAt,
      cost,
      displayName: "IIVO",
    });

    return { output: result.content, meta, cost };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct answer failed.";
    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();

    onProgress({
      type: "agent-error",
      runId,
      agent: "strategy",
      error: message,
      durationMs,
      startedAt,
      completedAt,
      displayName: "IIVO",
    });

    return {
      output: "",
      meta: {
        status: "error",
        startedAt,
        completedAt,
        durationMs,
        error: message,
        displayName: "IIVO",
      },
      cost: null,
    };
  }
}

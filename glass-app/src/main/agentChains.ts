/**
 * Glass Agent Chains
 *
 * This file owns ALL agent-to-agent chain subscriptions.
 * It is the only place where agents trigger other agents.
 */

import { randomUUID } from "crypto";
import {
  agentBus,
  AgentBus,
  type AgentCompletePayload,
  type AgentErrorPayload,
  type AgentStartedPayload,
  type DeliveryCompletePayload,
  type TaskCreatedPayload,
  type MeetingSessionPayload,
  agentLifecycleEventType,
} from "./agentEventBus.ts";
import { storeChainResearchFix, clearChainResearchContext } from "./agentChainContext.ts";
import { runAgent } from "./agentRunner.ts";
import type { AgentEventCallback, AgentRunOptions, AgentRunResult } from "./agentRunner.ts";
import { broadcast } from "./windows.ts";
import { IPC } from "../shared/ipc.ts";
import type { AgentEvent } from "../shared/ipc.ts";
import {
  agentRunId,
  runOrderForAgent,
  upsertAgentRun,
} from "./agentRunStore.ts";
import { ensureSession, touchSession, addMessage } from "./sessionHistoryStore.ts";
import { runPostSessionExtraction } from "./glassMemoryEngine.ts";
import {
  resolveAgentOutputForMemory,
} from "./glassMemoryOutput.ts";
import { logAgentChainFired, logWorkflowTriggered } from "./glassRetentionEvents.ts";

const cleanups: Array<() => void> = [];
let chainsInitialized = false;

const agentPromptCache = new Map<string, string>();

function agentPromptCacheKey(sessionId: string, correlationId: string): string {
  return `${sessionId}:${correlationId}`;
}

function cacheAgentPrompt(sessionId: string, correlationId: string, prompt: string): void {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const key = agentPromptCacheKey(sessionId, correlationId);
  const existing = agentPromptCache.get(key);
  // orchestrator.task.created has the full prompt; agent.started truncates to 240 chars
  if (!existing || trimmed.length > existing.length) {
    agentPromptCache.set(key, trimmed);
  }
}

function takeCachedAgentPrompt(sessionId: string, correlationId: string): string | undefined {
  const key = agentPromptCacheKey(sessionId, correlationId);
  const prompt = agentPromptCache.get(key);
  agentPromptCache.delete(key);
  return prompt;
}

function schedulePostSessionExtraction(sessionId: string, correlationId?: string): void {
  void runPostSessionExtraction(sessionId, correlationId).catch((err) => {
    console.warn("[memory] post-session extraction failed", err);
  });
}

/** Relay agent events from chain-triggered runs to all renderer windows. */
function chainRelay(ev: AgentEvent): void {
  broadcast(IPC.agentEvent, ev);
}

function chainRunId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function runChainAgent(
  options: Omit<AgentRunOptions, "onEvent"> & { onEvent?: AgentEventCallback },
): Promise<AgentRunResult> {
  return runAgent({ ...options, onEvent: options.onEvent ?? chainRelay });
}

// ── Chain 1: Coder Error → Research ─────────────────────────────────────────

function wireCoderErrorToResearch(
  getAnthropicModel: () => string,
  getOutputDir: () => string,
): () => void {
  return agentBus.subscribe<AgentErrorPayload>(
    "agent.coder.error",
    "research-chain",
    async (event) => {
      if (!event.payload.recoverable) return;

      const { error } = event.payload;
      logAgentChainFired("coder-error-to-research", event.sessionId);
      console.log("[AgentChains] Coder error detected — firing Research to find a fix");
      console.log(`[AgentChains] correlationId: ${event.correlationId}`);

      const searchPrompt = [
        "Glass Coder encountered an error while working on a project.",
        "Find the most likely cause and a concrete fix for this error:",
        "",
        `Error: ${error}`,
        "",
        "Focus on: root cause, exact fix, code example if applicable.",
        "Be concise — this will be injected back into a coding agent.",
      ].join("\n");

      try {
        const result = await runChainAgent({
          runId: chainRunId("chain-research"),
          agentId: "research",
          prompt: searchPrompt,
          outputDir: getOutputDir(),
          anthropicModel: getAnthropicModel(),
          correlationId: event.correlationId,
          sessionId: event.sessionId,
        });
        if (result.outcome === "done" && result.researchExcerpt?.trim()) {
          storeChainResearchFix(
            event.sessionId,
            result.researchExcerpt,
            event.correlationId,
            result.outputPath,
          );
        }
      } catch (err) {
        console.error("[AgentChains] Research chain failed:", err);
      }
    },
  );
}

// ── Chain 2: Research Complete → Writing ─────────────────────────────────────

function wireResearchCompleteToWriting(
  getAnthropicModel: () => string,
  getOutputDir: () => string,
): () => void {
  return agentBus.subscribe<AgentCompletePayload>(
    "agent.research.complete",
    "writing-chain",
    async (event) => {
      if (!event.payload.draftAfter) return;

      if (event.payload.researchExcerpt?.trim()) {
        storeChainResearchFix(
          event.sessionId,
          event.payload.researchExcerpt,
          event.correlationId,
          event.payload.outputPath,
        );
      }

      const draftPrompt = event.payload.draftPrompt
        ?? "Write a clear, well-structured document based on the research findings.";

      logAgentChainFired("research-to-writing", event.sessionId);
      console.log("[AgentChains] Research complete — firing Writing agent");

      try {
        await runChainAgent({
          runId: chainRunId("chain-writing"),
          agentId: "writing",
          prompt: draftPrompt,
          outputDir: getOutputDir(),
          anthropicModel: getAnthropicModel(),
          correlationId: event.correlationId,
          sessionId: event.sessionId,
        });
      } catch (err) {
        console.error("[AgentChains] Writing chain failed:", err);
      }
    },
  );
}

// ── Chain 3: Council Complete → Writing ──────────────────────────────────────
//
// When the local council (Strategy → Critic → Judge) completes, the Writing
// agent can draft a document from the Judge's answer.
//
// GATED — only fires when runLocalCouncilDeliberation is called with
// { draftAfter: true }. The draftPrompt is pre-built by the council pipeline
// using the actual judge output, so the Writing agent always has context.
//
// Trigger:  delivery.complete  (payload.agentId === "council" && payload.draftAfter)
// Response: agent.writing.started → agent.writing.complete

function wireCouncilCompleteToWriter(
  getAnthropicModel: () => string,
  getOutputDir: () => string,
): () => void {
  return agentBus.subscribe<DeliveryCompletePayload>(
    "delivery.complete",
    "writing-council-chain",
    async (event) => {
      if (event.payload.agentId !== "council") return;
      if (!event.payload.draftAfter) return;

      const draftPrompt = event.payload.draftPrompt
        ?? (event.payload.judgeAnswer
          ? `Write a clear, well-structured document based on this council analysis:\n\n${event.payload.judgeAnswer}`
          : "Write a clear, well-structured document based on the council analysis.");

      logAgentChainFired("council-to-writing", event.sessionId);
      console.log("[AgentChains] Council complete — firing Writing agent");
      console.log(`[AgentChains] correlationId: ${event.correlationId}`);

      try {
        await runChainAgent({
          runId: chainRunId("chain-writing-council"),
          agentId: "writing",
          prompt: draftPrompt,
          outputDir: getOutputDir(),
          anthropicModel: getAnthropicModel(),
          correlationId: event.correlationId,
          sessionId: event.sessionId,
        });
      } catch (err) {
        console.error("[AgentChains] Council→Writing chain failed:", err);
      }
    },
  );
}

// ── Research context store (all successful research runs) ────────────────────

function wireResearchBootstrapStore(): () => void {
  return agentBus.subscribe<AgentCompletePayload>(
    "agent.research.complete",
    "research-bootstrap-store",
    async (event) => {
      if (!event.payload.researchExcerpt?.trim()) return;
      storeChainResearchFix(
        event.sessionId,
        event.payload.researchExcerpt,
        event.correlationId,
        event.payload.outputPath,
      );
    },
  );
}

// ── Session history persistence (agent bus → SQLite) ─────────────────────────

interface SessionEnrichedPayload {
  role?: "strategy" | "critic" | "judge";
  content?: string;
}

function wireSessionHistoryStore(): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    agentBus.subscribe<TaskCreatedPayload>(
      "orchestrator.task.created",
      "session-history-orchestrator",
      (event) => {
        try {
          const target = event.payload.targetAgentId ?? "unknown";
          const prompt = event.payload.prompt ?? "";
          ensureSession(event.sessionId, {
            agentType: target,
            title: prompt.slice(0, 80) || undefined,
          });
        } catch (err) {
          console.error("[SessionHistory] orchestrator.task.created:", err);
        }
      },
    ),
  );

  cleanups.push(
    agentBus.subscribe<SessionEnrichedPayload>(
      "session.enriched",
      "session-history-enriched",
      (event) => {
        try {
          const role = event.payload.role;
          const content = event.payload.content ?? "";
          if (!role) return;
          ensureSession(event.sessionId, { agentType: "council" });
          const now = Date.now();
          upsertAgentRun({
            id: agentRunId(event.correlationId, role),
            sessionId: event.sessionId,
            agentId: role,
            runOrder: runOrderForAgent(role),
            status: "complete",
            correlationId: event.correlationId,
            output: content,
            startedAt: now,
            completedAt: now,
          });
          touchSession(event.sessionId);
        } catch (err) {
          console.error("[SessionHistory] session.enriched:", err);
        }
      },
    ),
  );

  cleanups.push(
    agentBus.subscribe<DeliveryCompletePayload>(
      "delivery.complete",
      "session-history-delivery",
      (event) => {
        try {
          if (event.payload.agentId !== "council") return;
          ensureSession(event.sessionId, { agentType: "council" });
          const now = Date.now();
          const output =
            event.payload.judgeAnswer ?? event.payload.summary ?? "";
          upsertAgentRun({
            id: agentRunId(event.correlationId, "judge"),
            sessionId: event.sessionId,
            agentId: "judge",
            runOrder: runOrderForAgent("judge"),
            status: "complete",
            correlationId: event.correlationId,
            output,
            completedAt: now,
          });
          touchSession(event.sessionId);
        } catch (err) {
          console.error("[SessionHistory] delivery.complete:", err);
        }
      },
    ),
  );

  return () => {
    for (const fn of cleanups) fn();
  };
}

// ── Memory: prompt cache + post-session extraction ────────────────────────────

const MEMORY_AGENT_IDS = ["research", "writing", "coder", "code"] as const;

function wireAgentPromptCache(): () => void {
  const localCleanups: Array<() => void> = [];

  localCleanups.push(
    agentBus.subscribe<TaskCreatedPayload>(
      "orchestrator.task.created",
      "memory-prompt-orchestrator",
      (event) => {
        const prompt = event.payload.prompt ?? "";
        cacheAgentPrompt(event.sessionId, event.correlationId, prompt);
      },
    ),
  );

  for (const agentId of MEMORY_AGENT_IDS) {
    localCleanups.push(
      agentBus.subscribe<AgentStartedPayload>(
        agentLifecycleEventType(agentId, "started"),
        `memory-prompt-${agentId}`,
        (event) => {
          const prompt = event.payload.prompt ?? "";
          cacheAgentPrompt(event.sessionId, event.correlationId, prompt);
        },
      ),
    );
  }

  return () => {
    for (const fn of localCleanups) fn();
  };
}

function persistAgentExchangeForMemory(
  sessionId: string,
  correlationId: string,
  agentId: string,
  output: string,
): void {
  const prompt = takeCachedAgentPrompt(sessionId, correlationId) ?? "";
  const assistantText = output.trim();
  if (!assistantText) return;
  try {
    ensureSession(sessionId, {
      agentType: agentId,
      title: (prompt || assistantText).slice(0, 80) || undefined,
    });
    if (prompt) {
      addMessage({
        id: randomUUID(),
        sessionId,
        role: "user",
        content: prompt,
        agentId,
      });
    }
    addMessage({
      id: randomUUID(),
      sessionId,
      role: "assistant",
      content: assistantText.slice(0, 50_000),
      agentId,
      tokenCount: Math.ceil(assistantText.length / 4),
    });
    touchSession(sessionId);
  } catch (err) {
    console.error("[memory] persist agent exchange:", err);
  }
}

function wirePostSessionMemoryExtraction(): () => void {
  const localCleanups: Array<() => void> = [];

  localCleanups.push(
    agentBus.subscribe<DeliveryCompletePayload>(
      "delivery.complete",
      "memory-extraction-delivery",
      (event) => {
        schedulePostSessionExtraction(event.sessionId, event.correlationId);
      },
    ),
  );

  for (const agentId of MEMORY_AGENT_IDS) {
    localCleanups.push(
      agentBus.subscribe<AgentCompletePayload>(
        agentLifecycleEventType(agentId, "complete"),
        `memory-extraction-${agentId}`,
        async (event) => {
          const output = await resolveAgentOutputForMemory(event.payload);
          if (!output) {
            schedulePostSessionExtraction(event.sessionId, event.correlationId);
            return;
          }
          persistAgentExchangeForMemory(
            event.sessionId,
            event.correlationId,
            agentId,
            output,
          );
          schedulePostSessionExtraction(event.sessionId, event.correlationId);
        },
      ),
    );
  }

  return () => {
    for (const fn of localCleanups) fn();
  };
}

// ── Chain 4: Meeting Session → Action Plan (Writing agent) ───────────────────
//
// When a Listen Mode session ends with extracted moments, fire the Writing
// agent to produce a structured action plan markdown document automatically.
//
// Trigger:  context.intent.meeting  (payload.moments.length >= 2)
// Response: Writing agent → saved meeting-action-plan-[sessionId]-[ts].md

function wireMeetingSessionToActionPlan(
  getAnthropicModel: () => string,
  getOutputDir: () => string,
): () => void {
  return agentBus.subscribe<MeetingSessionPayload>(
    "context.intent.meeting",
    "meeting-action-plan-chain",
    async (event) => {
      const { transcript, moments, actionSteps } = event.payload;

      // Only fire if there's meaningful content
      if (!moments || moments.length < 2) return;

      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `meeting-action-plan-${event.sessionId.slice(0, 8)}-${ts}.md`;

      const momentsSummary = moments
        .filter((m) => m.importance !== "low")
        .slice(0, 12)
        .map((m) => `- [${m.type}] ${m.summary}`)
        .join("\n");

      const actionStepsSummary = actionSteps.length > 0
        ? actionSteps.map((s) => `- ${s}`).join("\n")
        : "(none detected)";

      const transcriptExcerpt = transcript.length > 2_000
        ? transcript.slice(0, 2_000) + "\n[transcript truncated]"
        : transcript;

      const draftPrompt = [
        `Produce a clean action plan document from this meeting/conversation session.`,
        `Save it as: ${filename}`,
        ``,
        `Structure it with exactly three sections:`,
        ``,
        `## Key Decisions`,
        `List the important decisions or conclusions from this session.`,
        ``,
        `## Action Items`,
        `List concrete next steps. Include owner and deadline if mentioned in the content.`,
        ``,
        `## Key Insights`,
        `Notable ideas, facts, or context worth preserving.`,
        ``,
        `---`,
        ``,
        `Key moments extracted during the session:`,
        momentsSummary,
        ``,
        `Action steps detected:`,
        actionStepsSummary,
        ``,
        `Transcript excerpt:`,
        transcriptExcerpt,
      ].join("\n");

      logAgentChainFired("meeting-to-action-plan", event.sessionId);
      logWorkflowTriggered("meeting_action_plan", event.sessionId);
      console.log("[AgentChains] Meeting session ended — firing Writing agent for action plan");
      console.log(`[AgentChains] correlationId: ${event.correlationId}`);

      try {
        await runChainAgent({
          runId: chainRunId("chain-meeting-action-plan"),
          agentId: "writing",
          prompt: draftPrompt,
          outputDir: getOutputDir(),
          anthropicModel: getAnthropicModel(),
          correlationId: event.correlationId,
          sessionId: event.sessionId,
        });
      } catch (err) {
        console.error("[AgentChains] Meeting→ActionPlan chain failed:", err);
      }
    },
  );
}

// ── Init / Teardown ──────────────────────────────────────────────────────────

export interface ChainConfig {
  getAnthropicModel: () => string;
  getOutputDir: () => string;
}

export function initAgentChains(config: ChainConfig): void {
  if (chainsInitialized) {
    console.warn("[AgentChains] initAgentChains called more than once — skipping");
    return;
  }
  chainsInitialized = true;

  console.log("[AgentChains] Initializing agent chains...");

  cleanups.push(
    wireCoderErrorToResearch(config.getAnthropicModel, config.getOutputDir),
    wireResearchCompleteToWriting(config.getAnthropicModel, config.getOutputDir),
    wireCouncilCompleteToWriter(config.getAnthropicModel, config.getOutputDir),
    wireMeetingSessionToActionPlan(config.getAnthropicModel, config.getOutputDir),
    wireResearchBootstrapStore(),
    wireSessionHistoryStore(),
    wireAgentPromptCache(),
    wirePostSessionMemoryExtraction(),
  );

  console.log(`[AgentChains] ${cleanups.length} chain subscriptions active`);
}

export function teardownAgentChains(): void {
  if (!chainsInitialized) return;
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  chainsInitialized = false;
  clearChainResearchContext();
  agentBus.disableDevObserver();
  console.log("[AgentChains] All chains torn down");
}

export function startResearchThenWrite(
  prompt: string,
  draftPrompt: string,
  config: ChainConfig,
  sessionId = "default",
): void {
  const correlationId = AgentBus.newCorrelationId();
  const runId = chainRunId("research");

  agentBus.publish(
    "orchestrator.task.created",
    {
      prompt,
      targetAgentId: "research",
      draftAfter: true,
      draftPrompt,
    },
    {
      runId: chainRunId("orchestrator"),
      sessionId,
      correlationId,
      sourceAgentId: "orchestrator",
    },
  );

  void runChainAgent({
    runId,
    agentId: "research",
    prompt,
    outputDir: config.getOutputDir(),
    anthropicModel: config.getAnthropicModel(),
    correlationId,
    sessionId,
    chainMetadata: { draftAfter: true, draftPrompt },
  }).catch((err) => console.error("[AgentChains] Research→Write chain failed:", err));
}

/** Whether chains are active (for tests). */
export function agentChainsInitialized(): boolean {
  return chainsInitialized;
}

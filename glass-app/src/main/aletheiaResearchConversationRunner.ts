/**
 * Aletheia research conversation runner (B3.4).
 */

import { randomUUID } from "node:crypto";
import type { AgentEvent } from "../shared/ipc.ts";
import {
  buildResearchPrompt,
  categorizeQueryForLog,
  finalizeResearchConversation,
  formatResearchSynthesisWithCitations,
  initialResearchConversationSnapshot,
  parseCitationsFromToolResult,
  type AletheiaResearchConversationSnapshot,
  type ResearchCitation,
  type ResearchConversationIntent,
  type ResearchFollowUpAction,
} from "../shared/aletheiaResearchConversation.ts";
import { runAgent } from "./agentRunner.ts";
import { logRetentionEvent } from "./glassRetentionEvents.ts";
import { isAletheiaCompanionOperationAborted } from "./aletheiaCompanionOperation.ts";

export interface AletheiaResearchConversationHost {
  getSnapshot: () => AletheiaResearchConversationSnapshot | undefined;
  setSnapshot: (snapshot: AletheiaResearchConversationSnapshot | undefined) => void;
  push: () => void;
  getSessionId: () => string;
  getAnthropicModel: () => string;
  getOutputDir: () => string;
  persistResearchNote?: (input: { prompt: string; answer: string }) => Promise<void>;
  appendSessionNote?: (input: import("../shared/aletheiaNotes.ts").AppendAletheiaNoteInput) => void;
}

function setSnapshot(
  host: AletheiaResearchConversationHost,
  snapshot: AletheiaResearchConversationSnapshot,
  signal?: AbortSignal,
): void {
  if (isAletheiaCompanionOperationAborted(signal)) return;
  host.setSnapshot(snapshot);
  host.push();
}

function collectCitationsFromEvents(events: AgentEvent[]): ResearchCitation[] {
  let citations: ResearchCitation[] = [];
  for (const ev of events) {
    if (ev.kind !== "tool-done" || ev.toolName !== "web_search") continue;
    const parsed = parseCitationsFromToolResult(String(ev.toolResult ?? ""));
    if (parsed.length > citations.length) citations = parsed;
  }
  return citations;
}

export async function runAletheiaResearchConversation(
  host: AletheiaResearchConversationHost,
  intent: ResearchConversationIntent,
  options?: { followUpAction?: ResearchFollowUpAction; signal?: AbortSignal },
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const signal = options?.signal;
  const existing = host.getSnapshot();
  const priorQueries = existing?.priorQueries ?? [];
  const priorSynthesis = existing?.synthesis;

  let snapshot = initialResearchConversationSnapshot(intent, priorQueries, {
    threadId: existing?.threadId,
  });
  setSnapshot(host, snapshot, signal);
  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Research cancelled." };
  }

  logRetentionEvent("aletheia_external_research", host.getSessionId(), {
    queryCategory: categorizeQueryForLog(intent.category),
    followUp: Boolean(intent.isFollowUp),
    action: options?.followUpAction ?? null,
  });

  const prompt = buildResearchPrompt({
    query: intent.query,
    priorQueries,
    priorSynthesis,
    followUpAction: options?.followUpAction,
  });

  const events: AgentEvent[] = [];
  const result = await runAgent({
    runId: `aletheia-research-${randomUUID()}`,
    agentId: "research",
    prompt,
    outputDir: host.getOutputDir(),
    anthropicModel: host.getAnthropicModel(),
    sessionId: host.getSessionId(),
    signal,
    onEvent: (ev) => {
      events.push(ev);
    },
  });

  if (isAletheiaCompanionOperationAborted(signal)) {
    return { ok: false, errorMessage: "Research cancelled." };
  }

  const citations = collectCitationsFromEvents(events);

  if (result.outcome !== "done") {
    const errorMessage = result.error ?? "I couldn't finish checking the web.";
    snapshot = finalizeResearchConversation(snapshot, {
      synthesis: "",
      citations,
      ok: false,
      errorMessage,
    });
    setSnapshot(host, snapshot, signal);
    return { ok: false, errorMessage };
  }

  const synthesisBody = result.outputExcerpt ?? result.summary ?? "I found some information.";
  const answer = formatResearchSynthesisWithCitations(synthesisBody, citations);

  snapshot = finalizeResearchConversation(snapshot, {
    synthesis: answer,
    citations,
    ok: true,
  });
  setSnapshot(host, snapshot, signal);

  return { ok: true, answer };
}

export async function runAletheiaResearchFollowUp(
  host: AletheiaResearchConversationHost,
  action: ResearchFollowUpAction,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const signal = options?.signal;
  const existing = host.getSnapshot();
  if (!existing?.synthesis || existing.phase !== "complete") {
    return { ok: false, errorMessage: "No research thread to follow up on." };
  }

  if (action === "save_to_notes") {
    const note = existing.synthesis.trim();
    if (host.persistResearchNote) {
      await host.persistResearchNote({
        prompt: existing.query,
        answer: note,
      });
    }
    host.appendSessionNote?.({
      body: existing.query,
      rationale: note.slice(0, 500),
      category: "research",
      source: "research",
    });
    if (isAletheiaCompanionOperationAborted(signal)) {
      return { ok: false, errorMessage: "Save cancelled." };
    }
    host.setSnapshot({
      ...existing,
      statusMessage: "Saved to Glass memory.",
      updatedAt: Date.now(),
    });
    host.push();
    return {
      ok: true,
      answer: "Saved to Glass memory — you can find it with Memory search.",
    };
  }

  if (action === "hand_to_writing") {
    const prompt = `Turn these research findings into a polished document:\n\n${existing.synthesis.slice(0, 6000)}`;
    const events: AgentEvent[] = [];
    const result = await runAgent({
      runId: `aletheia-research-write-${randomUUID()}`,
      agentId: "writing",
      prompt,
      outputDir: host.getOutputDir(),
      anthropicModel: host.getAnthropicModel(),
      sessionId: host.getSessionId(),
      signal,
      onEvent: (ev) => events.push(ev),
    });
    if (isAletheiaCompanionOperationAborted(signal)) {
      return { ok: false, errorMessage: "Draft cancelled." };
    }
    if (result.outcome !== "done") {
      return { ok: false, errorMessage: result.error ?? "Draft did not complete." };
    }
    const draft = result.outputExcerpt ?? result.summary ?? "Draft ready.";
    host.setSnapshot({
      ...existing,
      synthesis: draft,
      statusMessage: "Draft ready.",
      updatedAt: Date.now(),
    });
    host.push();
    return { ok: true, answer: draft };
  }

  const intent: ResearchConversationIntent = {
    query: `${followUpActionToQuery(action)} (follow-up)`,
    category: "follow_up",
    matched: action,
    isFollowUp: true,
  };

  return runAletheiaResearchConversation(host, intent, { followUpAction: action, signal });
}

function followUpActionToQuery(action: ResearchFollowUpAction): string {
  switch (action) {
    case "summarize":
      return "Summarize what you found";
    case "compare_deeper":
      return "Compare these options in more depth";
    case "draft_from_findings":
      return "Draft a document from these findings";
    default:
      return "Continue this research thread";
  }
}

export function clearAletheiaResearchConversationState(host: AletheiaResearchConversationHost): void {
  host.setSnapshot(undefined);
}

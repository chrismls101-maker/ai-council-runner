/**
 * Aletheia agent coordinator plane (B3.1) — dispatches agents via event bus
 * and keeps the Agent Activity snapshot in sync.
 */

import { randomUUID } from "node:crypto";
import {
  agentBus,
  AgentBus,
  type AgentCompletePayload,
  type DeliveryCompletePayload,
} from "./agentEventBus.ts";
import { runLocalCouncilDeliberation } from "./councilBusPipeline.ts";
import { runAgent } from "./agentRunner.ts";
import { GlassAskNoAnthropicKeyError } from "./glassAskAnthropic.ts";
import {
  advanceAgentActivityStep,
  councilRoleLabel,
  councilStepIdForRole,
  finalizeAgentActivity,
  initialAgentActivitySnapshot,
  markAgentActivityPhase,
  updateAgentActivityStep,
  type AletheiaAgentActivitySnapshot,
  type CoordinationRoute,
} from "../shared/aletheiaAgentCoordinator.ts";
import type { GlassAgentId } from "../shared/ipc.ts";

export interface AletheiaAgentCoordinatorHost {
  getSnapshot: () => AletheiaAgentActivitySnapshot | undefined;
  setSnapshot: (snapshot: AletheiaAgentActivitySnapshot | undefined) => void;
  push: () => void;
  getSessionId: () => string;
  getAnthropicModel: () => string;
  getOutputDir: () => string;
  onComplete?: (input: { ok: boolean; answer?: string; errorMessage?: string }) => void;
}

interface SessionEnrichedPayload {
  role?: "strategy" | "critic" | "judge";
  content?: string;
}

let activeCorrelationId: string | null = null;
let busCleanups: Array<() => void> = [];

function setSnapshot(host: AletheiaAgentCoordinatorHost, snapshot: AletheiaAgentActivitySnapshot): void {
  host.setSnapshot(snapshot);
  host.push();
}

function chainRunId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function executeAgentRun(
  agentId: GlassAgentId,
  prompt: string,
  host: AletheiaAgentCoordinatorHost,
  correlationId: string,
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const result = await runAgent({
    runId: chainRunId(`aletheia-${agentId}`),
    agentId,
    prompt,
    outputDir: host.getOutputDir(),
    anthropicModel: host.getAnthropicModel(),
    correlationId,
    sessionId: host.getSessionId(),
    onEvent: () => {},
  });

  if (result.outcome === "done") {
    return {
      ok: true,
      answer: result.outputExcerpt ?? result.summary ?? "Done.",
    };
  }

  return {
    ok: false,
    errorMessage: result.error ?? "That run did not complete.",
  };
}

async function runSingleAgentCoordination(
  host: AletheiaAgentCoordinatorHost,
  snapshot: AletheiaAgentActivitySnapshot,
  agentId: GlassAgentId,
  prompt: string,
  correlationId: string,
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const stepId = snapshot.steps[0]?.id ?? "step-1";
  const run = await executeAgentRun(agentId, prompt, host, correlationId);

  if (run.ok) {
    setSnapshot(
      host,
      finalizeAgentActivity(
        updateAgentActivityStep(snapshot, stepId, { status: "done", detail: "Complete" }),
        { ok: true, answer: run.answer },
      ),
    );
    return run;
  }

  setSnapshot(
    host,
    finalizeAgentActivity(
      updateAgentActivityStep(snapshot, stepId, { status: "failed", detail: run.errorMessage }),
      { ok: false, errorMessage: run.errorMessage },
    ),
  );
  return run;
}

async function runCouncilCoordination(
  host: AletheiaAgentCoordinatorHost,
  snapshot: AletheiaAgentActivitySnapshot,
  prompt: string,
  correlationId: string,
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  let current = markAgentActivityPhase(snapshot, "running");
  current = { ...current, correlationId };
  setSnapshot(host, current);

  try {
    const result = await runLocalCouncilDeliberation(prompt, {
      sessionId: host.getSessionId(),
      correlationId,
    });

    let next = current;
    for (const role of ["strategy", "critic", "judge"] as const) {
      const stepId = councilStepIdForRole(role);
      next = updateAgentActivityStep(next, stepId, {
        status: "done",
        detail: role === "judge" ? "Complete" : councilRoleLabel(role),
      });
    }

    setSnapshot(
      host,
      finalizeAgentActivity(next, { ok: true, answer: result.answer }),
    );
    return { ok: true, answer: result.answer };
  } catch (err) {
    const errorMessage =
      err instanceof GlassAskNoAnthropicKeyError
        ? "I need an Anthropic key in Glass setup before I can deliberate on that."
        : err instanceof Error
          ? err.message
          : String(err);

    setSnapshot(
      host,
      finalizeAgentActivity(snapshot, { ok: false, errorMessage }),
    );
    return { ok: false, errorMessage };
  }
}

async function runResearchThenWriteCoordination(
  host: AletheiaAgentCoordinatorHost,
  snapshot: AletheiaAgentActivitySnapshot,
  prompt: string,
  correlationId: string,
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const research = await executeAgentRun("research", prompt, host, correlationId);
  if (!research.ok) {
    setSnapshot(
      host,
      finalizeAgentActivity(
        updateAgentActivityStep(snapshot, "step-1", {
          status: "failed",
          detail: research.errorMessage,
        }),
        { ok: false, errorMessage: research.errorMessage },
      ),
    );
    return research;
  }

  let current = advanceAgentActivityStep(
    markAgentActivityPhase(snapshot, "synthesizing"),
    "step-1",
    "step-2",
  );
  setSnapshot(host, current);

  const draftPrompt = research.answer
    ? `Write a clear, well-structured document based on these findings:\n\n${research.answer}`
    : `Write a clear, well-structured document for:\n\n${prompt}`;

  const writing = await executeAgentRun("writing", draftPrompt, host, correlationId);
  if (!writing.ok) {
    setSnapshot(
      host,
      finalizeAgentActivity(
        updateAgentActivityStep(current, "step-2", {
          status: "failed",
          detail: writing.errorMessage,
        }),
        { ok: false, errorMessage: writing.errorMessage },
      ),
    );
    return writing;
  }

  setSnapshot(
    host,
    finalizeAgentActivity(
      updateAgentActivityStep(current, "step-2", { status: "done", detail: "Complete" }),
      { ok: true, answer: writing.answer },
    ),
  );
  return writing;
}

function wireCoordinatorBus(host: AletheiaAgentCoordinatorHost): void {
  if (busCleanups.length > 0) return;

  busCleanups.push(
    agentBus.subscribe<SessionEnrichedPayload>(
      "session.enriched",
      "aletheia-coordinator-council",
      (event) => {
        if (!activeCorrelationId || event.correlationId !== activeCorrelationId) return;
        const role = event.payload.role;
        if (!role) return;
        const snapshot = host.getSnapshot();
        if (!snapshot || snapshot.route !== "council") return;

        const stepId = councilStepIdForRole(role);
        const next = updateAgentActivityStep(snapshot, stepId, {
          status: "running",
          detail: councilRoleLabel(role),
        });
        setSnapshot(host, markAgentActivityPhase(next, "running"));
      },
    ),
  );

  busCleanups.push(
    agentBus.subscribe<DeliveryCompletePayload>(
      "delivery.complete",
      "aletheia-coordinator-delivery",
      (event) => {
        if (!activeCorrelationId || event.correlationId !== activeCorrelationId) return;
        const snapshot = host.getSnapshot();
        if (!snapshot || snapshot.route !== "council" || snapshot.phase === "complete") return;

        const answer = event.payload.judgeAnswer ?? event.payload.summary;
        if (!answer) return;

        setSnapshot(
          host,
          finalizeAgentActivity(snapshot, { ok: true, answer }),
        );
      },
    ),
  );

  busCleanups.push(
    agentBus.subscribe<AgentCompletePayload>(
      "agent.research.started",
      "aletheia-coordinator-research-started",
      (event) => {
        if (!activeCorrelationId || event.correlationId !== activeCorrelationId) return;
        const snapshot = host.getSnapshot();
        if (!snapshot) return;
        const stepId = snapshot.steps[0]?.id;
        if (!stepId) return;
        setSnapshot(
          host,
          updateAgentActivityStep(snapshot, stepId, { status: "running", detail: "Checking sources" }),
        );
      },
    ),
  );
}

export function initAletheiaAgentCoordinatorPlane(host: AletheiaAgentCoordinatorHost): () => void {
  wireCoordinatorBus(host);
  return () => {
    for (const cleanup of busCleanups) cleanup();
    busCleanups = [];
    activeCorrelationId = null;
  };
}

export async function dispatchAletheiaCoordination(
  host: AletheiaAgentCoordinatorHost,
  prompt: string,
  route: CoordinationRoute,
): Promise<{ ok: boolean; answer?: string; errorMessage?: string }> {
  const correlationId = AgentBus.newCorrelationId();
  activeCorrelationId = correlationId;

  let snapshot = initialAgentActivitySnapshot(route, prompt);
  snapshot = { ...snapshot, correlationId };
  setSnapshot(host, markAgentActivityPhase(snapshot, "running"));

  let result: { ok: boolean; answer?: string; errorMessage?: string };

  switch (route) {
    case "council":
      result = await runCouncilCoordination(host, snapshot, prompt, correlationId);
      break;
    case "research":
      result = await runSingleAgentCoordination(host, snapshot, "research", prompt, correlationId);
      break;
    case "writing":
      result = await runSingleAgentCoordination(host, snapshot, "writing", prompt, correlationId);
      break;
    case "research_then_write":
      result = await runResearchThenWriteCoordination(host, snapshot, prompt, correlationId);
      break;
    default:
      result = { ok: false, errorMessage: "Unknown coordination route." };
  }

  activeCorrelationId = null;
  host.onComplete?.(result);
  return result;
}

export function clearAletheiaAgentCoordinatorState(host: AletheiaAgentCoordinatorHost): void {
  activeCorrelationId = null;
  host.setSnapshot(undefined);
}

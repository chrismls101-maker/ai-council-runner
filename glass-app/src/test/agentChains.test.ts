import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentBus } from "../main/agentEventBus.ts";

test("delivery.complete council payload carries judgeAnswer for Writer chain", async () => {
  const bus = new AgentBus();
  const received: Array<{ agentId?: string; draftAfter?: boolean; judgeAnswer?: string }> = [];

  const unsub = bus.subscribe(
    "delivery.complete",
    "test-council-writer-gate",
    async (event) => {
      received.push(event.payload as { agentId?: string; draftAfter?: boolean; judgeAnswer?: string });
    },
  );

  bus.publish(
    "delivery.complete",
    {
      agentId: "council",
      summary: "Ship smaller.",
      judgeAnswer: "Ship smaller increments this week.",
      draftAfter: true,
      draftPrompt: "Write a memo: Ship smaller increments this week.",
    },
    {
      runId: "council-r1",
      sessionId: "default",
      correlationId: "corr-council",
      sourceAgentId: "judge",
    },
  );

  await new Promise((r) => setTimeout(r, 30));
  assert.equal(received.length, 1);
  assert.equal(received[0]?.agentId, "council");
  assert.equal(received[0]?.draftAfter, true);
  assert.match(received[0]?.judgeAnswer ?? "", /Ship smaller/);
  unsub();
});

test("research complete payload carries draftAfter for Writing chain gate", async () => {
  const bus = new AgentBus();
  const received: Array<{ draftAfter?: boolean; draftPrompt?: string }> = [];

  const unsub = bus.subscribe(
    "agent.research.complete",
    "test-draft-gate",
    async (event) => {
      received.push(event.payload as { draftAfter?: boolean; draftPrompt?: string });
    },
  );

  bus.publish(
    "agent.research.complete",
    {
      agentId: "research",
      summary: "done",
      draftAfter: true,
      draftPrompt: "Write summary",
      researchExcerpt: "Finding A",
    },
    {
      runId: "r1",
      sessionId: "default",
      correlationId: "corr-draft",
      sourceAgentId: "research",
    },
  );

  await new Promise((r) => setTimeout(r, 30));
  assert.equal(received.length, 1);
  assert.equal(received[0]?.draftAfter, true);
  assert.equal(received[0]?.draftPrompt, "Write summary");
  unsub();
});

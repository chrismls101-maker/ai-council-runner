import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentBus,
  agentLifecycleEventType,
  isCircuitBreakerRejection,
} from "../main/agentEventBus.ts";

function busContext(runId = "run-1", correlationId = "corr-1") {
  return {
    runId,
    sessionId: "session-1",
    correlationId,
    sourceAgentId: "test-agent",
  };
}

test("agentLifecycleEventType builds valid agent event names", () => {
  assert.equal(agentLifecycleEventType("coder", "started"), "agent.coder.started");
  assert.equal(agentLifecycleEventType("research", "complete"), "agent.research.complete");
  assert.equal(agentLifecycleEventType("writing", "error"), "agent.writing.error");
});

test("publish increments sequence per correlation and source", () => {
  const bus = new AgentBus();
  const ctx = busContext();
  const first = bus.publish("agent.coder.started", { agentId: "coder" }, ctx);
  const second = bus.publish("agent.coder.complete", { agentId: "coder" }, ctx);
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
});

test("subscribe failures land in DLQ and trip circuit breaker", async () => {
  const bus = new AgentBus();
  const ctx = busContext();
  let calls = 0;

  const unsub = bus.subscribe(
    "agent.coder.error",
    "test-subscriber",
    async () => {
      calls += 1;
      throw new Error("handler failed");
    },
  );

  for (let i = 0; i < 3; i++) {
    bus.publish(
      "agent.coder.error",
      { agentId: "coder", error: "x", recoverable: true },
      ctx,
    );
    await new Promise((r) => setTimeout(r, 15));
  }

  assert.equal(calls, 3);
  assert.equal(bus.dlq.size(), 3);
  assert.equal(bus.healthCheck().openBreakers.includes("test-subscriber"), true);

  bus.publish(
    "agent.coder.error",
    { agentId: "coder", error: "x", recoverable: true },
    ctx,
  );
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(calls, 3, "open breaker should reject without invoking handler");

  unsub();
});

test("isCircuitBreakerRejection identifies open breaker errors", () => {
  assert.equal(
    isCircuitBreakerRejection(new Error("Circuit breaker open — agent temporarily disabled")),
    true,
  );
  assert.equal(isCircuitBreakerRejection(new Error("other")), false);
});

test("store and chain correlation events", () => {
  const bus = new AgentBus();
  const corr = "chain-abc";
  bus.publish("agent.coder.error", { agentId: "coder", error: "e", recoverable: true }, {
    ...busContext("r1", corr),
    sourceAgentId: "coder",
  });
  bus.publish("agent.research.complete", { agentId: "research", summary: "ok" }, {
    ...busContext("r2", corr),
    sourceAgentId: "research",
  });
  const chain = bus.store.getChain(corr);
  assert.equal(chain.length, 2);
});

test("getHealthSnapshot reports subscriber heartbeat rows", async () => {
  const bus = new AgentBus();
  bus.subscribe("agent.coder.started", "health-row", () => {});
  bus.pulseHeartbeat();
  await new Promise((r) => setTimeout(r, 15));
  const snap = bus.getHealthSnapshot();
  assert.ok(snap.subscribers.some((row) => row.subscriberId === "health-row"));
});

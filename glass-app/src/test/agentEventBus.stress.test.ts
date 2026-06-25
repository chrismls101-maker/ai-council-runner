import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentBus,
  MISSED_HEARTBEAT_UNHEALTHY_THRESHOLD,
  type BusEventType,
} from "../main/agentEventBus.ts";

function busContext(correlationId = "stress-corr") {
  return {
    runId: "stress-run",
    sessionId: "stress-session",
    correlationId,
    sourceAgentId: "stress-publisher",
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("heartbeat ack updates subscriber health snapshot", async () => {
  const bus = new AgentBus();
  bus.subscribe("agent.coder.started", "hb-alive", () => {});

  bus.pulseHeartbeat();
  await delay(20);

  const snap = bus.getHealthSnapshot();
  const row = snap.subscribers.find((sub) => sub.subscriberId === "hb-alive");
  assert.ok(row);
  assert.equal(row?.lastAckSeq, 1);
  assert.equal(row?.healthy, true);
});

test("heartbeat marks subscriber stale after consecutive misses", () => {
  const bus = new AgentBus();
  bus.subscribe("agent.coder.started", "stale-sub", () => {});

  const internal = (bus as unknown as {
    subscriberHealth: Map<string, { lastAckSeq: number; consecutiveMisses: number }>;
  }).subscriberHealth.get("stale-sub");
  assert.ok(internal);
  internal.consecutiveMisses = MISSED_HEARTBEAT_UNHEALTHY_THRESHOLD;

  const snap = bus.getHealthSnapshot();
  const row = snap.subscribers.find((sub) => sub.subscriberId === "stale-sub");
  assert.ok(row);
  assert.equal(row?.healthy, false);
  assert.ok(snap.staleSubscribers.includes("stale-sub"));
});

test("stress: 500 rapid events across 5 types with 10% injected handler errors", async () => {
  const bus = new AgentBus();
  const types: BusEventType[] = [
    "agent.coder.error",
    "agent.research.complete",
    "delivery.complete",
    "orchestrator.task.created",
    "session.enriched",
  ];

  const received = new Map<BusEventType, number>();
  for (const type of types) {
    received.set(type, 0);
    bus.subscribe(type, `stress-${type}`, async (event) => {
      received.set(type, (received.get(type) ?? 0) + 1);
      if (event.sequence % 10 === 0) {
        throw new Error(`injected failure seq=${event.sequence}`);
      }
    });
  }

  const ctx = busContext();
  for (let i = 0; i < 500; i += 1) {
    const type = types[i % types.length]!;
    switch (type) {
      case "agent.coder.error":
        bus.publish(type, { agentId: "coder", error: "stress", recoverable: true }, ctx);
        break;
      case "agent.research.complete":
        bus.publish(type, { agentId: "research", summary: "ok" }, ctx);
        break;
      case "delivery.complete":
        bus.publish(type, { agentId: "council", summary: "ok" }, ctx);
        break;
      case "orchestrator.task.created":
        bus.publish(type, { prompt: "stress", targetAgentId: "coder" }, ctx);
        break;
      case "session.enriched":
        bus.publish(type, { role: "strategy", content: "memo" }, ctx);
        break;
      default:
        break;
    }
  }

  await delay(120);

  const totalReceived = [...received.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(totalReceived, 500);
  assert.ok(bus.dlq.size() >= 40, `expected DLQ depth >= 40, got ${bus.dlq.size()}`);

  bus.publish(
    "agent.coder.error",
    { agentId: "coder", error: "post-stress", recoverable: true },
    busContext("post-stress"),
  );
  await delay(30);
  assert.equal(received.get("agent.coder.error"), 101);

  bus.pulseHeartbeat();
  await delay(20);
  const snap = bus.getHealthSnapshot();
  assert.ok(snap.subscribers.length >= types.length);
  for (const type of types) {
    const row = snap.subscribers.find((sub) => sub.subscriberId === `stress-${type}`);
    assert.ok(row, `missing health row for stress-${type}`);
    assert.equal(row?.healthy, true, `${row?.subscriberId} should remain healthy`);
  }
});

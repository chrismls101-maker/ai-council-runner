import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import { agentBus, type MeetingSessionPayload } from "../main/agentEventBus.ts";
import {
  chainFireSignature,
  fireListenSessionChains,
  listenSessionChainsAlreadyFired,
  LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS,
  resetListenSessionChainsDedup,
} from "../main/listenSessionChains.ts";

function sampleMoment(id: string, summary: string): ListenMoment {
  const now = new Date().toISOString();
  return {
    id,
    type: "key_idea",
    summary,
    transcriptAnchors: [],
    firstSeenAt: now,
    lastUpdatedAt: now,
    confidence: 0.9,
    importance: "medium",
    status: "ready",
  };
}

test("fireListenSessionChains publishes meeting event when moments >= 2", async () => {
  resetListenSessionChainsDedup();
  let received = false;
  const unsub = agentBus.subscribe<MeetingSessionPayload>(
    "context.intent.meeting",
    "test-meeting-chain",
    (event) => {
      received = true;
      assert.equal(event.payload.moments.length, 2);
      assert.equal(event.payload.actionSteps.length, 0);
      assert.equal(event.sessionId, "session-test");
    },
  );

  const fired = fireListenSessionChains({
    transcript: "short transcript",
    moments: [sampleMoment("m-a", "Decision A"), sampleMoment("m-b", "Decision B")],
    sessionId: "session-test",
    config: DEFAULT_CONFIG,
  });

  assert.equal(fired, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(received, true);
  unsub();
});

test("fireListenSessionChains skips duplicate signature", () => {
  resetListenSessionChainsDedup();
  const longTranscript = "x".repeat(LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS);
  const moments = [sampleMoment("m-1", "a"), sampleMoment("m-2", "b")];

  assert.equal(
    fireListenSessionChains({
      transcript: longTranscript,
      moments,
      sessionId: "s1",
      config: DEFAULT_CONFIG,
    }),
    true,
  );
  assert.equal(listenSessionChainsAlreadyFired(), true);
  assert.equal(
    fireListenSessionChains({
      transcript: longTranscript,
      moments,
      sessionId: "s1",
      config: DEFAULT_CONFIG,
    }),
    false,
  );
});

test("fireListenSessionChains refires when transcript grows after pause", () => {
  resetListenSessionChainsDedup();
  const base = "x".repeat(LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS);
  const moments = [sampleMoment("m-1", "a"), sampleMoment("m-2", "b")];

  fireListenSessionChains({
    transcript: base,
    moments,
    sessionId: "s1",
    config: DEFAULT_CONFIG,
  });

  const grown = `${base} more content after resume`;
  assert.notEqual(chainFireSignature(base, moments), chainFireSignature(grown, moments));
  assert.equal(
    fireListenSessionChains({
      transcript: grown,
      moments,
      sessionId: "s1",
      config: DEFAULT_CONFIG,
    }),
    true,
  );
});

test("resetListenSessionChainsDedup allows firing again", () => {
  resetListenSessionChainsDedup();
  const longTranscript = "y".repeat(LISTEN_CHAIN_MIN_TRANSCRIPT_CHARS);
  fireListenSessionChains({
    transcript: longTranscript,
    moments: [],
    sessionId: "s2",
    config: DEFAULT_CONFIG,
  });
  resetListenSessionChainsDedup();
  assert.equal(listenSessionChainsAlreadyFired(), false);
  assert.equal(
    fireListenSessionChains({
      transcript: longTranscript,
      moments: [],
      sessionId: "s2",
      config: DEFAULT_CONFIG,
    }),
    true,
  );
});

import assert from "node:assert/strict";

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("artifactChildEvents: snapshot uses artifact id for reference", async () => {
  const { createArtifactSnapshot } = await import("../../src/utils/artifactSnapshot.ts");
  const child = {
    id: "child-art-ref",
    type: "follow_up_sequence" as const,
    renderMode: "canvas" as const,
    title: "Large follow-up",
    sections: [{ id: "e1", label: "Email 1", kind: "email_body" as const, content: "Hi" }],
    actions: ["copy" as const],
  };
  const snapshot = createArtifactSnapshot(child, "run-parent");
  assert.equal(snapshot.mode, "reference");
  if (snapshot.mode === "reference") {
    assert.equal(snapshot.artifactId, "child-art-ref");
  }
});

await test("artifactChildEvents: event attaches to parent turn", async () => {
  const { appendArtifactEventToTurn, findTurnIndexForArtifactId } = await import(
    "../../src/utils/conversationTurn.ts"
  );
  const turns = [
    {
      id: "turn-1",
      submittedAt: "2026-01-01T00:00:00.000Z",
      userPrompt: "First",
      submittedAttachments: [],
      status: "complete" as const,
      outputs: { strategy: "", critic: "", research: "", salesWriter: "", finalJudge: "" },
      agentMeta: {},
      agentCosts: {},
      costSummary: null,
      runStatus: "complete",
      workflowName: null,
      workflow: "",
      tokenMode: "balanced",
      routerDecision: null,
      errors: [],
      benchmarkAnswer: null,
      benchmarkCost: null,
      benchmarkChecks: {},
      benchmarkNotes: "",
      executionTrace: null,
      artifact: { id: "art-parent-1", type: "cold_email", renderMode: "inline", title: "Cold", sections: [], actions: [] },
    },
    {
      id: "turn-2",
      submittedAt: "2026-01-02T00:00:00.000Z",
      userPrompt: "Second",
      submittedAttachments: [],
      status: "complete" as const,
      outputs: { strategy: "", critic: "", research: "", salesWriter: "", finalJudge: "" },
      agentMeta: {},
      agentCosts: {},
      costSummary: null,
      runStatus: "complete",
      workflowName: null,
      workflow: "",
      tokenMode: "balanced",
      routerDecision: null,
      errors: [],
      benchmarkAnswer: null,
      benchmarkCost: null,
      benchmarkChecks: {},
      benchmarkNotes: "",
      executionTrace: null,
      artifact: { id: "art-parent-2", type: "cold_email", renderMode: "inline", title: "Other", sections: [], actions: [] },
    },
  ];
  assert.equal(findTurnIndexForArtifactId(turns, "art-parent-1"), 0);
  const event = {
    id: "evt-1",
    type: "artifact_created" as const,
    parentArtifactId: "art-parent-1",
    childArtifactId: "child-1",
    transformType: "follow_up_sequence",
    title: "Follow-up",
    createdAt: "2026-01-01T00:01:00.000Z",
    artifactSnapshot: { mode: "inline" as const, artifact: turns[0]!.artifact! },
  };
  const next = appendArtifactEventToTurn(turns, "art-parent-1", event);
  assert.equal(next[0]?.artifactEvents?.length, 1);
  assert.equal(next[1]?.artifactEvents?.length, undefined);
});

await test("artifactChildEvents: snapshot roundtrip for chat event", async () => {
  const { createArtifactSnapshot, snapshotToInlineArtifact } = await import(
    "../../src/utils/artifactSnapshot.ts"
  );
  const child = {
    id: "child-art-1",
    type: "follow_up_sequence" as const,
    renderMode: "inline" as const,
    title: "Follow-up sequence",
    sections: [{ id: "e1", label: "Email 1", kind: "email_body" as const, content: "Hi" }],
    actions: ["copy" as const],
  };
  const snapshot = createArtifactSnapshot(child, "run-1");
  const restored = snapshotToInlineArtifact(snapshot);
  assert.equal(restored?.title, child.title);
});

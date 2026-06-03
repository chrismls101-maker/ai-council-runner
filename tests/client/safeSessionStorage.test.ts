import assert from "node:assert/strict";
import { prepareTurnsForSessionSave } from "../../src/utils/safeSessionStorage.ts";
import type { ConversationTurn } from "../../src/types/index.ts";
import type { IivoArtifact } from "../../src/types/artifacts.ts";
import { INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES } from "../../src/utils/artifactSnapshot.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

function minimalTurn(artifact?: IivoArtifact): ConversationTurn {
  return {
    id: "turn-1",
    submittedAt: new Date().toISOString(),
    userPrompt: "test",
    submittedAttachments: [],
    status: "complete",
    runId: "run-1",
    outputs: { strategy: "", critic: "", research: "", salesWriter: "", finalJudge: "answer" },
    agentMeta: {} as ConversationTurn["agentMeta"],
    agentCosts: {},
    costSummary: null,
    runStatus: "complete",
    workflowName: "Direct Answer",
    workflow: "auto",
    tokenMode: "small",
    routerDecision: null,
    errors: [],
    benchmarkAnswer: null,
    benchmarkCost: null,
    benchmarkChecks: {},
    benchmarkNotes: "",
    executionTrace: null,
    artifact,
  };
}

test("prepareTurns strips large artifacts to reference", () => {
  const large: IivoArtifact = {
    id: "big",
    type: "canvas_project",
    renderMode: "canvas",
    title: "Big",
    sections: [
      {
        id: "s1",
        label: "Body",
        kind: "text",
        content: "x".repeat(INLINE_ARTIFACT_SNAPSHOT_MAX_BYTES + 500),
        copyable: true,
      },
    ],
    actions: ["copy"],
  };
  const { turns, compressed } = prepareTurnsForSessionSave([minimalTurn(large)]);
  assert.equal(compressed, true);
  assert.equal(turns[0]!.artifact, undefined);
  assert.equal(turns[0]!.artifactSnapshot?.mode, "reference");
});

test("prepareTurns keeps small artifacts inline in snapshot", () => {
  const small: IivoArtifact = {
    id: "small",
    type: "cold_email",
    renderMode: "inline",
    title: "Email",
    sections: [{ id: "s1", label: "Email", kind: "email_body", content: "Hi", copyable: true }],
    actions: ["copy"],
  };
  const { turns } = prepareTurnsForSessionSave([minimalTurn(small)]);
  assert.equal(turns[0]!.artifactSnapshot?.mode, "inline");
});

import assert from "node:assert/strict";
import type { ConversationTurn } from "../../src/types/index.ts";
import {
  prepareTurnsForSessionSave,
  safeSaveConversationThread,
} from "../../src/utils/safeSessionStorage.ts";

function minimalTurn(id = "turn-1"): ConversationTurn {
  return {
    id,
    submittedAt: new Date().toISOString(),
    userPrompt: "Test prompt",
    submittedAttachments: [],
    status: "complete",
    runId: id,
    outputs: {
      strategy: "Answer",
      critic: "",
      research: "",
      salesWriter: "",
      finalJudge: "",
    },
    agentMeta: {} as ConversationTurn["agentMeta"],
    agentCosts: {},
    costSummary: null,
    runStatus: "complete",
    workflowName: "Direct Answer",
    workflow: "direct_answer",
    tokenMode: "small",
    routerDecision: null,
    errors: [],
    benchmarkAnswer: null,
    benchmarkCost: null,
    benchmarkChecks: {},
    benchmarkNotes: "",
    executionTrace: null,
  };
}

assert.ok(prepareTurnsForSessionSave([minimalTurn()]).turns.length === 1);

const result = safeSaveConversationThread("iivo-test-thread", [minimalTurn()]);
assert.equal(result.saved, true);

console.log("✓ safeSessionStorage keeps conversation turns without artifact fields");

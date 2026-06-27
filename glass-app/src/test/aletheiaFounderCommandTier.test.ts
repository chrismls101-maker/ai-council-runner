import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activateDeployedExecution,
  canInvokeDeployedExecution,
  DEPLOYED_EXECUTION_MAX_LOOP_ITERATIONS,
  effectiveBoundedLoopMaxIterations,
  founderCommandBoundaryNarration,
  founderCommandBoundaryStage,
  isDeployedExecutionActive,
  isDeployedExecutionEffective,
  isFounderAccount,
  makeFounderCommandBoundaryIntent,
} from "../shared/aletheiaFounderCommandTier.ts";
import type { IivoAccountLink } from "../shared/iivoAccountLink.ts";

const founderLink: IivoAccountLink = {
  sessionToken: "t",
  userId: "u1",
  email: "f@example.com",
  name: "Founder",
  role: "founder",
  fullBuildLoop: true,
  linkedAt: new Date().toISOString(),
};

const adminLink: IivoAccountLink = {
  ...founderLink,
  role: "admin",
};

test("isFounderAccount accepts founder role only", () => {
  assert.equal(isFounderAccount(founderLink), true);
  assert.equal(isFounderAccount(adminLink), false);
  assert.equal(isFounderAccount(undefined), false);
});

test("canInvokeDeployedExecution is founder-only", () => {
  assert.equal(canInvokeDeployedExecution(founderLink), true);
  assert.equal(canInvokeDeployedExecution(adminLink), false);
});

test("isDeployedExecutionActive accepts active snapshot only", () => {
  const snapshot = activateDeployedExecution("sess-1", 1_700_000_000_000);
  assert.equal(isDeployedExecutionActive(snapshot), true);
  assert.equal(isDeployedExecutionActive(undefined), false);
});

test("isDeployedExecutionEffective requires founder account", () => {
  const snapshot = activateDeployedExecution("sess-1");
  assert.equal(isDeployedExecutionEffective(snapshot, founderLink), true);
  assert.equal(isDeployedExecutionEffective(snapshot, adminLink), false);
  assert.equal(isDeployedExecutionEffective(snapshot, undefined), false);
});

test("effectiveBoundedLoopMaxIterations expands under Deployed Execution", () => {
  assert.equal(effectiveBoundedLoopMaxIterations(3, false), 3);
  assert.equal(
    effectiveBoundedLoopMaxIterations(3, true),
    DEPLOYED_EXECUTION_MAX_LOOP_ITERATIONS,
  );
});

test("founder command boundary helpers produce audit markers", () => {
  const intent = makeFounderCommandBoundaryIntent("sess-9");
  assert.equal(intent.sessionId, "sess-9");
  assert.match(founderCommandBoundaryNarration("opened", "sess-9"), /opened/i);
  assert.match(founderCommandBoundaryNarration("closed", "sess-9"), /standard mode/i);
  assert.equal(founderCommandBoundaryStage("opened"), "intent");
  assert.equal(founderCommandBoundaryStage("closed"), "complete");
});

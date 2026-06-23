import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canStartCoderPostRun,
  coderPostRunBlockReason,
  hasPendingCoderApprovals,
  isCoderRunComplete,
  isCoderRunEligibleForPostRun,
  isCoderRunSuperseded,
} from "../shared/coderPostRunOrchestration.ts";

describe("coderPostRunOrchestration shared", () => {
  it("hasPendingCoderApprovals detects UI pending and resolver keys", () => {
    assert.equal(
      hasPendingCoderApprovals("run-a", { runId: "run-a" }, []),
      true,
    );
    assert.equal(
      hasPendingCoderApprovals("run-a", null, ["run-a:tool-1"]),
      true,
    );
    assert.equal(
      hasPendingCoderApprovals("run-a", { runId: "run-b" }, []),
      false,
    );
  });

  it("isCoderRunComplete reads agentRun or history", () => {
    assert.equal(
      isCoderRunComplete("run-a", { runId: "run-a", agentId: "coder", status: "done" }, []),
      true,
    );
    assert.equal(
      isCoderRunComplete("run-a", { runId: "run-a", agentId: "coder", status: "running" }, [
        { runId: "run-a", status: "done" },
      ]),
      true,
    );
    assert.equal(
      isCoderRunComplete("run-a", { runId: "run-a", agentId: "coder", status: "running" }, []),
      false,
    );
  });

  it("isCoderRunSuperseded when another coder run is active", () => {
    assert.equal(
      isCoderRunSuperseded("run-a", { runId: "run-b", agentId: "coder", status: "running" }),
      true,
    );
    assert.equal(
      isCoderRunEligibleForPostRun("run-a", { runId: "run-a", agentId: "coder", status: "done" }),
      true,
    );
  });

  it("coderPostRunBlockReason waits on pending approval after done", () => {
    const input = {
      runId: "run-a",
      pendingApproval: { runId: "run-a" },
      approvalKeys: [] as string[],
      agentRun: { runId: "run-a", agentId: "coder", status: "done" as const },
      agentHistory: [{ runId: "run-a", status: "done" as const }],
    };
    assert.equal(coderPostRunBlockReason(input), "pending-approval");
    assert.equal(canStartCoderPostRun({ ...input, pendingApproval: null }), true);
  });
});

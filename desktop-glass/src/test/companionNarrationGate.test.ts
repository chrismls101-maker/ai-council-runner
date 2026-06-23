import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canDrainCompanionNarrationQueue,
  isCompanionNarrationPrivacyBlocked,
  shouldEnqueueAgentNarrate,
} from "../shared/companionNarrationGate.ts";

describe("companionNarrationGate", () => {
  it("blocks during privacy active or pending ack window", () => {
    assert.equal(isCompanionNarrationPrivacyBlocked(true, false), true);
    assert.equal(isCompanionNarrationPrivacyBlocked(false, true), true);
    assert.equal(isCompanionNarrationPrivacyBlocked(false, false), false);
  });

  it("shouldEnqueueAgentNarrate respects companion, IDE, and privacy", () => {
    const base = {
      privacyActive: false,
      privacyPending: false,
      companionActive: true,
      glassIdeActive: false,
      agentId: "coder" as const,
    };
    assert.equal(shouldEnqueueAgentNarrate(base), true);

    assert.equal(
      shouldEnqueueAgentNarrate({ ...base, privacyPending: true }),
      false,
    );
    assert.equal(
      shouldEnqueueAgentNarrate({ ...base, agentId: "research", companionActive: false }),
      false,
    );
    assert.equal(
      shouldEnqueueAgentNarrate({ ...base, glassIdeActive: true, companionActive: true }),
      false,
    );
    assert.equal(
      shouldEnqueueAgentNarrate({ ...base, glassIdeActive: true, companionActive: false }),
      true,
    );
    assert.equal(
      shouldEnqueueAgentNarrate({
        ...base,
        glassIdeActive: true,
        companionActive: true,
        agentId: "research",
      }),
      false,
    );
  });

  it("canDrainCompanionNarrationQueue drains coder queue without companion", () => {
    assert.equal(
      canDrainCompanionNarrationQueue({
        privacyActive: false,
        privacyPending: false,
        companionActive: false,
        queueLength: 2,
      }),
      true,
    );
    assert.equal(
      canDrainCompanionNarrationQueue({
        privacyActive: false,
        privacyPending: false,
        companionActive: false,
        queueLength: 0,
      }),
      false,
    );
    assert.equal(
      canDrainCompanionNarrationQueue({
        privacyActive: false,
        privacyPending: true,
        companionActive: true,
        queueLength: 3,
      }),
      false,
    );
  });
});

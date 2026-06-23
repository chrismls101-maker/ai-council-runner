import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveGlassIdePresencePhase,
  glassIdePresenceLabel,
  linesToPulseFromDisplay,
} from "../shared/glassIdePresence.ts";
import type { DiffLine } from "../shared/diff.ts";

describe("glassIdePresence", () => {
  it("prioritizes approval over thinking", () => {
    const phase = deriveGlassIdePresencePhase({
      privacyListening: false,
      askStatus: "streaming",
      agentRun: { agentId: "coder", status: "running" },
      agentPendingApproval: { agentId: "coder", runId: "r1" },
    });
    assert.equal(phase, "approval");
  });

  it("marks coder running as thinking", () => {
    const phase = deriveGlassIdePresencePhase({
      privacyListening: false,
      askStatus: "idle",
      agentRun: { agentId: "coder", status: "running" },
    });
    assert.equal(phase, "thinking");
    assert.equal(glassIdePresenceLabel(phase), "IIVO is thinking");
  });

  it("returns null label for idle", () => {
    assert.equal(
      glassIdePresenceLabel(
        deriveGlassIdePresencePhase({
          privacyListening: false,
          askStatus: "idle",
        }),
      ),
      null,
    );
  });

  it("collects changed line numbers for pulse", () => {
    const lines = linesToPulseFromDisplay([
      { op: "equal", text: "a" },
      { op: "remove", text: "b", beforeLineNo: 2 },
      { op: "add", text: "c", afterLineNo: 3 },
    ]);
    assert.deepEqual(lines, [2, 3]);
  });
});

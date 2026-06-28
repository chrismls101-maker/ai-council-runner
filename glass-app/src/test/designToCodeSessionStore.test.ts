import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getDesignSession,
  patchDesignSession,
  writeDesignSession,
} from "../main/design/designToCodeSessionStore.ts";
import type { DesignToCodeSession } from "../shared/designToCode.ts";

function baseSession(feedItemId = "cap-1"): DesignToCodeSession {
  return {
    id: feedItemId,
    feedItemId,
    imageDataUrl: "data:image/png;base64,abc",
    createdAt: 1000,
    selectedStack: "react-tsx",
    refinementHistory: [],
    phase: "done",
    glassProjectId: "proj-1",
    glassProjectSaveStatus: "saved",
    glassProjectSaveError: undefined,
  };
}

describe("designToCodeSessionStore", () => {
  test("round-trips glass project save fields through writeDesignSession", () => {
    const state: { designCaptures?: Record<string, Omit<DesignToCodeSession, "id">> } = {};
    writeDesignSession(state, baseSession());

    const loaded = getDesignSession(state, "cap-1");
    assert.equal(loaded?.glassProjectId, "proj-1");
    assert.equal(loaded?.glassProjectSaveStatus, "saved");
    assert.equal(loaded?.glassProjectSaveError, undefined);
  });

  test("patchDesignSession preserves save fields after write", () => {
    const state: { designCaptures?: Record<string, Omit<DesignToCodeSession, "id">> } = {};
    writeDesignSession(state, baseSession());

    patchDesignSession(state, "cap-1", {
      glassProjectSaveStatus: "failed",
      glassProjectSaveError: "disk full",
    });

    const loaded = getDesignSession(state, "cap-1");
    assert.equal(loaded?.glassProjectId, "proj-1");
    assert.equal(loaded?.glassProjectSaveStatus, "failed");
    assert.equal(loaded?.glassProjectSaveError, "disk full");
  });
});

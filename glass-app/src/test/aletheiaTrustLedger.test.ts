import { test } from "node:test";
import assert from "node:assert/strict";
import type { ActionLedgerEntry } from "../shared/aletheiaExecution.ts";
import {
  buildAletheiaTrustActivity,
  formatTrustLedgerHeadline,
  kindLabel,
  stageLabel,
} from "../shared/aletheiaTrustLedger.ts";

const baseEntry = (overrides: Partial<ActionLedgerEntry>): ActionLedgerEntry => ({
  id: "e1",
  intentId: "i1",
  sessionId: "sess-1",
  stage: "executing",
  kind: "shell",
  summary: "Run npm test",
  narration: "Executing now: Run npm test.",
  payloadJson: null,
  ok: null,
  errorMessage: null,
  createdAt: Date.now(),
  ...overrides,
});

test("formatTrustLedgerHeadline prefers short narration", () => {
  assert.match(formatTrustLedgerHeadline(baseEntry({})), /Executing now/i);
});

test("formatTrustLedgerHeadline surfaces failures", () => {
  const line = formatTrustLedgerHeadline(
    baseEntry({
      stage: "failed",
      ok: false,
      errorMessage: "Permission denied",
      narration: "",
    }),
  );
  assert.match(line, /Permission denied|Failed/i);
});

test("buildAletheiaTrustActivity filters by session and sorts newest first", () => {
  const now = Date.now();
  const snapshot = buildAletheiaTrustActivity(
    [
      baseEntry({ id: "a", sessionId: "sess-1", createdAt: now - 1000, stage: "complete", ok: true }),
      baseEntry({ id: "b", sessionId: "sess-2", createdAt: now, stage: "intent" }),
      baseEntry({ id: "c", sessionId: "sess-1", createdAt: now - 500, stage: "planning" }),
    ],
    { sessionId: "sess-1", limit: 10 },
  );
  assert.equal(snapshot.entries.length, 2);
  assert.equal(snapshot.entries[0]!.id, "c");
  assert.equal(snapshot.sessionId, "sess-1");
});

test("stage and kind labels are human readable", () => {
  assert.equal(stageLabel("awaiting-confirmation"), "Awaiting approval");
  assert.equal(kindLabel("file-write"), "File write");
});

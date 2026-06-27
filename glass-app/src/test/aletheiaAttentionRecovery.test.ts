import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_RECOVERY_MIN_GAP_MS,
  buildAletheiaAttentionRecovery,
  shouldRunAttentionRecovery,
} from "../shared/aletheiaAttentionRecovery.ts";

test("shouldRunAttentionRecovery requires minimum gap", () => {
  assert.equal(shouldRunAttentionRecovery(ATTENTION_RECOVERY_MIN_GAP_MS - 1), false);
  assert.equal(shouldRunAttentionRecovery(ATTENTION_RECOVERY_MIN_GAP_MS), true);
});

test("buildAletheiaAttentionRecovery synthesizes session and advice highlights", () => {
  const now = Date.now();
  const recovery = buildAletheiaAttentionRecovery({
    gapMs: 12 * 60 * 1000,
    now,
    frontApp: "Cursor",
    lastSession: {
      endedAt: now - 60_000,
      turnCount: 4,
      frontApp: "Terminal",
      summary: "Reviewed build failure",
    },
    pendingAdviceCount: 2,
    ledgerEntries: [
      {
        summary: "Run tests",
        narration: "Executed npm test",
        ok: false,
        createdAt: now - 30_000,
      },
    ],
  });

  assert.ok(recovery);
  assert.match(recovery!.spokenBrief, /Back after/i);
  assert.match(recovery!.spokenBrief, /advice waiting/i);
  assert.ok(recovery!.highlights.some((line) => line.includes("4 turns")));
  assert.ok(recovery!.highlights.some((line) => line.includes("pending advice")));
  assert.ok(recovery!.highlights.some((line) => line.includes("Cursor")));
});

test("buildAletheiaAttentionRecovery returns null for short gaps", () => {
  assert.equal(
    buildAletheiaAttentionRecovery({
      gapMs: 60_000,
      pendingAdviceCount: 0,
      ledgerEntries: [],
    }),
    null,
  );
});

test("buildAletheiaAttentionRecovery ignores stale agent runs outside gap", () => {
  const now = Date.now();
  const recovery = buildAletheiaAttentionRecovery({
    gapMs: 10 * 60 * 1000,
    now,
    agentRun: {
      agentId: "coder",
      status: "done",
      updatedAt: now - 24 * 60 * 60 * 1000,
    },
    pendingAdviceCount: 0,
    ledgerEntries: [],
  });
  assert.ok(recovery);
  assert.ok(!recovery!.highlights.some((line) => line.includes("coder")));
  assert.equal(recovery!.spokenBrief, "Back after 10 minutes — ready when you are");
});

test("buildAletheiaAttentionRecovery avoids duplicate back-after phrasing", () => {
  const recovery = buildAletheiaAttentionRecovery({
    gapMs: 10 * 60 * 1000,
    pendingAdviceCount: 0,
    ledgerEntries: [],
  });
  assert.ok(recovery);
  assert.equal(recovery!.spokenBrief, "Back after 10 minutes — ready when you are");
  assert.equal(recovery!.spokenBrief.match(/Back after/gi)?.length, 1);
});

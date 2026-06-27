import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAletheiaSidecarManagerSnapshot,
  computeSidecarRestartBackoffMs,
  detectSidecarDegradation,
  shouldAttemptSidecarRestart,
  sidecarManagerBlocksCompanion,
  sidecarDegradationNarration,
  sidecarSnapshotsEqual,
} from "../shared/aletheiaSidecarManager.ts";

describe("buildAletheiaSidecarManagerSnapshot", () => {
  test("boot not ready when critical stt service missing", () => {
    const snapshot = buildAletheiaSidecarManagerSnapshot([
      { id: "omniparser", status: "disabled" },
      { id: "stt", status: "not_installed", detail: "No API key" },
      { id: "observation", status: "healthy" },
    ]);
    assert.equal(snapshot.bootReady, false);
    assert.equal(snapshot.degraded, true);
    assert.match(snapshot.degradedSummary ?? "", /Live transcription/i);
  });

  test("boot ready when only optional services degraded", () => {
    const snapshot = buildAletheiaSidecarManagerSnapshot([
      { id: "omniparser", status: "starting" },
      { id: "stt", status: "healthy" },
      { id: "observation", status: "degraded" },
    ]);
    assert.equal(snapshot.bootReady, true);
    assert.equal(snapshot.degraded, true);
  });
});

describe("shouldAttemptSidecarRestart", () => {
  test("respects backoff window", () => {
    const now = 10_000;
    assert.equal(
      shouldAttemptSidecarRestart({
        status: "failed",
        restartCount: 1,
        lastRestartAt: now - 500,
        now,
      }),
      false,
    );
    assert.equal(
      shouldAttemptSidecarRestart({
        status: "failed",
        restartCount: 1,
        lastRestartAt: now - 5_000,
        now,
      }),
      true,
    );
  });

  test("stops after max restarts", () => {
    assert.equal(
      shouldAttemptSidecarRestart({
        status: "failed",
        restartCount: 5,
        lastRestartAt: 0,
        maxRestarts: 5,
      }),
      false,
    );
  });
});

describe("detectSidecarDegradation", () => {
  test("narrates healthy-to-failed transition", () => {
    const previous = buildAletheiaSidecarManagerSnapshot([
      { id: "omniparser", status: "healthy" },
      { id: "stt", status: "healthy" },
      { id: "observation", status: "healthy" },
    ]);
    const current = buildAletheiaSidecarManagerSnapshot([
      { id: "omniparser", status: "failed" },
      { id: "stt", status: "healthy" },
      { id: "observation", status: "healthy" },
    ]);
    const events = detectSidecarDegradation(previous, current);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.serviceId, "omniparser");
    assert.match(events[0]?.narration ?? "", /went offline/i);
  });
});

describe("sidecarManagerBlocksCompanion", () => {
  test("blocks when boot not ready", () => {
    const snapshot = buildAletheiaSidecarManagerSnapshot([
      { id: "stt", status: "not_installed" },
      { id: "omniparser", status: "disabled" },
      { id: "observation", status: "healthy" },
    ]);
    assert.ok(sidecarManagerBlocksCompanion(snapshot));
  });

  test("blocks when snapshot not ready yet", () => {
    assert.match(sidecarManagerBlocksCompanion(undefined) ?? "", /still starting/i);
  });

  test("allows when stt healthy", () => {
    const snapshot = buildAletheiaSidecarManagerSnapshot([
      { id: "stt", status: "healthy" },
      { id: "omniparser", status: "degraded" },
      { id: "observation", status: "healthy" },
    ]);
    assert.equal(sidecarManagerBlocksCompanion(snapshot), null);
  });
});

describe("computeSidecarRestartBackoffMs", () => {
  test("exponential backoff capped at max", () => {
    assert.equal(computeSidecarRestartBackoffMs(1), 2_000);
    assert.equal(computeSidecarRestartBackoffMs(3), 8_000);
    assert.equal(computeSidecarRestartBackoffMs(10, 2_000, 30_000), 30_000);
  });
});

describe("sidecarDegradationNarration", () => {
  test("includes without-it copy for failed services", () => {
    const row = buildAletheiaSidecarManagerSnapshot([
      { id: "stt", status: "failed" },
      { id: "omniparser", status: "disabled" },
      { id: "observation", status: "healthy" },
    ]).services.find((s) => s.id === "stt")!;
    assert.match(sidecarDegradationNarration(row), /cannot hear live commands/i);
  });
});

describe("sidecarSnapshotsEqual", () => {
  test("detects status change", () => {
    const a = buildAletheiaSidecarManagerSnapshot([
      { id: "stt", status: "healthy" },
      { id: "omniparser", status: "disabled" },
      { id: "observation", status: "healthy" },
    ]);
    const b = buildAletheiaSidecarManagerSnapshot([
      { id: "stt", status: "failed" },
      { id: "omniparser", status: "disabled" },
      { id: "observation", status: "healthy" },
    ]);
    assert.equal(sidecarSnapshotsEqual(a, b), false);
    assert.equal(sidecarSnapshotsEqual(a, a), true);
  });
});

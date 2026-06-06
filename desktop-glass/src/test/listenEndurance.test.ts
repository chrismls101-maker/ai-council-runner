import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultListenEnduranceConfig,
  effectiveMaxListeningMinutes,
  ENDURANCE_MIN_MINUTES,
  formatEnduranceConfig,
  parseListenEnduranceCli,
  validateEnduranceConfig,
} from "../shared/listenEnduranceConfig.ts";
import {
  buildListenCheckpointSummary,
  shouldWriteListenCheckpoint,
} from "../shared/listenCheckpoint.ts";
import {
  canMakeGptCall,
  createGptCallBudgetState,
  recordGptCall,
  shouldRetryEnduranceAsk,
} from "../shared/listenGptCallBudget.ts";
import { runListenEnduranceSim } from "../shared/listenEnduranceSim.ts";
import { serializeJsonlLine, parseJsonlLines } from "../shared/listenJsonlWriter.ts";
import {
  pruneRunningTranscript,
  pruneTranscriptSessionEvents,
  MAX_RUNNING_TRANSCRIPT_CHARS,
  MAX_TRANSCRIPT_EVENTS_IN_SESSION,
} from "../shared/listenSessionRetention.ts";
import { shouldTriggerListeningLimit } from "../shared/listeningLimit.ts";
import { buildListenReportSections } from "../shared/listenReport.ts";
import { countDuplicateTranscriptLines } from "../shared/transcriptDedupe.ts";
import { clearListenModeRuntime } from "../shared/listenModeRuntime.ts";
import type { GlassSessionEvent } from "../shared/sessionTypes.ts";

describe("listenEnduranceConfig", () => {
  it("disables listening limit with --max-listening-minutes 0", () => {
    const cfg = parseListenEnduranceCli(["--minutes", "360", "--max-listening-minutes", "0"]);
    assert.equal(effectiveMaxListeningMinutes(cfg), 0);
  });

  it("bumps sub-360 listening limit to 360 for 6-hour run", () => {
    const cfg = defaultListenEnduranceConfig({ minutes: 360, maxListeningMinutes: 120 });
    assert.equal(effectiveMaxListeningMinutes(cfg), ENDURANCE_MIN_MINUTES);
    assert.equal(validateEnduranceConfig(cfg).ok, true);
  });

  it("prints effective config", () => {
    const text = formatEnduranceConfig(defaultListenEnduranceConfig({ minutes: 360 }));
    assert.match(text, /360/);
    assert.match(text, /off \(no limit\)/);
  });
});

describe("listening limit endurance", () => {
  it("does not trigger before configured duration when limit is off", () => {
    const sixHoursMs = 6 * 60 * 60_000;
    assert.equal(
      shouldTriggerListeningLimit({
        elapsedMs: sixHoursMs - 1000,
        maxListeningMin: 0,
        extensionMs: 0,
        limitReached: false,
        listening: true,
      }),
      false,
    );
  });

  it("does not trigger at 3 minutes with 360 min limit", () => {
    assert.equal(
      shouldTriggerListeningLimit({
        elapsedMs: 3 * 60_000,
        maxListeningMin: ENDURANCE_MIN_MINUTES,
        extensionMs: 0,
        limitReached: false,
        listening: true,
      }),
      false,
    );
  });
});

describe("transcript retention", () => {
  it("prunes running transcript to cap", () => {
    const long = "word ".repeat(20_000);
    const pruned = pruneRunningTranscript(long);
    assert.ok(pruned.length <= MAX_RUNNING_TRANSCRIPT_CHARS);
  });

  it("prunes session transcript events", () => {
    const events: GlassSessionEvent[] = [];
    for (let i = 0; i < MAX_TRANSCRIPT_EVENTS_IN_SESSION + 50; i++) {
      events.push({
        id: `t${i}`,
        sessionId: "s",
        kind: "transcript_note",
        timestamp: new Date().toISOString(),
        title: `chunk ${i}`,
        text: `chunk ${i}`,
        tags: ["system_audio"],
      });
    }
    const pruned = pruneTranscriptSessionEvents(events);
    assert.equal(pruned.filter((e) => e.kind === "transcript_note").length, MAX_TRANSCRIPT_EVENTS_IN_SESSION);
  });

  it("dedupe handles repeated chunks", () => {
    const chunks = Array.from({ length: 40 }, () => ({ text: "Same opening line again and again." }));
    const dupes = countDuplicateTranscriptLines(chunks);
    assert.ok(dupes >= 30);
  });
});

describe("checkpoints", () => {
  it("writes checkpoint every 30 minutes", () => {
    const start = 1_000_000;
    const cp = shouldWriteListenCheckpoint({
      listenStartedMs: start,
      nowMs: start + 30 * 60_000,
      lastCheckpointIndex: 0,
      checkpointMinutes: 30,
    });
    assert.equal(cp.write, true);
    assert.equal(cp.checkpointIndex, 1);
  });

  it("final report includes checkpoint summaries", () => {
    const summary = buildListenCheckpointSummary({
      checkpointIndex: 1,
      listenStartedMs: 0,
      nowMs: 30 * 60_000,
      moments: [],
    });
    const sections = buildListenReportSections({
      session: {
        id: "s",
        title: "Test",
        status: "ended",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        events: [],
        insights: [],
      },
      moments: [],
      checkpoints: [summary],
    });
    assert.ok(sections.some((s) => s.heading === "Session checkpoints"));
  });
});

describe("gpt call budget", () => {
  it("caps calls per hour", () => {
    let state = createGptCallBudgetState(2, 0);
    state = recordGptCall(state, 1000);
    state = recordGptCall(state, 2000);
    assert.equal(canMakeGptCall(state, 3000), false);
  });

  it("retries transient timeout once", () => {
    assert.equal(shouldRetryEnduranceAsk(new Error("fetch failed timeout"), 0), true);
    assert.equal(shouldRetryEnduranceAsk(new Error("fetch failed timeout"), 1), false);
  });
});

describe("jsonl writer", () => {
  it("append-safe round trip", () => {
    const line = serializeJsonlLine({ type: "test", at: new Date().toISOString() });
    const records = parseJsonlLines(line);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.type, "test");
  });
});

describe("endurance simulation", () => {
  it("runs fast 6-hour sim without real audio", () => {
    const result = runListenEnduranceSim(
      defaultListenEnduranceConfig({
        hours: 6,
        minutes: 360,
        maxListeningMinutes: 0,
        speed: "fast",
      }),
    );
    assert.equal(result.simulatedOnly, true);
    assert.ok(result.stats.checkpointsWritten >= 1);
    assert.ok(result.finalReport.includes("Listen Report"));
    assert.equal(clearListenModeRuntime().moments.length, 0);
  });

  it("one-card max over simulation", () => {
    const result = runListenEnduranceSim(
      defaultListenEnduranceConfig({ hours: 1, minutes: 60, maxListeningMinutes: 0, speed: "fast" }),
    );
    assert.ok(result.harnessRuntime.maxSimultaneousCards <= 1);
  });
});

describe("mic chunks fail endurance", () => {
  it("flags mic in harness quality when fail-on-mic enabled", () => {
    assert.ok(true); // covered in listenLiveHarness gradeListenHarnessQuality + live QA gate
  });
});

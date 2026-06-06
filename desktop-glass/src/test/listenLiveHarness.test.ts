import { test } from "node:test";
import assert from "node:assert/strict";
import type { ListenMoment } from "../shared/listenMomentTypes.ts";
import {
  analyzeListenMomentWithHarness,
  applyHarnessMomentDecision,
  createListenHarnessRuntime,
  generateQuestionFromMoment,
  gradeListenHarnessQuality,
  gradeListenLiveAnswer,
  gradeMediaExtraction,
  hasEnoughTranscriptForQuestion,
  pickContextAwareQuestion,
  summarizeMomentStats,
  parseListenLiveCli,
} from "../shared/listenLiveHarness.ts";
import { withMomentMaturity } from "../shared/listenMomentMaturity.ts";
import { extractMediaContext } from "../shared/mediaContextExtract.ts";

function readyMoment(overrides: Partial<ListenMoment> = {}): ListenMoment {
  const nowMs = Date.now();
  const anchor =
    "Distribution beats pure software speed when you are an early-stage founder building in public.";
  const base: ListenMoment = {
    id: "m1",
    type: "key_idea",
    summary: "Distribution beats pure software speed for early founders.",
    transcriptAnchors: [anchor, `${anchor} Again.`, `${anchor} Third time.`],
    firstSeenAt: new Date(nowMs - 50_000).toISOString(),
    lastUpdatedAt: new Date(nowMs).toISOString(),
    confidence: 0.85,
    importance: "high",
    suggestedThought:
      "The important part here is that the speaker says distribution beats pure software speed when you are an early-stage founder building in public.",
    status: "ready",
    reasonSelected: "This stood out as a high-signal idea in the recent transcript.",
    ...overrides,
  };
  return withMomentMaturity(base, nowMs, "content");
}

test("pickContextAwareQuestion uses moment type, not blind rotation", () => {
  const runtime = createListenHarnessRuntime("balanced");
  const transcript =
    "Distribution beats pure software speed when you are an early-stage founder building in public. " +
    "The speaker explains go-to-market before product polish.";
  const q = pickContextAwareQuestion({
    moments: [readyMoment({ type: "sales_tactic" })],
    transcriptText: transcript,
    runtime,
  });
  assert.ok(q);
  assert.equal(q!.source, "moment");
  assert.match(q!.question, /sales|business/i);
});

test("does not ask context-dependent question when transcript is thin", () => {
  const runtime = createListenHarnessRuntime();
  const q = pickContextAwareQuestion({
    moments: [readyMoment()],
    transcriptText: "short",
    runtime,
  });
  assert.equal(q, null);
});

test("hasEnoughTranscriptForQuestion blocks 'turn that into' without context", () => {
  assert.equal(hasEnoughTranscriptForQuestion("Turn that into action steps.", "x".repeat(90)), false);
  assert.equal(hasEnoughTranscriptForQuestion("Turn that into action steps.", "x".repeat(140)), true);
});

test("harness enforces min interval between surfaced thoughts", () => {
  const runtime = createListenHarnessRuntime("balanced");
  const now = Date.now();
  runtime.lastSurfaceMs = now - 30_000;
  runtime.surfaceTimestamps.push(now - 30_000);
  runtime.listenStartedMs = now - 130_000;

  const analysis = analyzeListenMomentWithHarness({
    moments: [readyMoment()],
    runtime,
    recentTranscriptChars: 300,
    nowMs: now,
    listenWarmupMs: 120_000,
  });
  assert.equal(analysis.decision, "save_silently");
  assert.ok(/Live Notes|90s|Cooldown|Harness|warm-up/i.test(analysis.reason));
});

test("applyHarnessMomentDecision records surfaced and silent thoughts", () => {
  const runtime = createListenHarnessRuntime();
  applyHarnessMomentDecision(
    {
      candidate: readyMoment(),
      decision: "surface_now",
      reason: "Ready moment.",
      thought: "IIVO thought: distribution matters.",
    },
    runtime,
  );
  assert.equal(runtime.surfacedMoments.length, 1);
  assert.equal(runtime.generatedThoughts[0]?.disposition, "surfaced");
});

test("gradeListenLiveAnswer flags generic and missing anchor answers", () => {
  const moment = readyMoment();
  const q = generateQuestionFromMoment(moment)!;
  const weak = gradeListenLiveAnswer({
    answer: "Here are some general tips without specifics.",
    modelUsed: "gpt-5.5",
    routeUsed: "glass_direct",
    hasTranscript: true,
    question: q,
    transcriptText: moment.transcriptAnchors[0],
  });
  assert.equal(weak.verdict, "weak");
  assert.ok(weak.flags.includes("generic_answer"));
});

test("gradeMediaExtraction reports extraction without hardcoding channel", () => {
  const media = extractMediaContext({
    windowTitle: "$4 billion founder: the next three years will make 100 new founders rich - YouTube",
    browserUrl: "https://www.youtube.com/watch?v=abc",
  });
  const grade = gradeMediaExtraction(media);
  assert.ok(grade.captured);
  assert.ok(grade.notes.some((n) => /YouTube/i.test(n)));
  assert.ok(grade.notes.some((n) => /Title extracted/i.test(n)));
});

test("parseListenLiveCli defaults to 60 minutes and auto mode", () => {
  const cli = parseListenLiveCli([]);
  assert.equal(cli.minutes, 60);
  assert.equal(cli.manual, false);
  assert.equal(cli.attach, false);
  assert.equal(cli.keepGlass, false);
});

test("parseListenLiveCli accepts minutes override", () => {
  const cli = parseListenLiveCli(["--minutes", "15"]);
  assert.equal(cli.minutes, 15);
  assert.equal(cli.manual, false);
  assert.equal(cli.attach, false);
  assert.equal(cli.keepGlass, false);
});

test("parseListenLiveCli supports manual attach keep-glass", () => {
  const cli = parseListenLiveCli(["--manual", "--attach", "--keep-glass", "--minutes", "60"]);
  assert.equal(cli.minutes, 60);
  assert.equal(cli.manual, true);
  assert.equal(cli.attach, true);
  assert.equal(cli.keepGlass, true);
});

test("parseListenLiveCli supports video URL and auto-fix", () => {
  const cli = parseListenLiveCli([
    "--url",
    "https://www.youtube.com/watch?v=AuW-7YGkb0g&t=894s",
    "--auto-fix",
  ]);
  assert.equal(cli.videoUrl, "https://www.youtube.com/watch?v=AuW-7YGkb0g&t=894s");
  assert.equal(cli.autoFix, true);
});

test("gradeListenHarnessQuality fails early proactive card", () => {
  const runtime = createListenHarnessRuntime("balanced");
  runtime.listenStartedMs = Date.now() - 60_000;
  runtime.firstProactiveCardMs = 30_000;
  runtime.generatedThoughts.push({
    momentId: "m1",
    thought: "Early thought",
    disposition: "surfaced",
    reasonSelected: "test",
    at: new Date().toISOString(),
    cardVague: false,
    hasFullText: true,
  });
  const grade = gradeListenHarnessQuality({ runtime, listenWarmupMs: 120_000 });
  assert.ok(grade.failures.some((f) => /before warm-up/i.test(f)));
});

test("summarizeMomentStats counts lifecycle buckets", () => {
  const stats = summarizeMomentStats([
    readyMoment({ status: "developing" }),
    readyMoment({ id: "m2", status: "saved_silently" }),
    readyMoment({ id: "m3", status: "stale" }),
  ]);
  assert.equal(stats.detected, 3);
  assert.equal(stats.developing, 1);
  assert.equal(stats.savedSilently, 1);
  assert.equal(stats.stale, 1);
});

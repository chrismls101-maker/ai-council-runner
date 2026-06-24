import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure transcript assembly mirrors buildSessionTranscript fallback logic.
 */
function assembleTranscript(opts: {
  agentType?: string | null;
  title?: string | null;
  messages: Array<{ role: string; content: string }>;
  runs: Array<{ agent_id: string; output: string | null; correlation_id: string; run_order: number; completed_at: number | null }>;
}): string {
  const preferAgentRuns = opts.agentType === "council";

  if (!preferAgentRuns && opts.messages.length) {
    return opts.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  }

  const lines: string[] = [];
  if (opts.title?.trim()) {
    lines.push(`user: ${opts.title.trim()}`);
  }

  let latestCorrelation = opts.runs[0]?.correlation_id;
  let latestTime = opts.runs[0]?.completed_at ?? 0;
  for (const run of opts.runs) {
    const time = run.completed_at ?? 0;
    if (time >= latestTime) {
      latestTime = time;
      latestCorrelation = run.correlation_id;
    }
  }

  for (const run of opts.runs.filter((r) => r.correlation_id === latestCorrelation)) {
    if (run.output?.trim()) {
      lines.push(`${run.agent_id}: ${run.output}`);
    }
  }

  if (lines.length) return lines.join("\n");

  return opts.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

test("council transcript prefers agent runs over unrelated messages", () => {
  const text = assembleTranscript({
    agentType: "council",
    title: "Should we ship?",
    messages: [
      { role: "user", content: "old research question" },
      { role: "assistant", content: "old research answer" },
    ],
    runs: [
      { agent_id: "strategy", output: "Plan A", correlation_id: "c2", run_order: 0, completed_at: 200 },
      { agent_id: "judge", output: "Ship it", correlation_id: "c2", run_order: 2, completed_at: 200 },
      { agent_id: "strategy", output: "Stale", correlation_id: "c1", run_order: 0, completed_at: 100 },
    ],
  });

  assert.match(text, /user: Should we ship\?/);
  assert.match(text, /strategy: Plan A/);
  assert.match(text, /judge: Ship it/);
  assert.doesNotMatch(text, /old research/);
  assert.doesNotMatch(text, /Stale/);
});

test("chat transcript uses messages when not council", () => {
  const text = assembleTranscript({
    agentType: "chat",
    title: "Hello",
    messages: [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello there" },
    ],
    runs: [],
  });

  assert.equal(text, "user: Hi\nassistant: Hello there");
});

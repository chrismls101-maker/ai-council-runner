import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDesignToCodeMemoryIngestion,
  isExplicitDesignToCodeRememberText,
} from "../shared/design/designToCodeMemoryIngestion.ts";

const NOW = Date.parse("2026-06-28T12:00:00Z");

function projects(
  items: Array<{
    stack?: "react-tsx" | "react-tailwind";
    action?: "react" | "html";
    status: "ready" | "warning" | "failed";
    daysAgo: number;
    revisions?: number;
  }>,
) {
  return items.map((p) => ({
    stack: p.stack,
    action: p.action,
    status: p.status,
    updatedAt: NOW - p.daysAgo * 24 * 60 * 60 * 1000,
    revisionCount: p.revisions,
  }));
}

describe("designToCodeMemoryIngestion", () => {
  test("detects explicit remember phrases", () => {
    assert.equal(
      isExplicitDesignToCodeRememberText("remember I prefer tailwind for design to code"),
      true,
    );
    assert.equal(isExplicitDesignToCodeRememberText("hello world"), false);
  });

  test("ingests save failure pattern after second failure", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "save_failed",
      stack: "react-tsx",
      action: "react",
      error: "disk full",
      projects: projects([
        { stack: "react-tsx", action: "react", status: "failed", daysAgo: 1 },
      ]),
      now: NOW,
    });
    assert.ok(decisions.some((d) => d.kind === "episodic" && d.tag.includes("failure:save")));
  });

  test("does not ingest episodic memory on first save alone", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "save_succeeded",
      stack: "react-tsx",
      action: "react",
      projects: [],
      now: NOW,
    });
    assert.equal(decisions.length, 0);
  });

  test("does not ingest preference until three successes", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "save_succeeded",
      stack: "react-tsx",
      action: "react",
      projects: projects([
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 1 },
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 2 },
      ]),
      now: NOW,
    });
    assert.equal(decisions.some((d) => d.kind === "preference"), false);
  });

  test("ingests preferred stack after three successes", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "save_succeeded",
      stack: "react-tsx",
      action: "react",
      projects: projects([
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 1 },
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 2 },
        { stack: "react-tsx", action: "react", status: "warning", daysAgo: 3 },
      ]),
      now: NOW,
    });
    const pref = decisions.find((d) => d.kind === "preference" && d.key.includes("stack"));
    assert.ok(pref);
    assert.match(String(pref && pref.kind === "preference" ? pref.value : ""), /React/);
  });

  test("explicit_remember only stores explicit episodic memory", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "explicit_remember",
      stack: "react-tsx",
      action: "react",
      projects: projects([
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 1 },
      ]),
      explicitRememberText: "remember to use design to code for landing pages",
      now: NOW,
    });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.kind, "episodic");
  });

  test("ingests refinement workflow pattern", () => {
    const decisions = evaluateDesignToCodeMemoryIngestion({
      event: "save_succeeded",
      stack: "react-tsx",
      action: "react",
      projects: projects([
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 1, revisions: 2 },
        { stack: "react-tsx", action: "react", status: "ready", daysAgo: 2, revisions: 1 },
      ]),
      now: NOW,
    });
    assert.ok(decisions.some((d) => d.kind === "episodic" && d.tag === "d2c:workflow:refine"));
  });
});

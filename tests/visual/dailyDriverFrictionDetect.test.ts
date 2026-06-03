/**
 * Unit tests for Daily Driver automatic friction detection.
 * Run via Playwright project (imports resolve .ts → .js).
 */
import { test, expect } from "@playwright/test";
import {
  buildMemoryBleedMessage,
  buildWrongRouteMessage,
  scoreScenarioFriction,
} from "./dailyDriverAutoDetect.js";
import type { DailyDriverScenario } from "./dailyDriverScenarios.js";

function stubScenario(partial: Partial<DailyDriverScenario> & Pick<DailyDriverScenario, "id" | "prompt">): DailyDriverScenario {
  return {
    title: partial.id,
    category: partial.category ?? "support",
    audience: partial.audience ?? "general",
    tags: partial.tags ?? [],
    kind: "prompt_run",
    requiredSignals: partial.requiredSignals ?? [],
    forbiddenSignals: partial.forbiddenSignals ?? [],
    maxSeconds: 120,
    contextRequired: partial.contextRequired ?? false,
    screenshotRequired: false,
    liveVisionRequired: false,
    liveProviderRequired: true,
    failureSeverity: partial.failureSeverity ?? "major",
    defaultRun: false,
    forbidSelfReference: true,
    ...partial,
  } as DailyDriverScenario;
}

test.describe("Daily Driver auto friction detection", () => {
  test("catches wrong route for support billing", () => {
    const scenario = stubScenario({
      id: "support-billing-access",
      category: "support",
      tags: ["@support"],
      prompt:
        "A customer says: 'Your app charged me but I can't access my account.' Write a calm support response.",
      expectedRoute: /direct answer/i,
    });
    const scored = scoreScenarioFriction(
      scenario,
      "Sorry for the trouble. Please email support@example.com.",
      "Sales Attack · 85% confidence",
    );
    expect(scored.frictions).toContain("wrong_route");
    expect(scored.autoIssues.some((i) => i.type === "wrong_route")).toBe(true);
    expect(scored.agentMessages.some((m) => /Direct Answer/i.test(m))).toBe(true);
  });

  test("catches memory bleed for jewelry ecommerce", () => {
    const scenario = stubScenario({
      id: "ecommerce-jewelry-conversion",
      category: "ecommerce",
      tags: ["@ecommerce"],
      prompt: "An online jewelry store has traffic but low conversions. What should they check first?",
      failureSeverity: "blocker",
      memoryBleedForbiddenTerms: ["AI Front Desk", "SMS follow-up"],
    });
    const answer =
      "Check product photos. Based on AI Front Desk pilots, also consider SMS follow-up.";
    const scored = scoreScenarioFriction(scenario, answer, "Direct Answer");
    expect(scored.frictions).toContain("memory_bleed");
    expect(scored.autoIssues.some((i) => i.type === "memory_bleed")).toBe(true);
  });

  test("does not false-flag allowed missed-call recovery on HVAC", () => {
    const scenario = stubScenario({
      id: "sales-hvac-cold-email",
      category: "sales",
      tags: ["@sales"],
      prompt:
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
      allowedTerms: ["missed-call recovery", "missed calls", "HVAC", "pilot"],
      expectedRoute: /sales attack/i,
    });
    const answer =
      "Subject: Recover missed calls\n\nHi — we help HVAC owners with missed-call recovery via a paid pilot.";
    const scored = scoreScenarioFriction(scenario, answer, "Sales Attack");
    expect(scored.autoIssues.filter((i) => i.type === "memory_bleed")).toHaveLength(0);
  });

  test("buildWrongRouteMessage explains support vs sales", () => {
    const scenario = stubScenario({
      id: "support-test",
      category: "support",
      prompt: "Write a calm support response.",
    });
    const msg = buildWrongRouteMessage(scenario, "Sales Attack");
    expect(msg).toMatch(/support/i);
    expect(msg).toMatch(/Sales Attack/i);
  });

  test("marketing hero rewrite expects Direct Answer not Sales Attack", () => {
    const scenario = stubScenario({
      id: "marketing-jargon-hero",
      category: "marketing",
      tags: ["@marketing", "@rewrite"],
      prompt:
        "A startup homepage says: 'We leverage AI to optimize workflows.' Rewrite the hero so a normal business owner understands it.",
      expectedRoute: /direct answer/i,
      acceptedRoutes: [/direct answer/i],
    });
    const salesMsg = buildWrongRouteMessage(
      scenario,
      "Sales Attack · 90% confidence",
    );
    expect(salesMsg).toMatch(/Direct Answer/i);
    const directMsg = buildWrongRouteMessage(scenario, "Direct Answer");
    expect(directMsg).toBeNull();
    const scored = scoreScenarioFriction(
      scenario,
      "We help you finish work faster without the buzzwords.",
      "Sales Attack",
      { durationMs: 130_000 },
    );
    expect(scored.frictions).toContain("wrong_route");
    expect(scored.frictions).toContain("over_routed");
  });

  test("founder SaaS validation accepts Product Decision route", () => {
    const scenario = stubScenario({
      id: "founder-saas-1500-14days",
      category: "founder",
      tags: ["@founder"],
      prompt:
        "I have $1,500 and 14 days to validate a SaaS idea. Should I build a demo, run cold outreach, or create a landing page first?",
      expectedRoute: /product decision/i,
      acceptedRoutes: [/product decision/i, /direct answer/i],
    });
    const msg = buildWrongRouteMessage(scenario, "Product Decision · 82% confidence");
    expect(msg).toBeNull();
    const salesMsg = buildWrongRouteMessage(scenario, "Sales Attack");
    expect(salesMsg).toMatch(/Product Decision|Direct Answer/i);
  });

  test("HVAC cold email flags delayed SMS contamination", () => {
    const scenario = stubScenario({
      id: "sales-hvac-cold-email",
      category: "sales",
      tags: ["@sales"],
      prompt:
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
      allowedTerms: ["missed-call recovery", "HVAC", "pilot"],
      expectedRoute: /sales attack/i,
      memoryBleedForbiddenTerms: ["delayed SMS", "SMS follow-up", "0 pilots", "Relevant Past Outcome"],
    });
    const answer =
      "Subject: Pilot offer\n\nWe ran delayed SMS follow-up with 0 pilots. Relevant Past Outcome suggests waiting.";
    const scored = scoreScenarioFriction(scenario, answer, "Sales Attack");
    expect(scored.frictions).toContain("memory_bleed");
    expect(scored.forbiddenHit).toEqual(
      expect.arrayContaining(["delayed SMS", "SMS follow-up", "0 pilots"]),
    );
  });

  test("product priority allows SMS alerts but blocks delayed SMS", () => {
    const scenario = stubScenario({
      id: "product-priority-export",
      category: "product",
      tags: ["@product"],
      prompt:
        "Users keep asking for CSV export, dashboard filters, and SMS alerts. Which should a small SaaS team build first?",
      allowedTerms: ["SMS alerts", "sms alerts"],
      memoryBleedForbiddenTerms: ["delayed SMS", "AI Front Desk", "0 pilots"],
    });
    const answer = "Build CSV export first. SMS alerts can wait; skip delayed SMS from AI Front Desk.";
    const scored = scoreScenarioFriction(scenario, answer, "Product Decision");
    expect(scored.forbiddenHit).toContain("delayed SMS");
    expect(scored.forbiddenHit).toContain("AI Front Desk");
    expect(scored.forbiddenHit).not.toContain("SMS alerts");
  });

  test("cold email with Final Action Plan opener fails contract scoring", () => {
    const scenario = stubScenario({
      id: "sales-hvac-cold-email",
      category: "sales",
      prompt:
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
      expectedRoute: /sales attack/i,
    });
    const bad = "## Final Action Plan\n### Do This First\n\nSubject: Pilot";
    const scored = scoreScenarioFriction(scenario, bad, "Sales Attack");
    expect(scored.frictions).toContain("wrong_output_format");
    expect(scored.frictions).toContain("contract_violation");
  });

  test("cold email with subject and body passes contract scoring", () => {
    const scenario = stubScenario({
      id: "sales-hvac-cold-email",
      category: "sales",
      prompt:
        "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
    });
    const good =
      "Subject: Recover missed calls\n\nHi — we help HVAC shops capture missed calls with a 14-day pilot.\n\nReply YES to start.";
    const scored = scoreScenarioFriction(scenario, good, "Sales Attack");
    expect(scored.frictions).not.toContain("wrong_output_format");
    expect(scored.frictions).not.toContain("deliverable_not_first");
  });

  test("buildMemoryBleedMessage notes allowed terms", () => {
    const scenario = stubScenario({
      id: "hvac",
      prompt: "missed-call recovery pilot",
    });
    const msg = buildMemoryBleedMessage(scenario, "missed-call recovery", ["missed-call recovery"]);
    expect(msg).toMatch(/allowed/i);
  });
});

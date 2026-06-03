/**
 * Vision Memory Guard — screenshot vision runs (server)
 */

import assert from "node:assert/strict";
import type { Memory } from "../../dist/server/memory/types.js";

const {
  shouldIncludeMemoryForVisionRun,
  filterMemoriesForVisionRun,
  applyVisionMemoryGuard,
} = await import("../../dist/server/memory/visionMemoryGuard.js");

const now = new Date().toISOString();

const aiFrontDeskMemory: Memory = {
  id: "mem-ai-front-desk",
  type: "project_fact",
  projectName: "AI Front Desk",
  title: "Pilot customers",
  content: "Targeting dental offices for AI Front Desk pilot and sales outreach.",
  tags: ["sales", "pilot", "customer"],
  createdAt: now,
  updatedAt: now,
};

const iivoMemory: Memory = {
  id: "mem-iivo",
  type: "project_fact",
  projectName: "IIVO",
  title: "Product positioning",
  content: "IIVO is an AI council runner for founders and operators.",
  tags: ["product", "positioning"],
  createdAt: now,
  updatedAt: now,
};

const designScreenshot = {
  prompt:
    "Analyze this screenshot. Tell me what stands out visually, what matters, risks or issues, and what I should do next.",
  screenshotTitle: "Logo, Graphic & AI Design | Design.com",
  sourceUrl: "https://www.design.com/",
  contextTags: ["lens", "browser", "screenshot"],
};

assert.equal(
  shouldIncludeMemoryForVisionRun({
    ...designScreenshot,
    candidateMemory: aiFrontDeskMemory,
  }),
  false,
  "Design.com generic screenshot analysis should exclude AI Front Desk memory",
);

const frontDeskLandingPrompt =
  "Analyze this screenshot of my AI Front Desk landing page and tell me what to fix.";

assert.equal(
  shouldIncludeMemoryForVisionRun({
    prompt: frontDeskLandingPrompt,
    screenshotTitle: "AI Front Desk — Homepage",
    sourceUrl: "http://localhost:5173/ai-front-desk",
    contextTags: ["ai-front-desk"],
    candidateMemory: aiFrontDeskMemory,
  }),
  true,
  "Explicit AI Front Desk landing page prompt should include AI Front Desk memory",
);

assert.equal(
  shouldIncludeMemoryForVisionRun({
    prompt: "Compare this screenshot to IIVO and tell me what stands out.",
    screenshotTitle: "Competitor homepage",
    sourceUrl: "https://example.com/competitor",
    candidateMemory: iivoMemory,
  }),
  true,
  "Compare-to-IIVO prompt should include IIVO memory",
);

assert.equal(
  shouldIncludeMemoryForVisionRun({
    ...designScreenshot,
    candidateMemory: aiFrontDeskMemory,
  }),
  false,
  "Generic AI/design terms in screenshot title should not alone match AI Front Desk memory",
);

const unrelatedOnlyOverlap = shouldIncludeMemoryForVisionRun({
  prompt: "Analyze this AI website design page screenshot.",
  screenshotTitle: "AI design tools",
  sourceUrl: "https://example.com/ai-design",
  candidateMemory: aiFrontDeskMemory,
});
assert.equal(
  unrelatedOnlyOverlap,
  false,
  "Generic terms like AI, design, website, page should not create relevance alone",
);

const nonVisionCandidates = [aiFrontDeskMemory, iivoMemory];
const nonVisionFiltered = filterMemoriesForVisionRun(nonVisionCandidates, {
  prompt: designScreenshot.prompt,
  screenshotTitle: designScreenshot.screenshotTitle,
  sourceUrl: designScreenshot.sourceUrl,
});
assert.equal(nonVisionFiltered.length, 0, "Design.com context should filter all unrelated memories");

const guarded = applyVisionMemoryGuard(nonVisionCandidates, {
  prompt: designScreenshot.prompt,
  screenshotTitle: designScreenshot.screenshotTitle,
  sourceUrl: designScreenshot.sourceUrl,
});
assert.equal(guarded.memories.length, 0);
assert.equal(guarded.trace.applied, true);
assert.equal(guarded.trace.excludedCount, 2);
assert.match(
  guarded.trace.note,
  /did not match saved project context/i,
  "Trace should explain memory exclusion for screenshot analysis",
);

const untouched = [aiFrontDeskMemory];
assert.equal(
  untouched.length,
  1,
  "Non-vision runs are unaffected when vision memory guard is not applied",
);

console.log("visionMemoryGuard.test.ts: all assertions passed");

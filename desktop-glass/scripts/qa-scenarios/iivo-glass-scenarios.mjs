// IIVO Glass QA scenario bank — 100+ rotating scenarios for deep/overnight QA.
//
// testKind:
//   simulated              — transcript/screen context injected (Copilot brain)
//   controlled_visual_fixture — local HTML fixture for visual ask (not real YouTube/audio)

export const SCENARIO_CATEGORIES = [
  "founder_strategy",
  "executive_review",
  "video_learning",
  "meeting_call",
  "research_comparison",
  "coding_building",
  "sales_review",
  "studying",
  "creator_content",
  "general_user",
  "diagnostic_setup_loop",
  "diagnostic_error_loop",
  "privacy_retention",
  "open_in_iivo",
  "visual_ask",
  "session_debrief",
];

export const PROMPT_VARIETY = [
  "What matters here?",
  "What should I do next?",
  "Turn this into action steps.",
  "What is the risk?",
  "What did I miss?",
  "Summarize the session.",
  "Create an AI prompt from this.",
  "Diagnose what keeps failing.",
  "What should I remember?",
  "Give me the report.",
];

export const FIXTURE_PAGES = {
  "fake-error.html": {
    path: "tests/fixtures/visual-pages/fake-error.html",
    keywords: ["VITE_SUPABASE_URL", "build", "error", "env"],
    label: "coding error page",
  },
  "fake-dashboard.html": {
    path: "tests/fixtures/visual-pages/fake-dashboard.html",
    keywords: ["MRR", "churn", "support", "revenue", "risk"],
    label: "executive dashboard",
  },
  "fake-youtube-tutorial.html": {
    path: "tests/fixtures/visual-pages/fake-youtube-tutorial.html",
    keywords: ["invest", "index fund", "diversify", "tutorial"],
    label: "tutorial page (fixture, not real YouTube)",
  },
  "fake-meeting-notes.html": {
    path: "tests/fixtures/visual-pages/fake-meeting-notes.html",
    keywords: ["agenda", "action", "follow up", "meeting"],
    label: "meeting notes page",
  },
  "fake-sales-crm.html": {
    path: "tests/fixtures/visual-pages/fake-sales-crm.html",
    keywords: ["prospect", "pipeline", "demo", "objection", "deal"],
    label: "CRM/prospect page",
  },
  "fake-research-comparison.html": {
    path: "tests/fixtures/visual-pages/fake-research-comparison.html",
    keywords: ["ChatGPT", "Claude", "Perplexity", "compare", "research"],
    label: "research comparison page",
  },
  "fake-study-lecture.html": {
    path: "tests/fixtures/visual-pages/fake-study-lecture.html",
    keywords: ["exam", "homework", "study", "lecture", "biology"],
    label: "study/lecture page",
  },
};

/** @typedef {'simulated'|'controlled_visual_fixture'} TestKind */

/**
 * @typedef {object} QaScenario
 * @property {string} id
 * @property {string} category
 * @property {string} title
 * @property {string} userPrompt
 * @property {string[]} transcriptChunks
 * @property {string} screenContextText
 * @property {string} [appName]
 * @property {string} [windowTitle]
 * @property {string} expectedSessionType
 * @property {string[]} expectedInsightTypes
 * @property {string} expectedBehavior
 * @property {string[]} passCriteria
 * @property {boolean} liveAllowed
 * @property {boolean} requiresManual
 * @property {TestKind} testKind
 * @property {string|null} fixturePage
 * @property {string[]} [fixtureExpectedKeywords]
 * @property {string} [copilotMode]
 */

/** Seeded PRNG (mulberry32) for reproducible shuffles. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed(items, seed) {
  const rng = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scenario(base) {
  const merged = {
    requiresManual: false,
    testKind: "simulated",
    fixturePage: null,
    fixtureExpectedKeywords: [],
    copilotMode: "passive",
    ...base,
  };
  if (
    merged.fixturePage &&
    (!merged.fixtureExpectedKeywords || merged.fixtureExpectedKeywords.length === 0)
  ) {
    merged.fixtureExpectedKeywords = FIXTURE_PAGES[merged.fixturePage]?.keywords ?? [];
  }
  return merged;
}

function buildCategoryScenarios(category, count, factory) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push(factory(i));
  }
  return out;
}

function buildAllScenarios() {
  /** @type {QaScenario[]} */
  const all = [];

  const prompts = PROMPT_VARIETY;

  all.push(
    ...buildCategoryScenarios("founder_strategy", 7, (i) =>
      scenario({
        id: `founder_strategy_${String(i).padStart(2, "0")}`,
        category: "founder_strategy",
        title: `Founder strategy ${i}`,
        userPrompt: prompts[(i - 1) % prompts.length],
        transcriptChunks: [
          `Our go-to-market strategy for product ${i} depends on pricing and market positioning.`,
          `We must decide the revenue model before the investor roadmap update.`,
          `There is a risk the competitor undercuts us on enterprise deals.`,
        ],
        screenContextText: `Strategy doc: pricing tiers, TAM analysis, investor deck slide ${i}`,
        appName: "Notion",
        windowTitle: "GTM strategy — Q3 roadmap",
        expectedSessionType: "business_strategy",
        expectedInsightTypes: ["action", "risk", "opportunity"],
        expectedBehavior: i % 2 === 0 ? "coaching_card" : "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted", "no_council", "no_silent_upload"],
        liveAllowed: i <= 5,
        copilotMode: i % 3 === 0 ? "coaching" : "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("executive_review", 7, (i) =>
      scenario({
        id: `executive_review_${String(i).padStart(2, "0")}`,
        category: "executive_review",
        title: `Executive review ${i}`,
        userPrompt: i % 2 === 0 ? "Give me the report." : "What is the risk?",
        transcriptChunks: [
          `Quarterly review dashboard KPI OKR board deck priorities for division ${i}.`,
          `MRR trend and churn metrics need executive attention before the board meeting.`,
        ],
        screenContextText: "Executive dashboard: MRR down, churn up, support tickets rising",
        appName: "Google Sheets",
        windowTitle: "Q2 Board deck",
        expectedSessionType: "business_strategy",
        expectedInsightTypes: ["risk", "action"],
        expectedBehavior: "debrief",
        passCriteria: ["session_type_match", "debrief_section", "no_council"],
        liveAllowed: i <= 4,
        copilotMode: "passive",
        fixturePage: i === 1 ? "fake-dashboard.html" : null,
        fixtureExpectedKeywords: i === 1 ? FIXTURE_PAGES["fake-dashboard.html"].keywords : [],
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("video_learning", 7, (i) =>
      scenario({
        id: `video_learning_${String(i).padStart(2, "0")}`,
        category: "video_learning",
        title: `Video learning ${i} (simulated transcript)`,
        userPrompt: "What should I remember?",
        transcriptChunks: [
          `Watching this tutorial on lesson ${i}: diversify portfolio and dollar-cost average.`,
          `The instructor says you must rebalance quarterly and avoid timing the market.`,
        ],
        screenContextText: "Simulated video transcript — NOT real YouTube playback",
        appName: "Google Chrome",
        windowTitle: `How to invest — YouTube (simulated)`,
        expectedSessionType: "video_learning",
        expectedInsightTypes: ["key_idea", "action"],
        expectedBehavior: "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted", "simulated_not_real_audio"],
        liveAllowed: i <= 3,
        copilotMode: "passive",
        fixturePage: i === 2 ? "fake-youtube-tutorial.html" : null,
        testKind: i === 2 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("meeting_call", 7, (i) =>
      scenario({
        id: `meeting_call_${String(i).padStart(2, "0")}`,
        category: "meeting_call",
        title: `Meeting call ${i} (simulated transcript)`,
        userPrompt: "Summarize the session.",
        transcriptChunks: [
          `Let's discuss the agenda and action items for sprint ${i}.`,
          `Follow up with the team on blockers before next meeting.`,
        ],
        screenContextText: "Simulated meeting notes — NOT real call audio",
        appName: "Zoom",
        windowTitle: "Product sync — agenda",
        expectedSessionType: "meeting_call",
        expectedInsightTypes: ["action", "question"],
        expectedBehavior: "debrief",
        passCriteria: ["session_type_match", "debrief_section", "simulated_not_real_audio"],
        liveAllowed: i <= 3,
        copilotMode: "passive",
        fixturePage: i === 1 ? "fake-meeting-notes.html" : null,
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("research_comparison", 7, (i) =>
      scenario({
        id: `research_comparison_${String(i).padStart(2, "0")}`,
        category: "research_comparison",
        title: `Research comparison ${i}`,
        userPrompt: "What did I miss?",
        transcriptChunks: [
          `Compare ChatGPT Claude and Perplexity for workflow ${i}.`,
          `According to these sources the findings suggest different strengths for research.`,
        ],
        screenContextText: "Research notes comparing AI tools and sources",
        appName: "Perplexity",
        windowTitle: "AI tool comparison",
        expectedSessionType: "research",
        expectedInsightTypes: ["key_idea", "question"],
        expectedBehavior: "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted"],
        liveAllowed: i <= 5,
        copilotMode: "passive",
        fixturePage: i === 1 ? "fake-research-comparison.html" : null,
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("coding_building", 7, (i) =>
      scenario({
        id: `coding_building_${String(i).padStart(2, "0")}`,
        category: "coding_building",
        title: `Coding/building ${i}`,
        userPrompt: i % 2 === 0 ? "Create an AI prompt from this." : "Diagnose what keeps failing.",
        transcriptChunks: [
          `npm install failed with stack trace in the repo for module ${i}.`,
          `We must refactor this function and fix the broken deploy script before launch.`,
        ],
        screenContextText: "Terminal: build failed Missing VITE_SUPABASE_URL",
        appName: "Cursor",
        windowTitle: "ai-council-runner — refactor deploy",
        expectedSessionType: "coding_building",
        expectedInsightTypes: ["action", "risk"],
        expectedBehavior: i % 3 === 0 ? "coaching_card" : "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted", "no_council"],
        liveAllowed: i <= 4,
        copilotMode: i % 3 === 0 ? "coaching" : "passive",
        fixturePage: i === 1 ? "fake-error.html" : null,
        fixtureExpectedKeywords: i === 1 ? FIXTURE_PAGES["fake-error.html"].keywords : [],
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("sales_review", 7, (i) =>
      scenario({
        id: `sales_review_${String(i).padStart(2, "0")}`,
        category: "sales_review",
        title: `Sales review ${i}`,
        userPrompt: "Turn this into action steps.",
        transcriptChunks: [
          `Follow up with the prospect about objections on the cold email outreach batch ${i}.`,
          `The pipeline needs a demo before we close the deal this quarter.`,
        ],
        screenContextText: "CRM: prospect stage demo scheduled pricing objection",
        appName: "HubSpot",
        windowTitle: "Pipeline — outreach",
        expectedSessionType: "sales_review",
        expectedInsightTypes: ["action", "opportunity"],
        expectedBehavior: "coaching_card",
        passCriteria: ["session_type_match", "insight_extracted"],
        liveAllowed: i <= 4,
        copilotMode: "coaching",
        fixturePage: i === 1 ? "fake-sales-crm.html" : null,
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("studying", 7, (i) =>
      scenario({
        id: `studying_${String(i).padStart(2, "0")}`,
        category: "studying",
        title: `Studying ${i}`,
        userPrompt: "What should I remember?",
        transcriptChunks: [
          `Study for the exam and finish homework assignment ${i} on cell biology.`,
          `The lecture covered mitochondria ATP and membrane transport mechanisms.`,
        ],
        screenContextText: "Canvas lecture notes biology exam prep",
        appName: "Canvas",
        windowTitle: "Biology 101 — lecture",
        expectedSessionType: "studying",
        expectedInsightTypes: ["key_idea", "action"],
        expectedBehavior: "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted"],
        liveAllowed: i <= 3,
        copilotMode: "passive",
        fixturePage: i === 1 ? "fake-study-lecture.html" : null,
        testKind: i === 1 ? "controlled_visual_fixture" : "simulated",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("creator_content", 7, (i) =>
      scenario({
        id: `creator_content_${String(i).padStart(2, "0")}`,
        category: "creator_content",
        title: `Creator content ${i}`,
        userPrompt: "What matters here?",
        transcriptChunks: [
          `Content calendar thumbnail script draft for episode ${i} of the podcast.`,
          `Plan the hook and CTA for the next YouTube upload this week.`,
        ],
        screenContextText: "Notion content calendar and script outline",
        appName: "Notion",
        windowTitle: "Content calendar — episode plan",
        expectedSessionType: "business_strategy",
        expectedInsightTypes: ["action", "opportunity"],
        expectedBehavior: "passive_extract",
        passCriteria: ["session_type_match", "insight_extracted"],
        liveAllowed: i <= 2,
        copilotMode: "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("general_user", 7, (i) =>
      scenario({
        id: `general_user_${String(i).padStart(2, "0")}`,
        category: "general_user",
        title: `General user workflow ${i}`,
        userPrompt: prompts[i % prompts.length],
        transcriptChunks: [
          `General workflow task ${i}: organize files and respond to emails.`,
          `Need to prioritize tasks for the afternoon without a specific domain.`,
        ],
        screenContextText: "Desktop with email and task list",
        appName: "Finder",
        windowTitle: "Documents",
        expectedSessionType: "general_workflow",
        expectedInsightTypes: ["action"],
        expectedBehavior: "passive_extract",
        passCriteria: ["session_type_match"],
        liveAllowed: i <= 2,
        copilotMode: "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("diagnostic_setup_loop", 7, (i) =>
      scenario({
        id: `diagnostic_setup_loop_${String(i).padStart(2, "0")}`,
        category: "diagnostic_setup_loop",
        title: `Diagnostic setup loop ${i}`,
        userPrompt: "Diagnose what keeps failing.",
        transcriptChunks: [
          `Microphone permission denied for IIVO Glass setup attempt ${i}.`,
          `Toggled permission in System Settings but still failing no signal.`,
        ],
        screenContextText: "Setup panel: mic permission denied, screen not ready",
        appName: "IIVO Glass",
        windowTitle: "Setup — permissions",
        expectedSessionType: "general_workflow",
        expectedInsightTypes: ["risk"],
        expectedBehavior: "diagnostic_offer",
        passCriteria: ["diagnostic_offer", "no_auto_diagnose", "no_council"],
        liveAllowed: false,
        copilotMode: "diagnostic",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("diagnostic_error_loop", 7, (i) =>
      scenario({
        id: `diagnostic_error_loop_${String(i).padStart(2, "0")}`,
        category: "diagnostic_error_loop",
        title: `Diagnostic error loop ${i}`,
        userPrompt: "Diagnose what keeps failing.",
        transcriptChunks: [
          `Error: build failed with exit code 1 on attempt ${i}.`,
          `It failed again still broken after retry.`,
        ],
        screenContextText: "Repeated error in terminal",
        appName: "Terminal",
        windowTitle: "build output",
        expectedSessionType: "coding_building",
        expectedInsightTypes: ["risk", "action"],
        expectedBehavior: "diagnostic_offer",
        passCriteria: ["diagnostic_offer", "approval_required", "no_council"],
        liveAllowed: false,
        copilotMode: "diagnostic",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("privacy_retention", 7, (i) =>
      scenario({
        id: `privacy_retention_${String(i).padStart(2, "0")}`,
        category: "privacy_retention",
        title: `Privacy retention ${i}`,
        userPrompt: "What should I remember?",
        transcriptChunks: [`Visual ask used for answer ${i} — check retention policy.`],
        screenContextText: "Screen capture used ephemerally",
        expectedSessionType: "general_workflow",
        expectedInsightTypes: [],
        expectedBehavior: "privacy_no_upload",
        passCriteria: ["no_silent_upload", "no_base64_in_session", "retention_policy"],
        liveAllowed: false,
        copilotMode: "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("open_in_iivo", 7, (i) =>
      scenario({
        id: `open_in_iivo_${String(i).padStart(2, "0")}`,
        category: "open_in_iivo",
        title: `Open in IIVO handoff ${i}`,
        userPrompt: "Give me the report.",
        transcriptChunks: [
          `Session ${i} summary with insights and action items for handoff.`,
          `User explicitly opens in IIVO — not automatic upload.`,
        ],
        screenContextText: "Session panel with Open in IIVO button",
        expectedSessionType: "general_workflow",
        expectedInsightTypes: ["action"],
        expectedBehavior: "open_in_iivo",
        passCriteria: ["payload_has_summary", "no_base64", "user_action_only"],
        liveAllowed: false,
        copilotMode: "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("visual_ask", 7, (i) =>
      scenario({
        id: `visual_ask_${String(i).padStart(2, "0")}`,
        category: "visual_ask",
        title: `Visual ask fixture ${i}`,
        userPrompt: "What matters here?",
        transcriptChunks: [],
        screenContextText: "Controlled local HTML fixture — NOT real desktop screen",
        expectedSessionType: "general_workflow",
        expectedInsightTypes: [],
        expectedBehavior: "visual_fixture",
        passCriteria: ["fixture_keywords", "controlled_not_real_screen"],
        liveAllowed: i <= 5,
        requiresManual: false,
        testKind: "controlled_visual_fixture",
        fixturePage: Object.keys(FIXTURE_PAGES)[i % Object.keys(FIXTURE_PAGES).length],
        fixtureExpectedKeywords: FIXTURE_PAGES[Object.keys(FIXTURE_PAGES)[i % Object.keys(FIXTURE_PAGES).length]].keywords,
        copilotMode: "passive",
      }),
    ),
  );

  all.push(
    ...buildCategoryScenarios("session_debrief", 7, (i) =>
      scenario({
        id: `session_debrief_${String(i).padStart(2, "0")}`,
        category: "session_debrief",
        title: `Session debrief ${i}`,
        userPrompt: "Give me the report.",
        transcriptChunks: [
          `We must fix the broken deploy and automate the release for session ${i}.`,
          `I'm done — summarize takeaways actions and open questions.`,
        ],
        screenContextText: "Session ending — debrief requested",
        expectedSessionType: i % 2 === 0 ? "coding_building" : "meeting_call",
        expectedInsightTypes: ["action", "key_idea"],
        expectedBehavior: "debrief",
        passCriteria: ["debrief_trigger", "debrief_sections", "no_council"],
        liveAllowed: i <= 2,
        copilotMode: "passive",
      }),
    ),
  );

  return all;
}

export const SCENARIOS = buildAllScenarios();

export function getScenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export function scenariosByCategory(category) {
  return SCENARIOS.filter((s) => s.category === category);
}

export function validateScenarioBank() {
  const errors = [];
  const required = [
    "id",
    "category",
    "title",
    "userPrompt",
    "transcriptChunks",
    "screenContextText",
    "expectedSessionType",
    "expectedInsightTypes",
    "expectedBehavior",
    "passCriteria",
    "liveAllowed",
    "requiresManual",
  ];
  if (SCENARIOS.length < 100) {
    errors.push(`Expected >= 100 scenarios, got ${SCENARIOS.length}`);
  }
  const ids = new Set();
  for (const s of SCENARIOS) {
    for (const k of required) {
      if (s[k] === undefined) errors.push(`${s.id ?? "?"} missing field ${k}`);
    }
    if (ids.has(s.id)) errors.push(`Duplicate id ${s.id}`);
    ids.add(s.id);
    if (!SCENARIO_CATEGORIES.includes(s.category)) {
      errors.push(`${s.id} invalid category ${s.category}`);
    }
    if (!s.requiresManual && s.passCriteria.length === 0) {
      errors.push(`${s.id} has no passCriteria`);
    }
  }
  for (const cat of SCENARIO_CATEGORIES) {
    const n = scenariosByCategory(cat).length;
    if (n < 5) errors.push(`Category ${cat} has only ${n} scenarios (need >= 5)`);
  }
  return { ok: errors.length === 0, errors, count: SCENARIOS.length };
}

/** Mode limits for scenario + live execution. */
export const MODE_SCENARIO_LIMITS = {
  quick: { maxScenarios: 10, liveAiCap: 8, livePerCategoryCap: 2, scenariosPerCycle: 0 },
  standard: { maxScenarios: 40, liveAiCap: 15, livePerCategoryCap: 5, scenariosPerCycle: 0 },
  deep: { maxScenarios: 112, liveAiCap: 40, livePerCategoryCap: 8, scenariosPerCycle: 0 },
  overnight: { maxScenarios: Infinity, liveAiCap: 75, livePerCategoryCap: 10, scenariosPerCycle: 8 },
};

export function getOrderedScenarios(mode, seed) {
  const limits = MODE_SCENARIO_LIMITS[mode] ?? MODE_SCENARIO_LIMITS.quick;
  /** @type {QaScenario[]} */
  const selected = [];
  const seen = new Set();

  const add = (s) => {
    if (!s || seen.has(s.id)) return;
    seen.add(s.id);
    selected.push(s);
  };

  // Standard/deep/overnight: one scenario per category first so coverage is guaranteed.
  if (mode === "standard" || mode === "deep" || mode === "overnight") {
    for (const cat of SCENARIO_CATEGORIES) {
      const pool = SCENARIOS.filter((s) => s.category === cat && !s.requiresManual);
      const pick =
        pool.find((s) => s.liveAllowed && s.testKind === "simulated") ??
        pool.find((s) => s.liveAllowed) ??
        pool[0];
      add(pick);
    }
  }

  for (const s of shuffleWithSeed(SCENARIOS, seed)) {
    if (limits.maxScenarios !== Infinity && selected.length >= limits.maxScenarios) break;
    add(s);
  }

  if (limits.maxScenarios === Infinity) return selected;
  return selected.slice(0, limits.maxScenarios);
}

export function getScenarioBatch(ordered, offset, count) {
  if (ordered.length === 0) return [];
  const batch = [];
  for (let i = 0; i < count; i++) {
    batch.push(ordered[(offset + i) % ordered.length]);
  }
  return batch;
}

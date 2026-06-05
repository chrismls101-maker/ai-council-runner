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

/**
 * Rich meeting/call scenarios for meeting-intelligence QA. Each carries
 * decisions, action items, owners, deadlines, blockers and expected anchors so
 * answer quality (not just structure) can be graded. All simulated text — NOT
 * real call audio. meeting_call_01 is the controlled visual fixture.
 */
function buildMeetingScenarios() {
  /** @param {object} base */
  const m = (base) =>
    scenario({
      category: "meeting_call",
      expectedSessionType: "meeting_call",
      expectedInsightTypes: ["action", "question"],
      expectedBehavior: "debrief",
      passCriteria: ["session_type_match", "debrief_section", "simulated_not_real_audio"],
      liveAllowed: true,
      copilotMode: "passive",
      appName: "Zoom",
      ...base,
    });

  /** @type {QaScenario[]} */
  const defs = [
    m({
      id: "meeting_call_01",
      title: "Product sync (controlled visual fixture)",
      userPrompt: "What do you see on this screen?",
      transcriptChunks: [
        "Product sync agenda: review launch timeline, assign action items, confirm owners.",
      ],
      screenContextText: "Meeting notes page — agenda, action items, follow ups",
      windowTitle: "Product sync — agenda",
      testKind: "controlled_visual_fixture",
      fixturePage: "fake-meeting-notes.html",
      participants: ["Team"],
      decisions: ["Confirm launch timeline"],
      actionItems: ["Assign action items"],
      owners: [],
      deadlines: [],
      blockers: [],
      expectedAnchors: ["agenda", "action", "follow up"],
    }),
    m({
      id: "meeting_call_02",
      title: "Sprint planning with owners and deadlines",
      userPrompt: "Who owns what?",
      transcriptChunks: [
        "Attendees: Maria, Tom, Priya. This is Sprint 14 planning.",
        "Decision: we'll cut the billing migration from this sprint and focus on the API.",
        "Action item: Maria will own the API spec, due Friday.",
        "Action item: Tom will own the auth migration, due next week.",
        "Blocker: the staging database keeps resetting, dependency on the infra team.",
      ],
      screenContextText: "Jira sprint board — Sprint 14 — NOT real call audio",
      windowTitle: "Sprint 14 planning",
      participants: ["Maria", "Tom", "Priya"],
      decisions: ["Cut billing migration; focus on API"],
      actionItems: ["API spec (Maria, Fri)", "Auth migration (Tom, next week)"],
      owners: ["Maria", "Tom"],
      deadlines: ["Friday", "next week"],
      blockers: ["staging database resets"],
      expectedAnchors: ["Sprint 14", "Maria", "Tom", "API", "Friday"],
    }),
    m({
      id: "meeting_call_03",
      title: "Product sync with beta launch decision",
      userPrompt: "Summarize the session.",
      transcriptChunks: [
        "Attendees: Priya, Devin. Topic: beta launch readiness for the analytics module.",
        "Decision: we approved shipping the beta on October 14.",
        "Action item: Priya will own the release notes, due October 10.",
        "Risk: the onboarding flow still confuses first-time users.",
      ],
      screenContextText: "Launch checklist — beta readiness — NOT real call audio",
      windowTitle: "Beta launch readiness",
      participants: ["Priya", "Devin"],
      decisions: ["Ship beta on October 14"],
      actionItems: ["Release notes (Priya, Oct 10)"],
      owners: ["Priya"],
      deadlines: ["October 14", "October 10"],
      blockers: [],
      expectedAnchors: ["beta", "October 14", "Priya", "onboarding"],
    }),
    m({
      id: "meeting_call_04",
      title: "Sales discovery call with customer objections",
      userPrompt: "What are the blockers?",
      transcriptChunks: [
        "Discovery call with prospect Acme. Deal size around $42k ARR.",
        "Objection: they're concerned the onboarding time is too long.",
        "Objection: pricing is higher than their current vendor.",
        "Next step: schedule a technical demo next Tuesday.",
      ],
      screenContextText: "CRM — Acme opportunity — NOT real call audio",
      appName: "Google Meet",
      windowTitle: "Acme — discovery",
      participants: ["Acme"],
      decisions: [],
      actionItems: ["Schedule technical demo (Tuesday)"],
      owners: [],
      deadlines: ["next Tuesday"],
      blockers: ["onboarding time concern", "pricing objection"],
      expectedAnchors: ["Acme", "$42k", "onboarding", "pricing", "demo"],
    }),
    m({
      id: "meeting_call_05",
      title: "Executive review with KPI risks",
      userPrompt: "What is the risk?",
      transcriptChunks: [
        "Attendees: Dana (CFO), Alex (CEO). Quarterly business review.",
        "MRR is down 8% and churn rose to 5%. Support tickets are up 30%.",
        "Decision: pause new hiring until churn stabilizes.",
        "Action item: Dana will own the churn deep-dive, due end of week.",
      ],
      screenContextText: "Exec dashboard — MRR down, churn up — NOT real call audio",
      appName: "Microsoft Teams",
      windowTitle: "QBR — exec review",
      participants: ["Dana", "Alex"],
      decisions: ["Pause new hiring until churn stabilizes"],
      actionItems: ["Churn deep-dive (Dana, EOW)"],
      owners: ["Dana"],
      deadlines: ["end of week"],
      blockers: [],
      expectedAnchors: ["MRR", "churn", "8%", "hiring", "Dana"],
    }),
    m({
      id: "meeting_call_06",
      title: "Hiring / interview debrief",
      userPrompt: "What should I do next?",
      transcriptChunks: [
        "Interview debrief for candidate Jordan, senior backend role.",
        "Decision: move Jordan to the final round.",
        "Concern: system design answer was shallow on scaling.",
        "Action item: Sam (recruiter) will schedule the final panel, due Thursday.",
      ],
      screenContextText: "ATS — candidate Jordan — NOT real call audio",
      windowTitle: "Interview debrief — Jordan",
      participants: ["Jordan", "Sam"],
      decisions: ["Move Jordan to final round"],
      actionItems: ["Schedule final panel (Sam, Thu)"],
      owners: ["Sam"],
      deadlines: ["Thursday"],
      blockers: ["system design concern"],
      expectedAnchors: ["Jordan", "final round", "system design", "Sam"],
    }),
    m({
      id: "meeting_call_07",
      title: "Customer support escalation meeting",
      userPrompt: "Give me the report.",
      transcriptChunks: [
        "Escalation for customer Globex — a SEV1 outage on their tenant.",
        "Blocker: the third-party vendor API is returning 500s.",
        "Action item: Lee (on-call) will own the RCA, due by EOD.",
        "Decision: credit Globex for the downtime.",
      ],
      screenContextText: "Incident channel — Globex SEV1 — NOT real call audio",
      appName: "Slack huddle",
      windowTitle: "Globex escalation",
      participants: ["Lee"],
      decisions: ["Credit Globex for downtime"],
      actionItems: ["RCA (Lee, EOD)"],
      owners: ["Lee"],
      deadlines: ["EOD"],
      blockers: ["vendor API 500s"],
      expectedAnchors: ["Globex", "SEV1", "RCA", "Lee", "EOD"],
    }),
    m({
      id: "meeting_call_08",
      title: "Investor update prep",
      userPrompt: "What are the action items?",
      transcriptChunks: [
        "Investor update prep with founder Alex. ARR is $1.2M, growing 18% MoM.",
        "Decision: start raising a Series A this quarter.",
        "Action item: Alex will own the investor deck, due Monday.",
      ],
      screenContextText: "Deck draft — metrics slide — NOT real call audio",
      windowTitle: "Investor update",
      participants: ["Alex"],
      decisions: ["Raise Series A this quarter"],
      actionItems: ["Investor deck (Alex, Mon)"],
      owners: ["Alex"],
      deadlines: ["Monday"],
      blockers: [],
      expectedAnchors: ["$1.2M", "18%", "Series A", "Alex", "Monday"],
    }),
    m({
      id: "meeting_call_09",
      title: "Design review with unresolved onboarding issue",
      userPrompt: "What did I miss?",
      transcriptChunks: [
        "Design review with Nina. Topic: onboarding redesign.",
        "Open question: step 3 still has a 40% drop-off — root cause unclear.",
        "No decision yet; blocked on pending user research.",
      ],
      screenContextText: "Figma — onboarding flow — NOT real call audio",
      appName: "Zoom",
      windowTitle: "Design review — onboarding",
      participants: ["Nina"],
      decisions: [],
      actionItems: [],
      owners: ["Nina"],
      deadlines: [],
      blockers: ["pending user research"],
      expectedAnchors: ["Nina", "onboarding", "step 3", "40%", "no decision"],
    }),
    m({
      id: "meeting_call_10",
      title: "Engineering incident review",
      userPrompt: "Summarize the session.",
      transcriptChunks: [
        "Incident review: payment endpoint returned 500s for 20 minutes.",
        "Root cause: DATABASE_URL was rotated without updating the worker config.",
        "Action item: Raj will own adding alerting on payment errors, due this sprint.",
        "Decision: add a config-change checklist to the runbook.",
      ],
      screenContextText: "Postmortem doc — payment 500s — NOT real call audio",
      windowTitle: "Incident review",
      participants: ["Raj"],
      decisions: ["Add config-change checklist to runbook"],
      actionItems: ["Add payment-error alerting (Raj, this sprint)"],
      owners: ["Raj"],
      deadlines: ["this sprint"],
      blockers: [],
      expectedAnchors: ["payment", "500", "DATABASE_URL", "Raj", "alerting"],
    }),
    m({
      id: "meeting_call_11",
      title: "Marketing campaign review",
      userPrompt: "Turn this into action steps.",
      transcriptChunks: [
        "Q3 campaign review with Mia. CTR is 2.1% and CAC is $58.",
        "Decision: shift budget from Facebook to LinkedIn.",
        "Action item: Mia will own the LinkedIn creative refresh, due next week.",
      ],
      screenContextText: "Analytics — campaign metrics — NOT real call audio",
      windowTitle: "Q3 campaign review",
      participants: ["Mia"],
      decisions: ["Shift budget to LinkedIn"],
      actionItems: ["LinkedIn creative refresh (Mia, next week)"],
      owners: ["Mia"],
      deadlines: ["next week"],
      blockers: [],
      expectedAnchors: ["CTR", "2.1%", "CAC", "$58", "LinkedIn", "Mia"],
    }),
    m({
      id: "meeting_call_12",
      title: "Partnership negotiation",
      userPrompt: "What matters here?",
      transcriptChunks: [
        "Partnership call with Initech. Discussing a revenue-share deal.",
        "Open question: revenue split 70/30 vs 60/40 is unresolved.",
        "Blocker: their legal team must review the data-sharing clause.",
        "Action item: Chris (BD) will follow up next week.",
      ],
      screenContextText: "Term sheet draft — Initech — NOT real call audio",
      appName: "Google Meet",
      windowTitle: "Initech partnership",
      participants: ["Chris"],
      decisions: [],
      actionItems: ["Follow up on terms (Chris, next week)"],
      owners: ["Chris"],
      deadlines: ["next week"],
      blockers: ["legal review of data-sharing clause"],
      expectedAnchors: ["Initech", "revenue", "70/30", "legal", "Chris"],
    }),
    m({
      id: "meeting_call_13",
      title: "Thin / low-context meeting (details missing)",
      userPrompt: "What are the action items?",
      transcriptChunks: [
        "We talked about a few things and will probably follow up later.",
        "Someone should look into the thing we discussed.",
      ],
      screenContextText: "Sparse notes — NOT real call audio",
      windowTitle: "Quick sync",
      passCriteria: ["session_type_match", "missing_fields_called_out", "simulated_not_real_audio"],
      participants: [],
      decisions: [],
      actionItems: [],
      owners: [],
      deadlines: [],
      blockers: [],
      expectedAnchors: ["No owner given", "No deadline given", "No decision recorded"],
    }),
    m({
      id: "meeting_call_14",
      title: "Customer QBR with renewal risk",
      userPrompt: "What is the risk?",
      transcriptChunks: [
        "Quarterly business review with customer Umbrella. Usage is up 12%.",
        "Risk: their champion is leaving, renewal is now at risk.",
        "Action item: Pat (CSM) will own building a success plan, due Friday.",
      ],
      screenContextText: "CS dashboard — Umbrella account — NOT real call audio",
      appName: "Zoom",
      windowTitle: "Umbrella QBR",
      participants: ["Pat"],
      decisions: [],
      actionItems: ["Build success plan (Pat, Fri)"],
      owners: ["Pat"],
      deadlines: ["Friday"],
      blockers: ["champion leaving — renewal risk"],
      expectedAnchors: ["Umbrella", "12%", "renewal", "Pat", "success plan"],
    }),
    m({
      id: "meeting_call_15",
      title: "Daily standup with blockers",
      userPrompt: "What are the blockers?",
      transcriptChunks: [
        "Standup. Dev is blocked waiting on a code review for the search PR.",
        "Action item: Sam will unblock by reviewing the PR this morning.",
        "No formal decision — just status updates.",
      ],
      screenContextText: "Standup board — NOT real call audio",
      windowTitle: "Daily standup",
      participants: ["Sam"],
      decisions: [],
      actionItems: ["Review search PR (Sam, this morning)"],
      owners: ["Sam"],
      deadlines: ["this morning"],
      blockers: ["waiting on code review for search PR"],
      expectedAnchors: ["standup", "code review", "search PR", "Sam", "no decision"],
    }),
    m({
      id: "meeting_call_16",
      title: "Roadmap planning with prioritization decision",
      userPrompt: "What should I do next?",
      transcriptChunks: [
        "Roadmap planning with Wei and Carlos for Q4.",
        "Decision: prioritize the mobile app over the public API, it's the top priority.",
        "Action item: Wei will own the mobile scoping doc, due Wednesday.",
        "Risk: the API customers may churn if we deprioritize their requests.",
      ],
      screenContextText: "Roadmap board — Q4 priorities — NOT real call audio",
      windowTitle: "Q4 roadmap planning",
      participants: ["Wei", "Carlos"],
      decisions: ["Prioritize mobile app over public API"],
      actionItems: ["Mobile scoping doc (Wei, Wed)"],
      owners: ["Wei"],
      deadlines: ["Wednesday"],
      blockers: ["API customers may churn"],
      expectedAnchors: ["Q4", "mobile", "Wei", "Wednesday", "API", "churn"],
    }),
  ];
  return defs;
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

  all.push(...buildMeetingScenarios());

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
        liveAllowed: i <= 4,
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
        liveAllowed: i <= 4,
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
        liveAllowed: i <= 7,
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
        liveAllowed: i <= 4,
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

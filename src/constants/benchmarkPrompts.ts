export type BenchmarkPromptCategory =
  | "Founder Strategy"
  | "Product Decision"
  | "Sales / GTM"
  | "Competitive Positioning"
  | "Technical Risk"
  | "Market Research"
  | "IIVO Positioning"
  | "Decision Learning";

export type BenchmarkPromptDifficulty = "simple" | "medium" | "hard";

export interface BenchmarkPromptDefinition {
  id: string;
  title: string;
  category: BenchmarkPromptCategory;
  difficulty: BenchmarkPromptDifficulty;
  expectedBestRoute: string;
  prompt: string;
  whyThisTestsIIVO: string;
  successCriteria: string[];
  expectedTerms?: string[];
  forbiddenTerms?: string[];
  /** Terms that describe IIVO as a product/category (identity prompts) */
  requiredContextTerms?: string[];
  /** Minimum requiredContextTerms that must match (default 2 for identity prompts) */
  requireProductContextMin?: number;
  /** Human-readable notes on assumptions the scorer should flag */
  unsupportedAssumptions?: string[];
  detectUnsupportedLocation?: boolean;
  /** Optional workflow hint for benchmark estimate UI */
  suggestedWorkflowId?: string;
}

export const DEFAULT_IIVO_EXPECTED_TERMS = [
  "IIVO",
  "AI decision engine",
  "decision engine",
  "orchestration",
  "routes",
  "council",
  "verified search",
  "action plan",
];

export const DEFAULT_IIVO_FORBIDDEN_TERMS = [
  "intraocular",
  "implantable",
  "eye surgery",
  "vision correction",
  "ophthalmology",
  "medical implant",
  "implant",
];

/** Product/category terms — acronym mention alone is not enough for identity prompts */
export const DEFAULT_IIVO_REQUIRED_CONTEXT_TERMS = [
  "decision engine",
  "AI decision engine",
  "orchestration",
  "decision layer",
  "routing",
  "routes",
  "one model",
  "verified search",
  "council",
  "specialist council",
  "action plan",
  "model selection",
  "workflow",
];

export const BENCHMARK_PROMPT_CATEGORIES: BenchmarkPromptCategory[] = [
  "Founder Strategy",
  "Product Decision",
  "Sales / GTM",
  "Competitive Positioning",
  "Technical Risk",
  "Market Research",
  "IIVO Positioning",
  "Decision Learning",
];

export const BENCHMARK_PROMPTS: BenchmarkPromptDefinition[] = [
  {
    id: "first-paying-customer-wedge",
    title: "First paying customer wedge",
    category: "Founder Strategy",
    difficulty: "hard",
    expectedBestRoute: "Sales Attack or Product Decision",
    suggestedWorkflowId: "sales-attack",
    prompt:
      "I have 11 days to get my first paying AI Front Desk customer. I can target plumbers, HVAC companies, med spas, or small law offices. I have no sales team, limited money, and need the fastest path to a paid pilot. Which segment should I target first, what offer should I use, what should I say, and what should I avoid?",
    whyThisTestsIIVO:
      "Forces segment choice, offer design, outreach copy, and risk tradeoffs — council and routing should beat a generic single-model brainstorm.",
    successCriteria: [
      "chooses one segment",
      "explains why",
      "gives outreach angle",
      "gives offer",
      "gives first 24-hour action plan",
      "identifies risk",
      "avoids vague advice",
    ],
    detectUnsupportedLocation: true,
    unsupportedAssumptions: [
      "specific city/location unless prompt provides one",
      "named businesses unless search/entity task requested",
    ],
  },
  {
    id: "sms-now-or-after-pilots",
    title: "SMS now or after pilots",
    category: "Product Decision",
    difficulty: "hard",
    expectedBestRoute: "Product Decision",
    suggestedWorkflowId: "product-decision",
    prompt:
      "Should I add SMS follow-up to AI Front Desk now or wait until after I get 5 paying pilot customers? I need speed, but I also do not want to build features that do not help me close customers. Give me a direct recommendation, risks, what evidence would change the decision, and the next 3 actions.",
    whyThisTestsIIVO:
      "Tests build-vs-sell tradeoffs, evidence thresholds, and actionable next steps — Product Decision council should surface sharper recommendations.",
    successCriteria: [
      "makes a clear recommendation",
      "considers build cost vs sales value",
      "states what evidence would change the decision",
      "gives immediate next steps",
    ],
  },
  {
    id: "offer-and-outreach-test",
    title: "Offer and outreach test",
    category: "Sales / GTM",
    difficulty: "hard",
    expectedBestRoute: "Sales Attack",
    suggestedWorkflowId: "sales-attack",
    prompt:
      "I want to sell an AI receptionist to local service businesses for $199/month or $399/month. I need my first 3 paying customers. Design the highest-probability outreach test: target segment, buying trigger, offer angle, message, objection handling, and how to know after 50 contacts if it is working.",
    whyThisTestsIIVO:
      "Requires GTM specificity, objection handling, and measurable pass/fail thresholds — Sales Attack workflow should outperform generic chat advice.",
    successCriteria: [
      "includes segment",
      "includes specific pitch",
      "includes objection handling",
      "includes measurable pass/fail threshold",
      'avoids generic "network and post content" advice',
    ],
    detectUnsupportedLocation: true,
    unsupportedAssumptions: [
      "specific city/location unless prompt provides one",
      "named businesses unless search/entity task requested",
    ],
  },
  {
    id: "iivo-vs-chatgpt",
    title: "IIVO vs ChatGPT",
    category: "Competitive Positioning",
    difficulty: "hard",
    expectedBestRoute: "Competitive Intelligence or Product Decision",
    suggestedWorkflowId: "competitive-intelligence",
    prompt:
      "IIVO is an AI decision engine that routes a prompt to one model, verified search, or a specialist council. How should I position IIVO against ChatGPT, Claude, Perplexity, Poe, and agent builders without sounding like a wrapper? Give me the strongest wedge, the weakest claim to avoid, and a one-sentence positioning statement.",
    whyThisTestsIIVO:
      "Tests positioning clarity vs model hubs — competitive intelligence and council critique should reduce wrapper-style answers.",
    successCriteria: [
      "separates IIVO from model hubs",
      "identifies weak claims",
      "gives clear positioning",
      "gives target user",
      "avoids overclaiming",
    ],
    expectedTerms: [
      "IIVO",
      "decision engine",
      "routing",
      "model hubs",
      "ChatGPT",
      "council",
    ],
    forbiddenTerms: DEFAULT_IIVO_FORBIDDEN_TERMS,
    requiredContextTerms: DEFAULT_IIVO_REQUIRED_CONTEXT_TERMS,
    requireProductContextMin: 2,
  },
  {
    id: "public-launch-risk-audit",
    title: "Public launch risk audit",
    category: "Technical Risk",
    difficulty: "hard",
    expectedBestRoute: "Technical Audit",
    suggestedWorkflowId: "technical-audit",
    prompt:
      "Audit IIVO before public launch. It has routing, memory, decision learning, local credits, benchmark lab, and multiple provider APIs. What are the top technical, cost, privacy, reliability, and UX risks that could break trust? Rank them and give the fix order.",
    whyThisTestsIIVO:
      "Multi-domain risk ranking and fix ordering — Technical Audit council should cover cost abuse, privacy, and reliability more systematically.",
    successCriteria: [
      "ranks risks",
      "covers cost abuse",
      "covers data/privacy",
      "covers API failures",
      "covers routing mistakes",
      "gives fix order",
    ],
    expectedTerms: DEFAULT_IIVO_EXPECTED_TERMS,
    forbiddenTerms: DEFAULT_IIVO_FORBIDDEN_TERMS,
    requiredContextTerms: DEFAULT_IIVO_REQUIRED_CONTEXT_TERMS,
    requireProductContextMin: 2,
  },
  {
    id: "ai-decision-engine-category",
    title: "AI decision engine category",
    category: "Market Research",
    difficulty: "hard",
    expectedBestRoute: "Market Research or Competitive Intelligence",
    suggestedWorkflowId: "market-research",
    prompt:
      'Is "AI decision engine" or "AI decision orchestration" a viable category for IIVO? Compare it against chatbots, AI search, model hubs, agent builders, and workflow automation. Give the clearest category name, the likely buyer, and the biggest threat.',
    whyThisTestsIIVO:
      "Category comparison and buyer/threat analysis — market research workflow should add structure beyond a single-model opinion.",
    successCriteria: [
      "compares categories",
      "names buyer",
      "names threat",
      "gives category recommendation",
      "avoids fantasy valuation claims",
    ],
    expectedTerms: DEFAULT_IIVO_EXPECTED_TERMS,
    forbiddenTerms: DEFAULT_IIVO_FORBIDDEN_TERMS,
    requiredContextTerms: DEFAULT_IIVO_REQUIRED_CONTEXT_TERMS,
    requireProductContextMin: 2,
  },
  {
    id: "use-prior-failed-outcome",
    title: "Use prior failed outcome",
    category: "Decision Learning",
    difficulty: "hard",
    expectedBestRoute: "Product Decision or Sales Attack",
    suggestedWorkflowId: "product-decision",
    prompt:
      'A previous outreach test used a generic "AI receptionist" pitch and got 0 replies from 30 contacts. Now I am considering a missed-call recovery angle. Should I switch angles, keep testing, or change the target segment? Give a recommendation based on the outcome.',
    whyThisTestsIIVO:
      "Tests learning from prior outcomes without overgeneralizing — decision learning context should improve revised test design.",
    successCriteria: [
      "uses prior outcome",
      "does not overgeneralize from small sample",
      "gives revised test",
      "gives measurable next threshold",
    ],
    detectUnsupportedLocation: true,
    unsupportedAssumptions: [
      "specific city/location unless prompt provides one",
    ],
  },
  {
    id: "simple-iivo-explanation",
    title: "Simple IIVO explanation",
    category: "IIVO Positioning",
    difficulty: "simple",
    expectedBestRoute: "Direct Answer",
    suggestedWorkflowId: "auto",
    prompt: "What is IIVO in one paragraph?",
    whyThisTestsIIVO:
      "Control prompt — one model should be enough. Benchmark should often show tie or small difference, proving IIVO does not always need council.",
    successCriteria: [
      "one model is enough",
      "benchmark should likely show tie or small difference",
      "helps prove IIVO does not always need council",
    ],
    expectedTerms: [
      "IIVO",
      "decision engine",
      "routing",
      "one model",
      "search",
      "council",
    ],
    forbiddenTerms: [
      "intraocular",
      "implant",
      "eye surgery",
      "ophthalmology",
      "medical device",
      "implantable",
      "vision correction",
    ],
    requiredContextTerms: DEFAULT_IIVO_REQUIRED_CONTEXT_TERMS,
    requireProductContextMin: 2,
  },
];

export function getBenchmarkPromptById(id: string): BenchmarkPromptDefinition | undefined {
  return BENCHMARK_PROMPTS.find((p) => p.id === id);
}

export function getRecommendedStarterPrompt(): BenchmarkPromptDefinition {
  return (
    BENCHMARK_PROMPTS.find((p) => p.id === "first-paying-customer-wedge") ??
    BENCHMARK_PROMPTS.find((p) => p.difficulty === "hard") ??
    BENCHMARK_PROMPTS[0]!
  );
}

export function filterBenchmarkPrompts(input: {
  category?: BenchmarkPromptCategory | "all";
  difficulty?: BenchmarkPromptDifficulty | "all";
}): BenchmarkPromptDefinition[] {
  return BENCHMARK_PROMPTS.filter((p) => {
    if (input.category && input.category !== "all" && p.category !== input.category) return false;
    if (input.difficulty && input.difficulty !== "all" && p.difficulty !== input.difficulty) {
      return false;
    }
    return true;
  });
}

export const RECOMMENDED_BENCHMARK_SET_COUNT = 1;

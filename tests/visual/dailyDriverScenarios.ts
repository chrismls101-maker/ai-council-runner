/**
 * IIVO Daily Driver Simulation — broad real-world scenario catalog.
 *
 * Mix target: ~20% IIVO/product-self, ~80% general real-world tasks.
 * Basic "What is IIVO?" smoke belongs in Master QA only.
 */

export type DailyDriverAudience = "general" | "iivo";

export type DailyDriverCategory =
  | "founder"
  | "local-business"
  | "sales"
  | "marketing"
  | "support"
  | "product"
  | "website"
  | "hiring"
  | "finance"
  | "ecommerce"
  | "creator"
  | "legal-policy"
  | "productivity"
  | "technical"
  | "competitive"
  | "vision"
  | "context"
  | "lens"
  | "memory"
  | "iivo-product"
  | "rewrite"
  | "benchmark"
  | "outcome"
  | "failure";

export type FailureSeverity = "minor" | "major" | "blocker";

export type DailyDriverRunKind =
  | "prompt_run"
  | "context_attach_run"
  | "lens_handoff"
  | "lens_invalid"
  | "screenshot_handoff"
  | "memory_guard_unit"
  | "benchmark_ui"
  | "outcome_flow";

export interface DailyDriverScenario {
  id: string;
  title: string;
  category: DailyDriverCategory;
  /** general = real-world assistant work; iivo = product/Lens/Context Bridge qualification */
  audience: DailyDriverAudience;
  /** Agent Mind narration for QA logs */
  agentMind?: string;
  agentGoal?: string;
  whyItMatters?: string;
  userMindset?: string;
  successLooksLike?: string;
  failureLooksLike?: string;
  tags: string[];
  kind: DailyDriverRunKind;
  prompt: string;
  expectedRoute?: RegExp;
  /** Routes that satisfy routing checks when expectedRoute is set (e.g. strategic choice → Product Decision or Direct Answer). */
  acceptedRoutes?: RegExp[];
  requiredSignals: RegExp[];
  forbiddenSignals: RegExp[];
  /** Terms permitted when present in the scenario prompt (avoids false-positive bleed). */
  allowedTerms?: string[];
  memoryBleedForbiddenTerms?: string[];
  /** For general tasks: flag answers that mention IIVO unprompted */
  forbidSelfReference?: boolean;
  maxSeconds: number;
  contextRequired: boolean;
  screenshotRequired: boolean;
  liveVisionRequired: boolean;
  liveProviderRequired: boolean;
  failureSeverity: FailureSeverity;
  defaultRun: boolean;
  fullOnly?: boolean;
  liveOnly?: boolean;
  contextFixture?: { title: string; text: string };
  lensPageTitle?: string;
  lensPageContent?: string;
  screenshotTitle?: string;
  screenshotSourceUrl?: string;
  screenshotContent?: string;
  workflow?: "auto" | "product-decision";
  preset?: "none" | "ai-front-desk-sales-test";
}

const NO_BASIC_IIVO_PITCH: RegExp[] = [
  /what is iivo\?/i,
  /iivo is an ai (decision )?engine/i,
];

const AI_FRONT_DESK_BLEED = [
  "AI Front Desk",
  "AI receptionist",
  "AI Receptionist",
  "missed calls",
  "missed-call recovery",
  "call recovery",
  "SMS follow-up",
  "delayed SMS",
  "0 pilots",
  "pilot customers",
  "plumbers",
  "HVAC",
  "Relevant Past Outcome",
  "Relevant Past Outcomes",
];

const IIVO_SELF_REFERENCE = [
  "IIVO",
  "iivo decision engine",
  "iivo routes",
  "iivo lens",
  "context bridge",
  "council runner",
];

const GENERAL_MEMORY_BLEED = [...AI_FRONT_DESK_BLEED, ...IIVO_SELF_REFERENCE];

function s(
  partial: Omit<
    DailyDriverScenario,
    | "maxSeconds"
    | "contextRequired"
    | "screenshotRequired"
    | "liveVisionRequired"
    | "failureSeverity"
    | "forbidSelfReference"
  > &
    Partial<
      Pick<
        DailyDriverScenario,
        | "maxSeconds"
        | "contextRequired"
        | "screenshotRequired"
        | "liveVisionRequired"
        | "failureSeverity"
        | "forbidSelfReference"
      >
    >,
): DailyDriverScenario {
  const audience = partial.audience;
  return {
    maxSeconds: partial.liveProviderRequired ? 360 : 240,
    contextRequired: false,
    screenshotRequired: false,
    liveVisionRequired: false,
    liveProviderRequired:
      partial.kind === "prompt_run" ||
      partial.kind === "context_attach_run" ||
      partial.kind === "outcome_flow",
    failureSeverity: "major",
    fullOnly: false,
    liveOnly: false,
    forbidSelfReference: audience === "general" && partial.forbidSelfReference !== false,
    ...partial,
  };
}

export const DAILY_DRIVER_SCENARIOS: DailyDriverScenario[] = [
  // ─── Founder / startup ─────────────────────────────────────────────────────
  s({
    id: "founder-saas-1500-14days",
    title: "SaaS validation with $1,500 and 14 days",
    category: "founder",
    audience: "general",
    agentMind:
      "Testing lean founder validation advice. IIVO should not mention itself.",
    agentGoal: "Validate a SaaS idea with $1,500 and 14 days — demo, outreach, or landing page first.",
    whyItMatters: "Exposes whether IIVO gives disciplined founder advice instead of overbuilding.",
    userMindset: "A founder trying not to waste two weeks building the wrong thing.",
    successLooksLike: "Clear choice, lean validation, concrete next 48 hours.",
    failureLooksLike: "Feature hype, hire-a-team advice, or no time-bound plan.",
    tags: ["@founder", "@saas"],
    kind: "prompt_run",
    prompt:
      "I have $1,500 and 14 days to validate a SaaS idea. Should I build a demo, run cold outreach, or create a landing page first?",
    requiredSignals: [/landing|outreach|demo|validate|48 hour|this week|first/i, /recommend|choose/i],
    forbiddenSignals: [/build the full product|hire a team/i, ...NO_BASIC_IIVO_PITCH],
    expectedRoute: /product decision/i,
    acceptedRoutes: [/product decision/i, /direct answer/i],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    defaultRun: true,
  }),
  s({
    id: "founder-three-ideas-pick",
    title: "Pick which of three product ideas to test first",
    category: "founder",
    audience: "general",
    agentMind: "Testing comparative founder prioritization across industries.",
    tags: ["@founder"],
    kind: "prompt_run",
    prompt:
      "A founder has 3 product ideas: AI receptionist for plumbers, invoice-chasing assistant for freelancers, and review-response bot for restaurants. Which should they test first and why?",
    requiredSignals: [/choose|first|test|pain|pay|willing|plan/i, /plumber|freelanc|restaurant/i],
    forbiddenSignals: [/all three equally|test all at once/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "founder-two-users-scope",
    title: "Two paying users but keeps adding features",
    category: "founder",
    audience: "general",
    agentMind: "Testing retention focus vs feature creep for a solo founder.",
    tags: ["@founder", "@saas"],
    kind: "prompt_run",
    prompt:
      "A solo founder has 2 paying users but keeps adding features. What should they do this week?",
    requiredSignals: [/user|talk|interview|retention|revenue|scope|cut/i, /week/i],
    forbiddenSignals: [/add more features|ship everything/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "founder-agency-first-client",
    title: "Agency landing first retainer client",
    category: "founder",
    audience: "general",
    tags: ["@founder", "@agency"],
    kind: "prompt_run",
    prompt:
      "A 2-person marketing agency has no retainer clients yet. What should they do in the next 7 days to land one?",
    requiredSignals: [/offer|niche|outreach|case study|follow-up|7 day/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Local business ────────────────────────────────────────────────────────
  s({
    id: "local-plumber-missed-calls",
    title: "Plumbing company missed-call recovery process",
    category: "local-business",
    audience: "general",
    agentMind: "Testing practical local service operations advice.",
    tags: ["@local", "@operations"],
    kind: "prompt_run",
    prompt:
      "A plumbing company misses calls after 5 PM. Give them a simple process to recover lost leads without hiring a full-time receptionist.",
    requiredSignals: [/voicemail|SMS|callback|log|follow-up|after.?hours/i],
    forbiddenSignals: [/hire a full-time receptionist immediately/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "local-dental-noshows",
    title: "Dental office no-show reduction",
    category: "local-business",
    audience: "general",
    agentMind: "Testing healthcare ops advice without IIVO self-reference.",
    tags: ["@local", "@healthcare"],
    kind: "prompt_run",
    prompt: "A small dental office has too many no-shows. What should they test first?",
    requiredSignals: [/remind|confirm|appointment|test|measure/i],
    forbiddenSignals: [],
    memoryBleedForbiddenTerms: ["IIVO", "AI Front Desk"],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "local-medspa-dm-workflow",
    title: "Med spa Instagram DM response workflow",
    category: "local-business",
    audience: "general",
    tags: ["@local", "@marketing"],
    kind: "prompt_run",
    prompt:
      "A med spa wants more bookings but their Instagram DMs are slow. Build a simple response workflow.",
    requiredSignals: [/DM|response|book|intake|escalat|timing/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Sales / outreach ──────────────────────────────────────────────────────
  s({
    id: "sales-hvac-cold-email",
    title: "Cold email to HVAC owner for missed-call pilot",
    category: "sales",
    audience: "general",
    agentMind: "Testing short outcome-oriented sales writing.",
    tags: ["@sales", "@outreach"],
    kind: "prompt_run",
    prompt:
      "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery.",
    requiredSignals: [/missed call|pilot|14 day|HVAC/i, /subject|email|CTA|call/i],
    forbiddenSignals: [/revolutionary|game.?changing|disrupt/i],
    expectedRoute: /sales attack/i,
    allowedTerms: [
      "missed calls",
      "missed-call recovery",
      "missed call",
      "HVAC",
      "hvac",
      "pilot",
      "paid pilot",
      "14-day",
      "14-day paid pilot",
    ],
    memoryBleedForbiddenTerms: [
      "AI Front Desk",
      "AI receptionist",
      "delayed SMS",
      "SMS follow-up",
      "0 pilots",
      "Relevant Past Outcome",
      "Relevant Past Outcomes",
    ],
    defaultRun: true,
  }),
  s({
    id: "builder-cold-email",
    title: "Builder: cold email workspace tabs",
    category: "sales",
    audience: "general",
    tags: ["@sales", "@builder"],
    kind: "prompt_run",
    prompt:
      "Write a cold email to a local HVAC owner offering a 14-day paid pilot for missed-call recovery. Open in Builder to inspect quality.",
    requiredSignals: [/subject|email|pilot|HVAC/i],
    forbiddenSignals: [],
    expectedRoute: /sales attack/i,
    defaultRun: false,
  }),
  s({
    id: "builder-landing-page",
    title: "Builder: full landing page with Build Map",
    category: "marketing",
    audience: "general",
    tags: ["@marketing", "@builder"],
    kind: "prompt_run",
    prompt: "Build me a full landing page for my B2B SaaS.",
    requiredSignals: [/hero|headline|CTA|landing/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "builder-financial-table",
    title: "Builder: financial table Package CSV",
    category: "finance",
    audience: "general",
    tags: ["@finance", "@builder"],
    kind: "prompt_run",
    prompt: "Create a financial table for monthly burn, runway, and assumptions.",
    requiredSignals: [/table|burn|runway/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "builder-website-audit",
    title: "Builder: website audit Execute task list",
    category: "website",
    audience: "general",
    tags: ["@website", "@builder"],
    kind: "prompt_run",
    prompt:
      "Write a website audit report for a local plumber homepage: clarity, trust, and conversion blockers.",
    requiredSignals: [/audit|trust|conversion|fix/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "image-studio-hero-saas",
    title: "Image Studio: SaaS hero visual",
    category: "builder",
    audience: "general",
    tags: ["@builder", "@images"],
    kind: "prompt_run",
    prompt: "Generate hero image for SaaS landing page in IIVO Image Studio.",
    requiredSignals: [/hero|visual|image studio/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "image-studio-jewelry-pack",
    title: "Image Studio: jewelry product render pack",
    category: "builder",
    audience: "general",
    tags: ["@builder", "@images"],
    kind: "prompt_run",
    prompt: "Generate jewelry product render pack for ecommerce catalog.",
    requiredSignals: [/product|render|visual/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "image-studio-ad-from-email",
    title: "Image Studio: ad creative from cold email",
    category: "builder",
    audience: "general",
    tags: ["@builder", "@images", "@sales"],
    kind: "prompt_run",
    prompt: "Generate ad creative from this cold email offer in Image Studio.",
    requiredSignals: [/ad|creative|visual/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "vision-proposal-cover",
    title: "Image Studio: proposal cover visual QA",
    category: "builder",
    audience: "general",
    tags: ["@builder", "@images", "@vision"],
    kind: "prompt_run",
    prompt:
      "Create a professional proposal cover image for a premium automation consulting proposal.",
    requiredSignals: [/proposal|cover|visual|image studio/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "image-studio-brand-copy-warning",
    title: "Image Studio: brand-copy warning",
    category: "builder",
    audience: "general",
    tags: ["@builder", "@images"],
    kind: "prompt_run",
    prompt: "In Image Studio, make a hero in the style of Apple with their official logo.",
    requiredSignals: [/original|rights|warning|style/i],
    forbiddenSignals: [],
    defaultRun: false,
  }),
  s({
    id: "sales-sharpen-offer",
    title: "Sharpen vague AI receptionist offer",
    category: "sales",
    audience: "general",
    tags: ["@sales"],
    kind: "prompt_run",
    prompt: "Turn this offer into a better one: We help businesses answer missed calls with AI.",
    requiredSignals: [/outcome|specific|buyer|missed call|recover|lead/i],
    forbiddenSignals: [/leverage AI to optimize/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "sales-50-emails-zero-replies",
    title: "Diagnose zero-reply cold email campaign",
    category: "sales",
    audience: "general",
    agentMind: "Testing concrete sales diagnosis, not motivational fluff.",
    tags: ["@sales"],
    kind: "prompt_run",
    prompt:
      "I sent 50 cold emails and got 0 replies. Diagnose the likely problem and what to change first.",
    requiredSignals: [/list|offer|subject|audience|copy|test|first/i],
    forbiddenSignals: [/keep going|believe in yourself|never give up/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "sales-freelancer-followup",
    title: "Freelancer follow-up after proposal silence",
    category: "sales",
    audience: "general",
    tags: ["@sales", "@freelancer"],
    kind: "prompt_run",
    prompt:
      "A freelance designer sent a proposal 5 days ago and heard nothing. Write a short follow-up that is professional and not desperate.",
    requiredSignals: [/follow-up|proposal|question|next step/i],
    forbiddenSignals: [/desperate|please respond urgently/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Marketing / positioning ───────────────────────────────────────────────
  s({
    id: "marketing-jargon-hero",
    title: "Rewrite jargon-heavy startup hero",
    category: "marketing",
    audience: "general",
    agentMind: "Testing plain-language marketing rewrite for a normal business owner.",
    tags: ["@marketing", "@rewrite"],
    kind: "prompt_run",
    prompt:
      "A startup homepage says: 'We leverage AI to optimize workflows.' Rewrite the hero so a normal business owner understands it.",
    requiredSignals: [/you |your |help|save|time|missed|call|task|simple/i],
    forbiddenSignals: [/leverage AI to optimize workflows/i, /synerg/i],
    expectedRoute: /direct answer/i,
    acceptedRoutes: [/direct answer/i],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    defaultRun: true,
  }),
  s({
    id: "marketing-receptionist-vs-missed-call",
    title: "AI receptionist vs missed-call recovery positioning",
    category: "marketing",
    audience: "general",
    tags: ["@marketing"],
    kind: "prompt_run",
    prompt:
      "Compare these two positioning angles: 'AI receptionist' vs 'missed-call recovery system.' Which is stronger and why?",
    requiredSignals: [/missed.?call|outcome|feature|buyer|recommend|stronger/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "marketing-law-firm-headlines",
    title: "Law firm missed-call headline options",
    category: "marketing",
    audience: "general",
    tags: ["@marketing", "@local"],
    kind: "prompt_run",
    prompt:
      "Create 5 landing page headline options for a service that helps law firms respond to missed calls.",
    requiredSignals: [/headline|1\.|2\.|missed call|law firm/i],
    forbiddenSignals: [/revolutionary|#1 AI/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Customer support ──────────────────────────────────────────────────────
  s({
    id: "support-billing-access",
    title: "Calm support response for billing and access issue",
    category: "support",
    audience: "general",
    agentMind: "Testing a normal business support task. IIVO should not mention itself.",
    agentGoal: "Write a calm support reply for a billing and access issue.",
    whyItMatters: "Normal support work — IIVO must not mention itself or unrelated products.",
    userMindset: "A frustrated customer who needs empathy and a clear next step.",
    successLooksLike: "Empathetic tone, asks for info, clear next step, no premature fault admission.",
    failureLooksLike: "IIVO pitch, AI Front Desk, or robotic template.",
    tags: ["@support"],
    kind: "prompt_run",
    prompt:
      "A customer says: 'Your app charged me but I can't access my account.' Write a calm support response.",
    requiredSignals: [/sorry|understand|email|account|investigate|next step/i],
    forbiddenSignals: [/our fault|we definitely charged incorrectly/i],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    expectedRoute: /direct answer/i,
    failureSeverity: "blocker",
    defaultRun: true,
  }),
  s({
    id: "support-refund-goodwill",
    title: "Refund policy response preserving goodwill",
    category: "support",
    audience: "general",
    tags: ["@support"],
    kind: "prompt_run",
    prompt:
      "Create a refund policy response for a frustrated customer while preserving goodwill.",
    requiredSignals: [/refund|policy|understand|review|next step/i],
    forbiddenSignals: [/as an ai language model/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "support-ticket-priorities",
    title: "Prioritize support tickets into top product issues",
    category: "support",
    audience: "general",
    tags: ["@support", "@product"],
    kind: "prompt_run",
    prompt:
      "Summarize these support tickets into the top 3 product issues: login problems, invoice confusion, slow response times, missing export button.",
    requiredSignals: [/login|invoice|export|1\.|2\.|3\.|priorit/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Product management ────────────────────────────────────────────────────
  s({
    id: "product-priority-export",
    title: "CSV export vs filters vs SMS alerts priority",
    category: "product",
    audience: "general",
    agentMind: "Testing SaaS product prioritization for a small team.",
    tags: ["@product", "@saas"],
    kind: "prompt_run",
    prompt:
      "Users keep asking for CSV export, dashboard filters, and SMS alerts. Which should a small SaaS team build first?",
    requiredSignals: [/CSV|export|filter|SMS|first|criteria|workflow/i],
    forbiddenSignals: [/build all three/i],
    expectedRoute: /product decision/i,
    acceptedRoutes: [/product decision/i, /direct answer/i],
    allowedTerms: ["CSV export", "dashboard filters", "SMS alerts", "sms alerts", "sms"],
    memoryBleedForbiddenTerms: [
      "AI Front Desk",
      "AI receptionist",
      "delayed SMS",
      "0 pilots",
      "Relevant Past Outcome",
      "Relevant Past Outcomes",
    ],
    defaultRun: true,
  }),
  s({
    id: "product-onboarding-sprint",
    title: "One-week onboarding conversion sprint",
    category: "product",
    audience: "general",
    tags: ["@product"],
    kind: "prompt_run",
    prompt: "Write a one-week product sprint plan for improving onboarding conversion.",
    requiredSignals: [/day|metric|onboard|test|task|week/i],
    forbiddenSignals: [/rebuild entire product/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "product-cool-unused-feature",
    title: "Cool feature with no user requests",
    category: "product",
    audience: "general",
    tags: ["@product"],
    kind: "prompt_run",
    prompt: "A feature is cool but no users requested it. Should we build it?",
    requiredSignals: [/no|not yet|demand|test|evidence|user/i],
    forbiddenSignals: [/definitely build it/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Website / landing ─────────────────────────────────────────────────────
  s({
    id: "website-vague-hero-context",
    title: "Critique vague landing page from attached context",
    category: "website",
    audience: "general",
    tags: ["@website", "@context"],
    kind: "context_attach_run",
    prompt:
      "What is unclear about this landing page and how would you fix it?",
    contextFixture: {
      title: "Vague SaaS landing copy",
      text: "Hero: AI that changes everything. CTA: Learn More. Features: automation, insights, growth.",
    },
    requiredSignals: [/vague|unclear|outcome|CTA|specific|fix/i],
    forbiddenSignals: [],
    contextRequired: true,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "vision-homepage-hierarchy",
    title: "Homepage visual hierarchy and confusion points",
    category: "vision",
    audience: "general",
    agentMind: "Testing screenshot/UI analysis without live vision in default mode.",
    tags: ["@vision", "@website"],
    kind: "screenshot_handoff",
    prompt:
      "Analyze this homepage visually. What is the first thing a visitor notices, and what might confuse them?",
    screenshotTitle: "SaaS homepage — Daily Driver",
    screenshotContent:
      "Large purple headline top-left, small gray subtext, two competing CTAs (Learn More and Sign Up), feature grid below fold.",
    requiredSignals: [/visual|hierarchy|CTA|confus|notice|headline/i],
    forbiddenSignals: [],
    screenshotRequired: true,
    liveProviderRequired: false,
    defaultRun: true,
  }),
  s({
    id: "website-5sec-clarity-test",
    title: "5-second homepage clarity test",
    category: "website",
    audience: "general",
    tags: ["@website"],
    kind: "prompt_run",
    prompt: "Give me a 5-second test for whether a homepage is clear.",
    requiredSignals: [/5 second|headline|offer|CTA|test|checklist/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Hiring / HR ───────────────────────────────────────────────────────────
  s({
    id: "hiring-first-salesperson",
    title: "Hiring first salesperson at small agency",
    category: "hiring",
    audience: "general",
    tags: ["@hiring", "@agency"],
    kind: "prompt_run",
    prompt:
      "A small agency is hiring its first salesperson. What should they look for and what should they avoid?",
    requiredSignals: [/look for|avoid|founder|sell|compensation|experience/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "hiring-support-interview",
    title: "Interview questions for SaaS support rep",
    category: "hiring",
    audience: "general",
    tags: ["@hiring", "@support"],
    kind: "prompt_run",
    prompt: "Write interview questions for a customer support rep at a SaaS company.",
    requiredSignals: [/question|scenario|customer|ticket|escalat/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Finance / budgeting ─────────────────────────────────────────────────────
  s({
    id: "finance-runway-moves",
    title: "First financial moves with negative cash flow",
    category: "finance",
    audience: "general",
    tags: ["@finance", "@founder"],
    kind: "prompt_run",
    prompt:
      "A founder has $4,000/month expenses and $2,500/month income. What are the first 3 financial moves?",
    requiredSignals: [/burn|revenue|runway|cut|income|1\.|2\.|3\./i],
    forbiddenSignals: [/take a risky loan|gamble|crypto/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "finance-contractor-vs-ads",
    title: "Contractor $800 vs ads $800 for unproven SaaS",
    category: "finance",
    audience: "general",
    tags: ["@finance", "@saas"],
    kind: "prompt_run",
    prompt:
      "Compare hiring a contractor for $800 vs spending $800 on ads for a new SaaS with no proven offer.",
    requiredSignals: [/offer|validate|manual|ads|contractor|test/i],
    forbiddenSignals: [/spend all on ads immediately/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Ecommerce ───────────────────────────────────────────────────────────────
  s({
    id: "ecommerce-jewelry-conversion",
    title: "Jewelry store traffic but low conversions",
    category: "ecommerce",
    audience: "general",
    agentMind: "Testing ecommerce diagnosis without IIVO or AI Front Desk bleed.",
    tags: ["@ecommerce"],
    kind: "prompt_run",
    prompt: "An online jewelry store has traffic but low conversions. What should they check first?",
    requiredSignals: [/photo|trust|checkout|shipping|price|offer/i],
    forbiddenSignals: [
      /AI Front Desk/i,
      /AI receptionist/i,
      /missed-call recovery/i,
      /SMS follow-up/i,
      /\b0 pilots\b/i,
      /pilot customers/i,
      /plumbers/i,
      /\bHVAC\b/i,
    ],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    failureSeverity: "blocker",
    defaultRun: true,
  }),
  s({
    id: "ecommerce-ring-descriptions",
    title: "Three luxury ring product description tones",
    category: "ecommerce",
    audience: "general",
    tags: ["@ecommerce", "@rewrite"],
    kind: "prompt_run",
    prompt: "Write 3 product descriptions for a luxury ring, each with a different tone.",
    requiredSignals: [/ring|1\.|2\.|3\.|tone|description/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Creator / content ─────────────────────────────────────────────────────
  s({
    id: "creator-youtube-7day",
    title: "7-day faceless AI YouTube content test plan",
    category: "creator",
    audience: "general",
    tags: ["@creator"],
    kind: "prompt_run",
    prompt:
      "A creator wants to grow a faceless AI YouTube channel. Give a 7-day content test plan.",
    requiredSignals: [/day|hook|topic|post|metric|7/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "creator-short-hooks",
    title: "Short-form video hooks from one idea",
    category: "creator",
    audience: "general",
    tags: ["@creator"],
    kind: "prompt_run",
    prompt: "Turn this idea into 5 short-form video hooks: AI tools are changing small businesses.",
    requiredSignals: [/hook|1\.|2\.|3\.|4\.|5\./i],
    forbiddenSignals: [/here are some general tips/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Legal / policy awareness ──────────────────────────────────────────────
  s({
    id: "legal-call-recording-risks",
    title: "Call recording compliance risks (non-lawyer)",
    category: "legal-policy",
    audience: "general",
    tags: ["@legal"],
    kind: "prompt_run",
    prompt:
      "A business wants to record customer calls for quality. What risks should they consider before doing it?",
    requiredSignals: [/consent|lawyer|legal advice|state|country|compliance|not legal/i],
    forbiddenSignals: [/fully compliant everywhere|no risk/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "legal-privacy-promises",
    title: "Privacy promises a SaaS should avoid overclaiming",
    category: "legal-policy",
    audience: "general",
    agentMind: "Testing policy awareness without overclaiming security.",
    tags: ["@legal", "@saas"],
    kind: "prompt_run",
    prompt:
      "A SaaS collects customer emails and uploaded files. What privacy promises should it avoid making?",
    requiredSignals: [
      /avoid|do not|don't|never claim|absolute|guarantee/i,
      /(secure|security|encrypt|breach|100%)/i,
      /(disclose|provider|third.?party|subprocessor|data use|retention|delete)/i,
      /(HIPAA|SOC|GDPR|compliance|certified)/i,
      /(legal counsel|not legal advice|lawyer)/i,
    ],
    forbiddenSignals: [/100% secure|never breached|fully compliant everywhere/i],
    expectedRoute: /direct answer/i,
    failureSeverity: "major",
    defaultRun: true,
  }),

  // ─── Personal productivity ─────────────────────────────────────────────────
  s({
    id: "productivity-90min-tasks",
    title: "Prioritize 10 tasks in 90 minutes",
    category: "productivity",
    audience: "general",
    tags: ["@productivity"],
    kind: "prompt_run",
    prompt: "I have 10 tasks and only 90 minutes. How should I decide what to do first?",
    requiredSignals: [/urgent|important|priorit|first|revenue|risk|framework/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "productivity-focus-block",
    title: "2-hour focus block for distracted founder",
    category: "productivity",
    audience: "general",
    tags: ["@productivity", "@founder"],
    kind: "prompt_run",
    prompt: "Create a 2-hour focus block for a founder who keeps switching projects.",
    requiredSignals: [/2 hour|block|schedule|distraction|single|focus/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "productivity-operator-weekly",
    title: "Weekly operator review checklist",
    category: "productivity",
    audience: "general",
    tags: ["@productivity", "@operator"],
    kind: "prompt_run",
    prompt:
      "I'm an operations lead at a 15-person company. Give me a weekly review checklist for bottlenecks, customer issues, and team capacity.",
    requiredSignals: [/checklist|weekly|bottleneck|capacity|customer/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Technical / software ──────────────────────────────────────────────────
  s({
    id: "technical-auth-stripe-logging",
    title: "Auth vs Stripe vs error logging before beta",
    category: "technical",
    audience: "general",
    tags: ["@technical", "@saas"],
    kind: "prompt_run",
    prompt:
      "A solo dev is deciding between adding auth, Stripe, or better error logging. Which should come first before beta?",
    requiredSignals: [/beta|logging|feedback|auth|Stripe|depend/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "technical-bug-vs-friction",
    title: "Bug vs missing feature vs product friction",
    category: "technical",
    audience: "general",
    tags: ["@technical", "@product"],
    kind: "prompt_run",
    prompt: "Explain the difference between a bug, a missing feature, and a product friction point.",
    requiredSignals: [/bug|feature|friction|example/i],
    forbiddenSignals: [],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Competitive analysis ────────────────────────────────────────────────────
  s({
    id: "competitive-simpler-ui",
    title: "Respond to competitor with simpler UI",
    category: "competitive",
    audience: "general",
    tags: ["@competitive"],
    kind: "prompt_run",
    prompt:
      "A competitor has simpler UI but fewer features. How should a startup respond?",
    requiredSignals: [/simple|focus|core|use case|feature creep/i],
    forbiddenSignals: [/add every feature/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "competitive-vs-chatgpt",
    title: "Why users choose a focused tool over ChatGPT",
    category: "competitive",
    audience: "general",
    agentMind: "Testing differentiated value vs generic AI — IIVO should not pitch itself unless asked.",
    tags: ["@competitive"],
    kind: "prompt_run",
    prompt: "What would make users choose a focused tool over ChatGPT?",
    requiredSignals: [/workflow|context|memory|integration|outcome|repeat/i],
    forbiddenSignals: [/IIVO is better than ChatGPT/i],
    forbidSelfReference: true,
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Context Bridge (general + IIVO) ───────────────────────────────────────
  s({
    id: "context-meeting-notes-fixes",
    title: "Top 3 fixes from product meeting notes",
    category: "context",
    audience: "iivo",
    agentMind:
      "Testing Context Bridge on IIVO product feedback notes — IIVO-specific usefulness.",
    agentGoal: "Extract top 3 product fixes from attached meeting notes.",
    whyItMatters: "Checks Context Bridge on real IIVO feedback — credits, presets, memory.",
    userMindset: "A builder reviewing beta feedback.",
    successLooksLike: "Credits, preset, and memory clarity called out from the notes.",
    failureLooksLike: "Generic product advice ignoring the attached document.",
    tags: ["@context", "@iivo"],
    kind: "context_attach_run",
    prompt: "What are the top 3 fixes from these notes?",
    contextFixture: {
      title: "IIVO beta meeting notes",
      text: "Customers liked screenshot analysis but were confused by credits, presets, and memory. Asked for clearer neutral default and daily-driver QA breadth.",
    },
    requiredSignals: [/credit|preset|memory|1\.|2\.|3\.|fix/i],
    forbiddenSignals: [/transmission|dental|jewelry shipping/i],
    contextRequired: true,
    defaultRun: true,
  }),
  s({
    id: "context-pricing-page-risks",
    title: "Risks in vague SaaS pricing page copy",
    category: "context",
    audience: "general",
    tags: ["@context", "@saas"],
    kind: "context_attach_run",
    prompt: "What is unclear or risky about this pricing page?",
    contextFixture: {
      title: "SaaS pricing page",
      text: "Starter $19, Pro $49, Enterprise custom. Includes AI insights. No usage limits stated.",
    },
    requiredSignals: [/vague|limit|usage|insight|unclear|risk|overclaim/i],
    forbiddenSignals: [],
    contextRequired: true,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "context-unrelated-car",
    title: "Ignore unrelated car repair context",
    category: "context",
    audience: "iivo",
    agentMind: "Testing whether IIVO ignores unrelated Context Bridge content.",
    tags: ["@context", "@memory", "@iivo"],
    kind: "context_attach_run",
    prompt: "Should I add desktop overlay next?",
    contextFixture: {
      title: "Unrelated car notes",
      text: "Transmission slipping on 2014 Civic. Shop quoted $2,400. Considering rebuilt vs used transmission.",
    },
    requiredSignals: [/overlay|lens|desktop|recommend/i],
    forbiddenSignals: [/transmission|Civic|shop quoted/i],
    contextRequired: true,
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── Memory guard / contamination ──────────────────────────────────────────
  s({
    id: "memory-guard-ecommerce-shipping",
    title: "Ecommerce shipping support — no IIVO bleed",
    category: "memory",
    audience: "general",
    agentMind:
      "Testing whether memory contaminates unrelated ecommerce support work.",
    agentGoal: "Write ecommerce shipping support — no IIVO or AI Front Desk in the answer.",
    whyItMatters: "Memory guard on a completely unrelated industry task.",
    userMindset: "An ecommerce support agent helping a jewelry customer.",
    successLooksLike: "Shipping-focused reply only — no IIVO, missed calls, or pilots.",
    failureLooksLike: "AI Front Desk, IIVO, or receptionist content in the response.",
    tags: ["@memory"],
    kind: "prompt_run",
    prompt:
      "Write a support response for an ecommerce customer asking about shipping delays on a jewelry order.",
    requiredSignals: [/ship|delay|order|apolog|track|next step/i],
    forbiddenSignals: [
      /AI Front Desk/i,
      /missed calls/i,
      /IIVO/i,
      /decision engine/i,
      /pilot customer/i,
    ],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    failureSeverity: "blocker",
    defaultRun: true,
    liveProviderRequired: true,
  }),
  s({
    id: "memory-guard-dental-noshow",
    title: "Dental no-show advice — no IIVO bleed",
    category: "memory",
    audience: "general",
    agentMind: "Testing memory guard on unrelated healthcare ops prompt.",
    tags: ["@memory"],
    kind: "prompt_run",
    prompt: "Analyze this dental no-show problem and suggest the first test to run.",
    requiredSignals: [/no.?show|remind|confirm|test|appointment/i],
    forbiddenSignals: [/IIVO/i, /AI Front Desk/i, /council runner/i],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    defaultRun: false,
    fullOnly: true,
    liveProviderRequired: true,
  }),
  s({
    id: "memory-guard-jewelry-summary",
    title: "Summarize jewelry description — no unrelated memory",
    category: "memory",
    audience: "general",
    tags: ["@memory", "@ecommerce"],
    kind: "prompt_run",
    prompt:
      "Summarize this jewelry product description in 2 sentences: Hand-finished 18k gold band with pavé diamonds, ships in 3–5 days, lifetime sizing included.",
    requiredSignals: [/gold|diamond|ship|sizing|band/i],
    forbiddenSignals: [/IIVO/i, /AI Front Desk/i, /missed call/i],
    memoryBleedForbiddenTerms: GENERAL_MEMORY_BLEED,
    defaultRun: false,
    fullOnly: true,
    liveProviderRequired: true,
  }),
  s({
    id: "memory-guard-design-no-bleed",
    title: "Design.com screenshot — server memory guard unit",
    category: "memory",
    audience: "iivo",
    tags: ["@memory", "@vision", "@iivo"],
    kind: "memory_guard_unit",
    prompt: "Analyze this screenshot of Design.com. What stands out visually?",
    screenshotTitle: "Logo, Graphic & AI Design | Design.com",
    memoryBleedForbiddenTerms: AI_FRONT_DESK_BLEED,
    requiredSignals: [/design|visual|screenshot/i],
    forbiddenSignals: AI_FRONT_DESK_BLEED.map((t) => new RegExp(t, "i")),
    liveProviderRequired: false,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "memory-guard-front-desk-landing",
    title: "AI Front Desk landing analysis with explicit preset",
    category: "memory",
    audience: "iivo",
    tags: ["@memory", "@iivo"],
    kind: "prompt_run",
    prompt:
      "Analyze this screenshot as my AI Front Desk landing page and tell me what to improve.",
    requiredSignals: [/improve|landing|front desk|page/i],
    forbiddenSignals: [],
    liveOnly: true,
    liveVisionRequired: true,
    preset: "ai-front-desk-sales-test",
    defaultRun: false,
  }),

  // ─── Lens / vision (IIVO features) ─────────────────────────────────────────
  s({
    id: "lens-page-summarize",
    title: "Summarize saved Lens page",
    category: "lens",
    audience: "iivo",
    agentMind: "Testing Lens handoff usefulness with a general founder article.",
    tags: ["@lens", "@iivo"],
    kind: "lens_handoff",
    prompt: "Summarize this page and tell me why I saved it.",
    lensPageTitle: "Founder strategy article — Daily Driver",
    lensPageContent:
      "Article argues founders should validate daily usage before adding features. Lists friction logging and scenario testing.",
    requiredSignals: [/summar|saved|page|article|friction|validate/i],
    forbiddenSignals: [/AI Front Desk/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "lens-invalid-id",
    title: "Invalid Lens handoff friendly error",
    category: "lens",
    audience: "iivo",
    tags: ["@lens", "@iivo"],
    kind: "lens_invalid",
    prompt: "",
    requiredSignals: [/could not|not found|invalid|unavailable/i],
    forbiddenSignals: [],
    failureSeverity: "blocker",
    liveProviderRequired: false,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "vision-designer-review",
    title: "Screenshot designer review (live vision)",
    category: "vision",
    audience: "general",
    tags: ["@vision"],
    kind: "screenshot_handoff",
    prompt:
      "Analyze this screenshot like a product designer. What stands out visually, what feels confusing, and what would you change first?",
    screenshotTitle: "Daily Driver UI mock",
    screenshotContent: "Purple header bar, yellow alert box, large green CTA button bottom-right.",
    requiredSignals: [/visual|color|confus|change|layout|screenshot/i],
    forbiddenSignals: [],
    screenshotRequired: true,
    liveVisionRequired: true,
    liveOnly: true,
    defaultRun: false,
  }),

  // ─── Rewrite (general) ─────────────────────────────────────────────────────
  s({
    id: "rewrite-confident",
    title: "Rewrite confident builder message",
    category: "rewrite",
    audience: "general",
    tags: ["@rewrite"],
    kind: "prompt_run",
    prompt:
      "Rewrite this so it sounds confident but not arrogant: I built something that can analyze what you're looking at, understand context, and help you make better decisions.",
    requiredSignals: [/analyze|context|decision/i],
    forbiddenSignals: [/revolutionary|disrupt/i],
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "rewrite-human",
    title: "De-corporatize platform copy",
    category: "rewrite",
    audience: "general",
    tags: ["@rewrite"],
    kind: "prompt_run",
    prompt:
      "Make this sound human, not corporate: Our platform leverages contextual intelligence to optimize decision workflows.",
    requiredSignals: [/context|decision|workflow|help|understand/i],
    forbiddenSignals: [/leverage synergies|paradigm/i],
    defaultRun: false,
    fullOnly: true,
  }),

  // ─── IIVO product scenarios (minority — max 10 in full catalog) ───────────
  s({
    id: "iivo-assistant-2hr-plan",
    title: "2-hour leverage plan for IIVO",
    category: "iivo-product",
    audience: "iivo",
    agentMind: "IIVO-specific product planning — allowed to discuss IIVO.",
    tags: ["@iivo", "@assistant"],
    kind: "prompt_run",
    prompt:
      "I have 2 hours today to move IIVO forward. Based on what IIVO is, give me the highest-leverage plan for today only.",
    requiredSignals: [/today|hour|leverage|plan|test|lens|vision|validation/i],
    forbiddenSignals: [...NO_BASIC_IIVO_PITCH, /AI Front Desk/i, /missed calls/i],
    forbidSelfReference: false,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "iivo-strategy-prioritize-features",
    title: "Prioritize five IIVO features this week",
    category: "iivo-product",
    audience: "iivo",
    tags: ["@iivo", "@strategy"],
    kind: "prompt_run",
    prompt:
      "I have 5 possible features: screenshot vision, desktop overlay, image generation, benchmark lab, and feedback log. Which one should I prioritize for user value this week?",
    workflow: "product-decision",
    requiredSignals: [/feedback|stabil|screenshot|overlay|benchmark|priorit/i],
    forbiddenSignals: [/all five equally/i],
    forbidSelfReference: false,
    defaultRun: false,
    fullOnly: true,
    liveProviderRequired: true,
    maxSeconds: 420,
  }),
  s({
    id: "iivo-failure-generic-checklist",
    title: "Diagnostic checklist for generic IIVO answers",
    category: "failure",
    audience: "iivo",
    tags: ["@iivo", "@failure"],
    kind: "prompt_run",
    prompt:
      "IIVO gave me an answer that feels generic. What should I check first: prompt, context, route, memory, or model?",
    requiredSignals: [/prompt|context|route|memory|model|check/i],
    forbiddenSignals: [],
    forbidSelfReference: false,
    defaultRun: false,
    fullOnly: true,
  }),
  // ─── Benchmark / outcome (full / live) ───────────────────────────────────────
  s({
    id: "benchmark-overlay-vs-lens-ui",
    title: "Benchmark Lab prompt selectable",
    category: "benchmark",
    audience: "iivo",
    tags: ["@benchmark", "@iivo"],
    kind: "benchmark_ui",
    prompt: "Should I add desktop overlay now or improve browser Lens first?",
    requiredSignals: [/benchmark|overlay|lens/i],
    forbiddenSignals: [],
    liveProviderRequired: false,
    defaultRun: false,
    fullOnly: true,
  }),
  s({
    id: "outcome-sms-manual-test",
    title: "SMS follow-up outcome flow",
    category: "outcome",
    audience: "iivo",
    tags: ["@outcome", "@iivo"],
    kind: "outcome_flow",
    prompt: "Should I test SMS follow-up manually before building it into the product?",
    requiredSignals: [/SMS|manual|test|outcome|in progress|cautious/i],
    forbiddenSignals: [/already succeeded|proven winner/i],
    workflow: "product-decision",
    liveOnly: true,
    defaultRun: false,
    maxSeconds: 600,
  }),
];

export function isDailyQaLive(): boolean {
  return process.env.DAILY_QA_LIVE === "1";
}

export function isDailyQaFull(): boolean {
  return process.env.DAILY_QA_FULL === "1" || isDailyQaLive();
}

export function getScenariosForRun(): DailyDriverScenario[] {
  return DAILY_DRIVER_SCENARIOS.filter((scenario) => {
    if (scenario.liveOnly && !isDailyQaLive()) return false;
    if (scenario.fullOnly && !isDailyQaFull()) return false;
    if (!isDailyQaFull() && !scenario.defaultRun) return false;
    if (scenario.liveVisionRequired && !isDailyQaLive()) return false;
    return true;
  });
}

export function getDefaultScenarioIds(): string[] {
  return DAILY_DRIVER_SCENARIOS.filter((s) => s.defaultRun).map((s) => s.id);
}

export interface ScenarioNarration {
  agentGoal: string;
  whyItMatters: string;
  userMindset: string;
  successLooksLike: string;
  failureLooksLike: string;
}

const CATEGORY_NARRATION: Partial<Record<DailyDriverCategory, Omit<ScenarioNarration, "agentGoal">>> = {
  founder: {
    whyItMatters: "Founders need lean decisions — not feature hype.",
    userMindset: "A founder with limited time and budget.",
    successLooksLike: "Clear recommendation, tradeoffs, and next 48-hour actions.",
    failureLooksLike: "Generic motivation or overbuilding advice.",
  },
  sales: {
    whyItMatters: "Sales tasks must be specific and outcome-oriented.",
    userMindset: "Someone doing outbound with real rejection risk.",
    successLooksLike: "Short copy, clear pain, concrete CTA, no hype.",
    failureLooksLike: "Buzzwords or vague 'AI-powered' language.",
  },
  marketing: {
    whyItMatters: "Positioning must be understood by normal business owners.",
    userMindset: "A marketer fixing unclear copy.",
    successLooksLike: "Plain language, buyer outcome, strong CTA.",
    failureLooksLike: "Jargon-heavy or feature-first copy.",
  },
  support: {
    whyItMatters: "Support tone affects trust and churn.",
    userMindset: "A support lead de-escalating a frustrated customer.",
    successLooksLike: "Calm tone, clear next step, no premature blame.",
    failureLooksLike: "Robotic template or admitting fault too early.",
  },
  memory: {
    whyItMatters: "Unrelated memory must not contaminate general business tasks.",
    userMindset: "A user asking about an unrelated industry problem.",
    successLooksLike: "On-topic answer with no IIVO or AI Front Desk bleed.",
    failureLooksLike: "IIVO, missed-call, or pilot-customer references.",
  },
  context: {
    whyItMatters: "Context Bridge should change the answer — not decorate generic advice.",
    userMindset: "A user who attached notes and expects them used.",
    successLooksLike: "Answer cites attached context and gives specific fixes.",
    failureLooksLike: "Generic advice ignoring the document.",
  },
  vision: {
    whyItMatters: "Screenshot/UI tasks need visual hierarchy and CTA clarity.",
    userMindset: "A founder reviewing a landing page visually.",
    successLooksLike: "Hierarchy, confusion points, and practical UI notes.",
    failureLooksLike: "Generic marketing advice without visual observations.",
  },
};

/** Resolved narration for Agent Mind (explicit fields or category defaults). */
export function resolveScenarioNarration(scenario: DailyDriverScenario): ScenarioNarration {
  const cat = CATEGORY_NARRATION[scenario.category];
  const promptBit = scenario.prompt
    ? scenario.prompt.slice(0, 120) + (scenario.prompt.length > 120 ? "…" : "")
    : scenario.title;
  return {
    agentGoal: scenario.agentGoal ?? scenario.agentMind ?? `Run scenario: ${promptBit}`,
    whyItMatters:
      scenario.whyItMatters ??
      cat?.whyItMatters ??
      (scenario.audience === "iivo"
        ? "Validates an IIVO-specific capability beyond generic chat."
        : "Checks whether IIVO is useful as a real assistant for this work."),
    userMindset:
      scenario.userMindset ??
      cat?.userMindset ??
      (scenario.audience === "general"
        ? "A real user doing actual work — not asking about IIVO."
        : "A builder testing IIVO product behavior."),
    successLooksLike:
      scenario.successLooksLike ??
      cat?.successLooksLike ??
      "Actionable answer with expected signals and no forbidden bleed.",
    failureLooksLike:
      scenario.failureLooksLike ??
      cat?.failureLooksLike ??
      "Generic answer, wrong route, memory bleed, or missing concrete next steps.",
  };
}

export interface DailyDriverMixStats {
  total: number;
  general: number;
  iivo: number;
  generalPct: number;
  iivoPct: number;
  defaultGeneral: number;
  defaultIivo: number;
}

export function getScenarioMixStats(): DailyDriverMixStats {
  const eligible = DAILY_DRIVER_SCENARIOS.filter((s) => !s.liveOnly);
  const general = eligible.filter((s) => s.audience === "general").length;
  const iivo = eligible.filter((s) => s.audience === "iivo").length;
  const total = eligible.length;
  const defaults = DAILY_DRIVER_SCENARIOS.filter((s) => s.defaultRun);
  return {
    total,
    general,
    iivo,
    generalPct: total ? Math.round((general / total) * 100) : 0,
    iivoPct: total ? Math.round((iivo / total) * 100) : 0,
    defaultGeneral: defaults.filter((s) => s.audience === "general").length,
    defaultIivo: defaults.filter((s) => s.audience === "iivo").length,
  };
}

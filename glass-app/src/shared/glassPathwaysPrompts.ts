/**
 * Glass Pathways — domain-aware generation prompts.
 * Pure module: no Electron, no AI calls. Shared across main + tests.
 */

export type PathwayDomainHint =
  | "app-launch"
  | "brand-launch"
  | "course"
  | "book"
  | "career"
  | "life-event"
  | "general";

interface PathwayDomainGuidance {
  label: string;
  stageArchetypes: string[];
  reviewFocus: string[];
  qualityRules: string[];
}

export const PATHWAY_DOMAIN_GUIDANCE: Record<PathwayDomainHint, PathwayDomainGuidance> = {
  "app-launch": {
    label: "app / software launch",
    stageArchetypes: [
      "problem clarity and who it's for",
      "competitor and market scan",
      "MVP scope and cut list",
      "architecture and build plan",
      "permissions, onboarding, and first-run",
      "notarization, codesign, and distribution",
      "launch messaging and early users",
      "post-launch iteration loop",
    ],
    reviewFocus: [
      "App Store / distribution requirements",
      "macOS permissions and entitlements",
      "Onboarding friction and activation metrics",
      "Build, signing, and release pipeline",
    ],
    qualityRules: [
      "Name concrete macOS/Electron concerns when relevant (notarization, sandbox, Sparkle, etc.).",
      "Surface steps builders skip (distribution, permissions, first-run polish).",
    ],
  },
  "brand-launch": {
    label: "brand / business launch",
    stageArchetypes: [
      "positioning and audience definition",
      "name, voice, and visual identity",
      "offer and pricing clarity",
      "landing page and core assets",
      "launch channel plan",
      "social proof and early traction",
      "feedback loop and iteration",
    ],
    reviewFocus: [
      "Positioning vs competitors",
      "Messaging consistency across channels",
      "Legal basics (trademark, terms) if relevant",
    ],
    qualityRules: [
      "Stages should feel like building a brand, not a generic marketing checklist.",
      "Include hidden steps like trademark checks or audience validation.",
    ],
  },
  course: {
    label: "course creation",
    stageArchetypes: [
      "learner outcome and transformation",
      "curriculum spine and module map",
      "lesson design and exercises",
      "recording / production setup",
      "platform and pricing",
      "beta cohort and feedback",
      "launch and enrollment",
      "iterate from student results",
    ],
    reviewFocus: [
      "Learning outcomes per module",
      "Assessment and practice loops",
      "Production quality bar",
    ],
    qualityRules: [
      "Focus on pedagogy and learner transformation, not just content production.",
    ],
  },
  book: {
    label: "book writing and release",
    stageArchetypes: [
      "core idea and reader promise",
      "outline and chapter architecture",
      "drafting rhythm and accountability",
      "revision and structural edit",
      "beta readers and feedback",
      "title, cover, and metadata",
      "publishing path (self vs traditional)",
      "launch and distribution",
    ],
    reviewFocus: [
      "Reader transformation per chapter",
      "Revision passes and editorial help",
      "ISBN, formatting, and distribution choices",
    ],
    qualityRules: [
      "Honor the long arc of writing — drafting and revision are distinct stages.",
    ],
  },
  career: {
    label: "career transition",
    stageArchetypes: [
      "clarity on target role and why",
      "skills gap and proof points",
      "portfolio / resume / narrative",
      "network and warm intros",
      "interview preparation",
      "offer evaluation",
      "transition plan and runway",
    ],
    reviewFocus: [
      "Evidence of fit for target role",
      "Network map and referral paths",
      "Financial runway and timeline",
    ],
    qualityRules: [
      "Be empathetic but concrete — name specific artifacts (portfolio pieces, outreach templates).",
    ],
  },
  "life-event": {
    label: "major life event",
    stageArchetypes: [
      "vision and constraints",
      "budget and timeline frame",
      "vendor / venue / logistics shortlist",
      "decisions that lock cost or date",
      "guest / stakeholder communication",
      "week-of execution checklist",
      "day-of flow and contingencies",
      "wrap-up and follow-through",
    ],
    reviewFocus: [
      "Budget and decision deadlines",
      "Contracts and cancellation terms",
      "Communication plan for key people",
    ],
    qualityRules: [
      "Stages should reduce overwhelm — sequence decisions that unlock later steps.",
    ],
  },
  general: {
    label: "multi-stage project",
    stageArchetypes: [
      "clarify the real goal and constraints",
      "research and unknowns",
      "scope and priorities",
      "plan the build / execution",
      "execute core work",
      "review and quality bar",
      "launch or handoff",
      "learn and iterate",
    ],
    reviewFocus: [
      "Assumptions to validate early",
      "Scope boundaries and non-goals",
      "Definition of done",
    ],
    qualityRules: [
      "Still be specific to the user's goal — avoid generic project-management language.",
    ],
  },
};

const DOMAIN_KEYWORDS: Array<{ hint: PathwayDomainHint; patterns: RegExp[] }> = [
  {
    hint: "app-launch",
    patterns: [
      /\b(electron|macos|ios|app store|software|saas|mvp|product)\b/i,
      /\b(launch (an|my|a) app|build (an|a) app|ship (an|a) app)\b/i,
    ],
  },
  {
    hint: "brand-launch",
    patterns: [
      /\b(brand|startup|business launch|company launch|go-to-market|gtm)\b/i,
    ],
  },
  {
    hint: "course",
    patterns: [
      /\b(course|curriculum|lesson|teach|cohort|udemy|skool)\b/i,
    ],
  },
  {
    hint: "book",
    patterns: [
      /\b(book|novel|manuscript|publish|author|chapter)\b/i,
    ],
  },
  {
    hint: "career",
    patterns: [
      /\b(career|job search|interview|resume|promotion|switch roles)\b/i,
    ],
  },
  {
    hint: "life-event",
    patterns: [
      /\b(wedding|move|moving|relocate|baby|renovation|event planning)\b/i,
    ],
  },
];

const FEW_SHOT_EXAMPLES: Record<PathwayDomainHint, string> = {
  "app-launch": `{
  "title": "Ship Glass for macOS",
  "summary": "A focused path from problem clarity through notarized distribution and first real users.",
  "domain": "app-launch",
  "stages": [
    {
      "title": "Define the macOS problem and first user",
      "objective": "Lock who Glass is for and what first-run success looks like on macOS.",
      "whyItMatters": "Electron apps fail when the problem is vague — every build decision follows from this.",
      "whatToReview": ["One-sentence problem statement", "First user persona", "Success metric for week one"],
      "commonMistakes": ["Building features before the core job-to-be-done is clear"],
      "alethiaHelp": ["Pressure-test the problem statement", "Compare to adjacent tools on macOS"],
      "userActions": ["Write a one-page problem brief naming the first user"],
      "completionCriteria": ["You can explain who it's for in one breath"]
    },
    {
      "title": "Plan notarization and distribution",
      "objective": "Map signing, notarization, and how users will install updates.",
      "whyItMatters": "Many builders ship code but stall on Apple distribution requirements.",
      "whatToReview": ["Developer ID cert status", "Notarization checklist", "Sparkle or direct download plan"],
      "commonMistakes": ["Leaving notarization until launch week"],
      "alethiaHelp": ["Walk through notarization steps", "Flag permission strings needed in Info.plist"],
      "userActions": ["List every macOS permission the app needs and why"],
      "completionCriteria": ["You have a written release path from build to install"]
    }
  ]
}`,
  "brand-launch": `{
  "title": "Launch Northwind Studio",
  "summary": "Position the brand, build core assets, and earn first credible traction.",
  "domain": "brand-launch",
  "stages": [
    {
      "title": "Lock positioning against alternatives",
      "objective": "State who you serve, what you replace, and why now.",
      "whyItMatters": "Weak positioning makes every downstream asset feel generic.",
      "whatToReview": ["Three competitor positioning lines", "Your one-line difference"],
      "commonMistakes": ["Trying to speak to everyone on day one"],
      "alethiaHelp": ["Sharpen the positioning statement", "Spot vague superlatives"],
      "userActions": ["Draft positioning: For [who], unlike [alternative], we [promise]"],
      "completionCriteria": ["A stranger can repeat your difference back"]
    }
  ]
}`,
  course: `{
  "title": "Launch a macOS Productivity Course",
  "summary": "Turn expertise into a structured learning path with a beta cohort before public launch.",
  "domain": "course",
  "stages": [
    {
      "title": "Define the transformation, not the syllabus",
      "objective": "Name the before/after state for your ideal student.",
      "whyItMatters": "Courses that list topics without transformation rarely retain students.",
      "whatToReview": ["Student starting point", "End-state capability", "Proof of learning"],
      "commonMistakes": ["Recording before outcomes are defined"],
      "alethiaHelp": ["Refine outcome statements", "Suggest assessment hooks"],
      "userActions": ["Write three measurable outcomes for graduates"],
      "completionCriteria": ["Each module ties to one outcome"]
    }
  ]
}`,
  book: `{
  "title": "Write and Release The Builder's Companion",
  "summary": "From thesis through revision, production, and a credible launch.",
  "domain": "book",
  "stages": [
    {
      "title": "Crystallize the reader promise",
      "objective": "State what changes for the reader after finishing the book.",
      "whyItMatters": "A vague promise produces a wandering manuscript.",
      "whatToReview": ["Comparable titles", "Your unique angle", "Reader profile"],
      "commonMistakes": ["Outlining every chapter before the promise is sharp"],
      "alethiaHelp": ["Stress-test the promise", "Suggest chapter spine from outcomes"],
      "userActions": ["Write the back-cover promise in two sentences"],
      "completionCriteria": ["Promise is specific enough to reject off-topic chapters"]
    }
  ]
}`,
  career: `{
  "title": "Move into Staff Engineering",
  "summary": "Close the gap between your current role and staff-level scope with proof and network.",
  "domain": "career",
  "stages": [
    {
      "title": "Map the staff bar at your target companies",
      "objective": "Document what staff engineers are expected to demonstrate where you want to go.",
      "whyItMatters": "Generic interview prep misses the scope bar hiring managers use.",
      "whatToReview": ["Staff job descriptions", "Public engineering ladders", "Your gap list"],
      "commonMistakes": ["Applying before you can point to scope-matching stories"],
      "alethiaHelp": ["Compare your stories to the ladder", "Suggest proof artifacts"],
      "userActions": ["List three staff-scope problems you've led end-to-end"],
      "completionCriteria": ["Each story names impact across teams or systems"]
    }
  ]
}`,
  "life-event": `{
  "title": "Plan a Destination Wedding",
  "summary": "Sequence decisions that lock budget and date, then execute without last-minute chaos.",
  "domain": "life-event",
  "stages": [
    {
      "title": "Set budget guardrails and guest count",
      "objective": "Agree on total budget and approximate guest list size before venue hunting.",
      "whyItMatters": "Venue choice drives most other costs — reversing it is expensive.",
      "whatToReview": ["Total budget ceiling", "Guest list draft", "Must-have vs nice-to-have"],
      "commonMistakes": ["Booking a venue before guest count is realistic"],
      "alethiaHelp": ["Model budget tradeoffs", "Flag hidden costs (travel, rentals)"],
      "userActions": ["Write budget cap and guest range with your partner"],
      "completionCriteria": ["Both agree on numbers before contacting venues"]
    }
  ]
}`,
  general: `{
  "title": "Complete the Studio Relocation",
  "summary": "A calm sequence from constraints through execution and settling in.",
  "domain": "general",
  "stages": [
    {
      "title": "List constraints that cannot move",
      "objective": "Capture immovable dates, budget, and people affected.",
      "whyItMatters": "Hidden constraints cause expensive replans mid-project.",
      "whatToReview": ["Hard deadlines", "Budget ceiling", "Stakeholders"],
      "commonMistakes": ["Planning details before constraints are written"],
      "alethiaHelp": ["Surface overlooked constraints", "Prioritize decisions"],
      "userActions": ["Write immovable constraints in one page"],
      "completionCriteria": ["Every later stage references these constraints"]
    }
  ]
}`,
};

export function inferPathwayDomainHint(goal: string): PathwayDomainHint {
  const text = goal.trim();
  if (!text) return "general";

  for (const { hint, patterns } of DOMAIN_KEYWORDS) {
    if (patterns.some((re) => re.test(text))) return hint;
  }
  return "general";
}

const JSON_SCHEMA_DESCRIPTION = `{
  "title": "short specific pathway title",
  "summary": "2-3 sentences on the journey arc",
  "domain": "short domain label matching the journey",
  "stages": [
    {
      "title": "specific stage name using goal language",
      "objective": "one clear sentence",
      "whyItMatters": "why skipping this stage hurts the goal",
      "whatToReview": ["concrete artifact or question"],
      "commonMistakes": ["specific mistake for this stage"],
      "alethiaHelp": ["how Aletheia can guide here"],
      "userActions": ["concrete action the user does"],
      "completionCriteria": ["observable done signal"]
    }
  ]
}`;

export function buildPathwayGenerationPrompt(goal: string, hint?: PathwayDomainHint): string {
  const domainHint = hint ?? inferPathwayDomainHint(goal);
  const guidance = PATHWAY_DOMAIN_GUIDANCE[domainHint];
  const example = FEW_SHOT_EXAMPLES[domainHint];

  return `You are Glass Pathways — Aletheia's pathway coach inside Glass.
You turn a meaningful goal into a wise, structured journey from idea to completion.
Write like a calm, grounded guide who knows what this kind of journey looks like.
Not a consulting deck. Not a generic task manager. Not fluffy motivation.

The user goal:
${goal.trim()}

Journey type: ${guidance.label}
Likely stage themes (adapt and reorder for this goal — do not copy verbatim):
${guidance.stageArchetypes.map((s) => `- ${s}`).join("\n")}

What to look for when reviewing:
${guidance.reviewFocus.map((s) => `- ${s}`).join("\n")}

Quality rules for this journey:
${guidance.qualityRules.map((s) => `- ${s}`).join("\n")}

Return ONLY valid JSON — no markdown fences, no commentary — matching this shape:
${JSON_SCHEMA_DESCRIPTION}

Global rules:
- 5–12 stages, sequentially ordered from clarity through completion.
- Every stage must include all fields above; each array must have 1–4 specific items.
- Use goal-specific nouns in every stage title — never generic titles like "Launch prep" or "Review progress".
- Surface non-obvious steps the user would miss on their own.
- Do not use placeholder text like "item 1", "mistake 1", or "done when…".
- Do not include id, index, or status fields — the client assigns those.
- Ban vague filler: "review your progress", "make sure to", "stay organized", "keep track".

Compact example (your full response must have 5–12 stages, not just these):
${example}`;
}

export function buildPathwayRefinementPrompt(
  goal: string,
  issues: string[],
  hint?: PathwayDomainHint,
): string {
  const base = buildPathwayGenerationPrompt(goal, hint);
  const issueBlock = issues.map((i) => `- ${i}`).join("\n");
  return `${base}

IMPORTANT — your previous attempt was too generic or incomplete.
Fix these issues:
${issueBlock}

Regenerate the full pathway with more specific stage names, concrete actions, and richer guidance arrays.`;
}

export function buildPathwayAskRequest(goal: string): {
  prompt: string;
  modelPurpose: "pathway";
  responseStyle: "full";
  suppressUserProfile: true;
  domainHint: PathwayDomainHint;
} {
  const domainHint = inferPathwayDomainHint(goal);
  return {
    prompt: buildPathwayGenerationPrompt(goal, domainHint),
    modelPurpose: "pathway",
    responseStyle: "full",
    suppressUserProfile: true,
    domainHint,
  };
}

import { normalizePromptForRouting } from "../agents/promptNormalize.js";

export type TaskIntent =
  | "asset_generation"
  | "rewrite_polish"
  | "summary"
  | "support_response"
  | "direct_answer"
  | "decision"
  | "strategy"
  | "analysis"
  | "research"
  | "vision_analysis"
  | "unknown";

export type TaskIntentResult = {
  intent: TaskIntent;
  confidence: number;
  matchedSignals: string[];
  reason: string;
};

type IntentRule = {
  intent: TaskIntent;
  patterns: RegExp[];
  confidence: number;
  signal: string;
};

const INTENT_RULES: IntentRule[] = [
  {
    intent: "direct_answer",
    patterns: [
      /^who is (it|this|that) for\??\s*$/i,
      /^who is .+ for\??\s*$/i,
      /^what is (it|this|that) for\??\s*$/i,
      /^what (does|do) (it|this|that) do\??\s*$/i,
      /^how is (it|this|that) different\??\s*$/i,
      /^what makes (it|this|that) different\??\s*$/i,
      /^(explain more|tell me more|what do you mean)\??\s*$/i,
    ],
    confidence: 88,
    signal: "identity/follow-up question",
  },
  {
    intent: "vision_analysis",
    patterns: [
      /\b(analyze this screenshot|what do you see (in|on)|screenshot|screen shot|visually|layout critique|UI critique|design critique|this image|attached image)\b/i,
      /\b(what('s| is) (wrong|off) (with|about) (this|the) (page|design|layout|UI))\b/i,
    ],
    confidence: 92,
    signal: "vision/screenshot",
  },
  {
    intent: "support_response",
    patterns: [
      /\b(customer says|write a (calm )?support response|reply to a customer|refund response|charged me but|can'?t access (my )?account|shipping delay response|apology response|billing issue)\b/i,
    ],
    confidence: 94,
    signal: "support/reply",
  },
  {
    intent: "rewrite_polish",
    patterns: [
      /\brewrite (the )?(hero|headline|copy|message|sentence|paragraph|text|tagline)\b/i,
      /\b(make this (sound|clearer|less corporate|more human|human)|remove jargon|plain english|simplify this|improve this copy|polish this|turn this into)\b/i,
      /\b(rewrite this|less corporate|understands it|jargon-heavy)\b/i,
    ],
    confidence: 93,
    signal: "rewrite/polish",
  },
  {
    intent: "summary",
    patterns: [
      /\b(summarize|tldr|tl;dr|one sentence summary|bullet summary|extract key points|in \d+ (bullet|sentence)s)\b/i,
    ],
    confidence: 91,
    signal: "summary",
  },
  {
    intent: "asset_generation",
    patterns: [
      /\b(write|draft|create) (a |an )?(cold email|outreach email|sales email|follow-up email|follow up email)\b/i,
      /\b(write|draft) (a |an )?(DM|linkedin message|pitch|sales script|voicemail|ad copy|landing page copy)\b/i,
      /\b(give me the message to send|create the copy|write the (ad|email body))\b/i,
      /\bwrite (the |a )?(email|message) to send\b/i,
    ],
    confidence: 92,
    signal: "deliverable/asset",
  },
  {
    intent: "strategy",
    patterns: [
      /\b(how should i sell|how should i (price|position|launch)|build a plan|go-to-market|\bgtm\b|launch strategy|sales strategy|acquisition plan|roadmap|7-day plan|campaign plan)\b/i,
      /\b(outreach (campaign|strategy|plan)|sales plan|growth plan)\b/i,
    ],
    confidence: 86,
    signal: "strategy/plan",
  },
  {
    intent: "decision",
    patterns: [
      /\b(which should|choose between|prioritize|decide whether|what should i build first)\b/i,
      /\b(should i .+ or .+)\b/i,
      /\b(option a or b|compare these options|build first\?)\b/i,
      /\busers keep asking for .+ which should\b/i,
    ],
    confidence: 88,
    signal: "decision",
  },
  {
    intent: "research",
    patterns: [
      /\b(market research|compare (the )?market|investigate|source-backed|cite sources|competitive landscape research)\b/i,
    ],
    confidence: 84,
    signal: "research",
  },
  {
    intent: "analysis",
    patterns: [
      /\b(deep analysis|risk assessment|assess (the )?risks|analyze deeply|due diligence|evaluate (the )?options)\b/i,
    ],
    confidence: 82,
    signal: "analysis",
  },
];

/** Disambiguate asset vs strategy when both could match. */
function refineAssetVsStrategy(text: string, base: TaskIntentResult): TaskIntentResult {
  if (base.intent !== "asset_generation" && base.intent !== "strategy") return base;

  const strategySignals = [
    /\bhow should i (sell|price|position)\b/i,
    /\b(campaign plan|go-to-market|GTM|acquisition plan|sales strategy)\b/i,
    /\b(build|create) (a |an )?(plan|strategy)\b/i,
  ];
  const assetSignals = [
    /\b(write|draft|create) (a |an )?(cold email|email|DM|script|message|pitch)\b/i,
    /\bgive me the (email|message|copy)\b/i,
  ];

  const hasStrategy = strategySignals.some((re) => re.test(text));
  const hasAsset = assetSignals.some((re) => re.test(text));

  if (hasAsset && !hasStrategy) {
    return { ...base, intent: "asset_generation", reason: "User asked for a concrete deliverable to send." };
  }
  if (hasStrategy && !hasAsset) {
    return { ...base, intent: "strategy", reason: "User asked for a plan or strategy, not a single asset." };
  }
  if (/\bshould i use\b/i.test(text) && /\bor\b/i.test(text)) {
    return {
      intent: "decision",
      confidence: 90,
      matchedSignals: ["decision: option compare"],
      reason: "User is choosing between approaches.",
    };
  }
  return base;
}

export function detectTaskIntent(prompt: string): TaskIntentResult {
  const text = normalizePromptForRouting(prompt.trim());
  if (!text) {
    return {
      intent: "unknown",
      confidence: 0,
      matchedSignals: [],
      reason: "Empty prompt.",
    };
  }

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        const result = refineAssetVsStrategy(text, {
          intent: rule.intent,
          confidence: rule.confidence,
          matchedSignals: [rule.signal],
          reason: `Matched ${rule.intent} (${rule.signal}).`,
        });
        return result;
      }
    }
  }

  if (/^(what is|explain|how does|describe)\b/i.test(text) && text.split(/\s+/).length <= 40) {
    return {
      intent: "direct_answer",
      confidence: 70,
      matchedSignals: ["direct_question"],
      reason: "Simple explanatory question.",
    };
  }

  return {
    intent: "unknown",
    confidence: 40,
    matchedSignals: [],
    reason: "No strong task intent signal.",
  };
}

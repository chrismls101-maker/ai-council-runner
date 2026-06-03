export type ImageIpGuardResult = {
  allowed: boolean;
  warning?: string;
  rewrittenPrompt?: string;
  issues: string[];
};

const COMPETITOR_PATTERNS = [
  /\bchatgpt\b/i,
  /\bclaude artifacts?\b/i,
  /\bgemini\b/i,
  /\bperplexity\b/i,
  /\bdall[\s-]?e\b/i,
  /\bnano banana\b/i,
];

const STYLE_COPY_PATTERNS = [
  /\bin the style of\b/i,
  /\blike (apple|nike|gucci|rolex|disney|marvel|pixar)\b/i,
  /\bexact (copy|replica|clone) of\b/i,
  /\bcopyrighted character\b/i,
  /\b(trademark|registered) logo\b/i,
  /\bmake (a|the) logo\b/i,
  /\bofficial logo\b/i,
];

const CHARACTER_PATTERNS = [
  /\b(mickey mouse|spider-?man|batman|superman|pokemon|mario|harry potter)\b/i,
];

function genericStyleRewrite(text: string): string {
  return text
    .replace(/\bin the style of [^,.;\n]+/gi, "with an original contemporary commercial style")
    .replace(/\blike [A-Z][^,.;\n]+/gi, "with a distinct original brand mood")
    .replace(/\bexact (copy|replica|clone) of [^,.;\n]+/gi, "an original concept inspired by the brief")
    .replace(/\b(make|create) (a|the) logo\b/gi, "create an abstract brand mark concept without trademarked logos")
    .trim();
}

export function guardImagePrompt(
  prompt: string,
  options?: { userOwnsBrand?: boolean },
): ImageIpGuardResult {
  const issues: string[] = [];
  let warning: string | undefined;
  let allowed = true;

  for (const pattern of COMPETITOR_PATTERNS) {
    if (pattern.test(prompt)) {
      issues.push("Avoid competitor product names in image prompts.");
    }
  }

  for (const pattern of STYLE_COPY_PATTERNS) {
    if (pattern.test(prompt)) {
      issues.push("Style-copy or logo request detected.");
      warning =
        "Use original style descriptions; avoid requesting copyrighted characters, logos, or exact brand replicas unless you own the rights.";
      if (!options?.userOwnsBrand) allowed = true;
    }
  }

  for (const pattern of CHARACTER_PATTERNS) {
    if (pattern.test(prompt)) {
      issues.push("Copyrighted character reference detected.");
      warning =
        "Copyrighted characters were referenced. IIVO rewrote the prompt into original descriptors.";
    }
  }

  const rewrittenPrompt = issues.length > 0 ? genericStyleRewrite(prompt) : prompt;

  return {
    allowed,
    warning,
    rewrittenPrompt: rewrittenPrompt !== prompt ? rewrittenPrompt : undefined,
    issues,
  };
}

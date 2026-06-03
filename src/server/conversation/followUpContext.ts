import { detectDirectAnswer } from "../agents/directAnswerHeuristic.js";

export interface ConversationContext {
  previousUserPrompt?: string;
  previousAssistantAnswer?: string;
}

/** Markers that indicate AI Front Desk preset bleed into a direct answer prompt. */
export const PRESET_BLEED_MARKERS = [
  "first five paying pilot",
  "first 5 pilot",
  "AI Front Desk",
  "AI receptionist",
  "missed call",
  "Problem Summary",
  "lead capture",
] as const;

const VAGUE_FOLLOW_UP_PATTERNS = [
  /^who is (it|this|that) for\??\s*$/i,
  /^what is (it|this|that) for\??\s*$/i,
  /^who (is|would|should) (it|this|that) (for|help|serve)\??\s*$/i,
  /^what (does|do) (it|this|that) do\??\s*$/i,
  /^how is (it|this|that) different\??\s*$/i,
  /^what makes (it|this|that) different\??\s*$/i,
  /^why (would|should) (someone|people|I|we|anyone) use (it|this|that)\??\s*$/i,
  /^who would use (it|this|that)\??\s*$/i,
  /^who would use this\??\s*$/i,
  /^(explain more|say more|tell me more|go on|what do you mean)\??\s*$/i,
  /^why\b/i,
  /^how\b/i,
];

const EXPLICIT_PRODUCT_KEYWORDS =
  /\b(ai front desk|front desk|receptionist|sarah|pilot customers?|plumbers?|outreach|prospects?|cold call|missed call|sales script|first 5)\b/i;

const IIVO_IDENTITY_PATTERNS = [
  /\biivo\b/i,
  /^what is iivo\b/i,
  /^who is iivo for\b/i,
  /^what makes iivo different\b/i,
  /^how is iivo different\b/i,
  /^why would someone use iivo\b/i,
  /difference between .*(chatgpt|claude|iivo)/i,
  /^explain iivo\b/i,
  /^what does iivo do\b/i,
];

export function isVagueFollowUp(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 14) return false;

  if (VAGUE_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return wordCount <= 8 && /\b(it|this|that)\b/i.test(text);
}

export function mentionsExplicitProductContext(prompt: string): boolean {
  return EXPLICIT_PRODUCT_KEYWORDS.test(prompt);
}

export function extractTopicFromPreviousTurn(
  previousUserPrompt: string,
  previousAssistantAnswer: string,
): string | null {
  const user = previousUserPrompt.trim();
  const answer = previousAssistantAnswer.trim().slice(0, 600);

  if (/\biivo\b/i.test(user)) return "IIVO";

  if (/\b(ai front desk|front desk)\b/i.test(user)) return "AI Front Desk";

  const whatIs = user.match(/^what (?:is|are|was)\s+(?:the\s+)?(.+?)\??\s*$/i);
  if (whatIs?.[1]) {
    const subject = whatIs[1]
      .trim()
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/\?+$/, "")
      .trim();
    if (subject.length > 0 && subject.length < 80) {
      return subject;
    }
  }

  const explain = user.match(/^explain\s+(?:what\s+)?(.+?)\??\s*$/i);
  if (explain?.[1]) {
    const subject = explain[1].trim().replace(/\?+$/, "").trim();
    if (subject.length > 0 && subject.length < 80) {
      return subject;
    }
  }

  if (/\bIIVO\b/.test(answer)) return "IIVO";
  if (/\bAI Front Desk\b/i.test(answer)) return "AI Front Desk";

  return null;
}

export function resolveFollowUpSubject(
  prompt: string,
  context?: ConversationContext,
): string | null {
  if (!context?.previousUserPrompt?.trim()) return null;
  if (!isVagueFollowUp(prompt)) return null;

  return extractTopicFromPreviousTurn(
    context.previousUserPrompt,
    context.previousAssistantAnswer ?? "",
  );
}

export function expandFollowUpPrompt(
  prompt: string,
  context?: ConversationContext,
): string {
  const subject = resolveFollowUpSubject(prompt, context);
  if (!subject) return prompt.trim();

  return prompt
    .trim()
    .replace(/\bit\b/gi, subject)
    .replace(/\bthis\b/gi, subject)
    .replace(/\bthat\b/gi, subject);
}

export function isIivoIdentityOrGeneralTopic(
  prompt: string,
  context?: ConversationContext,
): boolean {
  const expanded = expandFollowUpPrompt(prompt, context);

  if (IIVO_IDENTITY_PATTERNS.some((pattern) => pattern.test(expanded))) {
    return true;
  }

  if (/\biivo\b/i.test(prompt)) return true;

  if (context?.previousUserPrompt && /\biivo\b/i.test(context.previousUserPrompt)) {
    if (isVagueFollowUp(prompt) || IIVO_IDENTITY_PATTERNS.some((p) => p.test(prompt))) {
      return true;
    }
  }

  return false;
}

export function shouldOmitPresetContext(options: {
  prompt: string;
  preset: string;
  isDirectAnswer: boolean;
  conversationContext?: ConversationContext;
}): boolean {
  if (!options.isDirectAnswer) return false;
  if (!options.preset || options.preset === "none") return false;

  const { prompt, conversationContext } = options;
  const expanded = expandFollowUpPrompt(prompt, conversationContext);

  if (mentionsExplicitProductContext(prompt) || mentionsExplicitProductContext(expanded)) {
    return false;
  }

  if (/\bai front desk\b/i.test(conversationContext?.previousUserPrompt ?? "")) {
    if (isVagueFollowUp(prompt) || mentionsExplicitProductContext(prompt)) {
      return false;
    }
  }

  if (isIivoIdentityOrGeneralTopic(prompt, conversationContext)) {
    return true;
  }

  const subject = resolveFollowUpSubject(prompt, conversationContext);
  if (subject && /\biivo\b/i.test(subject)) {
    return true;
  }

  if (
    subject &&
    !/\b(ai front desk|front desk)\b/i.test(subject) &&
    isVagueFollowUp(prompt)
  ) {
    return true;
  }

  return false;
}

export function resolveMemoryProjectHint(options: {
  prompt: string;
  preset: string;
  businessContextName?: string;
  conversationContext?: ConversationContext;
  omitPreset: boolean;
}): string | undefined {
  const businessName = options.businessContextName?.trim();
  if (businessName) return businessName;

  const expanded = expandFollowUpPrompt(options.prompt, options.conversationContext);

  if (/\bai front desk\b/i.test(options.prompt) || /\bai front desk\b/i.test(expanded)) {
    return "AI Front Desk";
  }

  if (options.omitPreset) {
    const subject = resolveFollowUpSubject(options.prompt, options.conversationContext);
    if (subject && /\b(ai front desk|front desk)\b/i.test(subject)) {
      return "AI Front Desk";
    }
    return undefined;
  }

  if (options.preset === "ai-front-desk-sales-test") {
    return "AI Front Desk";
  }

  return undefined;
}

export function buildConversationContextBlock(
  prompt: string,
  context?: ConversationContext,
): string | undefined {
  if (!context?.previousUserPrompt?.trim()) return undefined;

  const answerExcerpt = (context.previousAssistantAnswer ?? "")
    .trim()
    .slice(0, 500);
  const resolved = expandFollowUpPrompt(prompt, context);
  const lines = [
    "Recent conversation (for follow-up context):",
    `Previous user question: ${context.previousUserPrompt.trim()}`,
  ];

  if (answerExcerpt) {
    lines.push(`Previous IIVO answer (excerpt): ${answerExcerpt}`);
  }

  lines.push(`Current user question: ${prompt.trim()}`);

  if (resolved !== prompt.trim()) {
    lines.push(`Resolved meaning: ${resolved}`);
  }

  return lines.join("\n");
}

export function buildRouterPrompt(
  prompt: string,
  context?: ConversationContext,
  externalContextHint?: string,
): string {
  const expanded = expandFollowUpPrompt(prompt, context);
  const lines: string[] = [];
  if (externalContextHint?.trim()) {
    lines.push(externalContextHint.trim());
  }
  if (!context?.previousUserPrompt?.trim() || expanded === prompt.trim()) {
    lines.push(prompt.trim());
    return lines.join("\n");
  }

  const subject = resolveFollowUpSubject(prompt, context);
  if (!subject) {
    lines.push(prompt.trim());
    return lines.join("\n");
  }

  lines.push(
    `Conversation context: the user previously asked about "${subject}".`,
    `Current question (resolved): ${expanded}`,
  );
  return lines.join("\n");
}

/** Effective one-line prompt for routing heuristics (not the LLM router wrapper). */
export function resolveRoutingPrompt(
  prompt: string,
  context?: ConversationContext,
): string {
  return expandFollowUpPrompt(prompt, context);
}

export function shouldForceDirectAnswerRoute(
  prompt: string,
  context?: ConversationContext,
): boolean {
  const routingPrompt = resolveRoutingPrompt(prompt, context);
  if (detectDirectAnswer(routingPrompt)) return true;
  if (isIivoIdentityOrGeneralTopic(prompt, context)) return true;
  return false;
}

export function shouldStripMemoryForIivoIdentity(options: {
  prompt: string;
  conversationContext?: ConversationContext;
  omitPreset: boolean;
}): boolean {
  if (!options.omitPreset) return false;
  return isIivoIdentityOrGeneralTopic(options.prompt, options.conversationContext);
}

/** Minimal direct-answer prompt for IIVO identity / follow-up — no preset or memory blocks. */
export function buildSlimDirectAnswerPrompt(options: {
  routingPrompt: string;
  conversationBlock?: string;
  externalContextBlock?: string;
}): string {
  const sections: string[] = [];
  if (options.conversationBlock?.trim()) {
    sections.push(options.conversationBlock.trim());
  }
  if (options.externalContextBlock?.trim()) {
    sections.push(options.externalContextBlock.trim());
  }
  sections.push(`User Request:\n${options.routingPrompt.trim()}`);
  return sections.join("\n\n---\n\n");
}

export function logFollowUpResolution(options: {
  currentPrompt: string;
  conversationContext?: ConversationContext;
  resolvedPrompt: string;
  topic: string | null;
  omitPreset: boolean;
  memoryMode?: string;
  presetExcluded: boolean;
  routeId?: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[IIVO follow-up]", {
    currentPrompt: options.currentPrompt,
    previousUserPrompt: options.conversationContext?.previousUserPrompt ?? null,
    resolvedPrompt: options.resolvedPrompt,
    topic: options.topic,
    omitPreset: options.omitPreset,
    memoryMode: options.memoryMode ?? null,
    presetExcluded: options.presetExcluded,
    routeId: options.routeId ?? null,
  });
}

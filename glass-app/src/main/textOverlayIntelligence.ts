/**
 * Glass this — four-level intelligence pipeline.
 * L1 Haiku, L2 Perplexity only, L3 memory, L4 rule-based actions.
 */

import { listApiKeys, getApiKeyValue } from "./apiKeyStore.ts";
import { buildUserProfile } from "./glassMemoryEngine.ts";
import {
  deriveTextOverlayActions,
  LEVEL1_DISCLAIMER,
  L2_VERIFICATION_PROMPTS,
  needsLevel1Disclaimer,
  shouldRunL2Verification,
  type TextContentType,
  type TextOverlayCard,
  type TextOverlayCardUpdate,
  type TextOverlayExtraction,
  type VerificationConfidence,
} from "../shared/textOverlayTypes.ts";
import { enrichTextOverlayActions } from "../shared/textOverlayActions.ts";
import { buildE2eTextOverlayCard } from "./textOverlayE2eStubs.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";

const L1_TIMEOUT_MS = 10_000;
const L2_TIMEOUT_MS = 15_000;
const L3_TIMEOUT_MS = 10_000;

function resolveAnthropicKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

function resolvePerplexityKey(): string | null {
  const keys = listApiKeys();
  for (const meta of keys) {
    if (meta.service.toLowerCase().includes("perplexity")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }
  return process.env.PERPLEXITY_API_KEY?.trim() ?? null;
}

function l1SystemPrompt(contentType: TextContentType): string {
  return `You explain on-screen text in plain language for someone reading while working.
Content type: ${contentType}.
Rules:
- Rephrase or translate what's already there — never invent facts.
- Scale length to complexity: a word needs one sentence; a dense clause may need up to 4 sentences. Never exceed 4 sentences.
- For email: note tone/intent briefly.
- For foreign language: give translation + brief context.
- For jargon (legal/technical/medical): explain terms simply.`;
}

async function runLevel1(extraction: TextOverlayExtraction): Promise<string | null> {
  const apiKey = resolveAnthropicKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), L1_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 320,
        system: l1SystemPrompt(extraction.contentType),
        messages: [
          {
            role: "user",
            content: `Explain this text:\n\n${extraction.logicalUnit}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface L2Result {
  text: string | null;
  source: { title: string; url: string } | null;
  confidence: VerificationConfidence;
}

function parsePerplexityCitations(
  citations: unknown,
  content: string,
): { title: string; url: string } | null {
  if (Array.isArray(citations) && citations.length > 0) {
    const first = citations[0];
    if (typeof first === "string" && first.startsWith("http")) {
      try {
        return { title: new URL(first).hostname, url: first };
      } catch {
        return null;
      }
    }
  }
  const urlMatch = content.match(/https?:\/\/[^\s)\]"']+/);
  if (urlMatch) {
    try {
      const url = urlMatch[0];
      return { title: new URL(url).hostname, url };
    } catch {
      return null;
    }
  }
  return null;
}

async function runLevel2(extraction: TextOverlayExtraction): Promise<L2Result> {
  if (!shouldRunL2Verification(extraction.contentType)) {
    return { text: null, source: null, confidence: "unverifiable" };
  }

  const key = resolvePerplexityKey();
  if (!key) {
    return { text: null, source: null, confidence: "unverifiable" };
  }

  const verifyPrompt =
    L2_VERIFICATION_PROMPTS[extraction.contentType as keyof typeof L2_VERIFICATION_PROMPTS];
  const userMessage = `${verifyPrompt}\n\nVerbatim text:\n"""${extraction.logicalUnit}"""`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), L2_TIMEOUT_MS);

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Answer concisely in 2-3 sentences. Always cite at least one source URL. If sources conflict or you cannot verify, say so explicitly.",
          },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        return_citations: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { text: null, source: null, confidence: "unverifiable" };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { text: null, source: null, confidence: "unverifiable" };
    }

    const lower = content.toLowerCase();
    if (
      lower.includes("cannot verify")
      || lower.includes("can't verify")
      || lower.includes("conflicting sources")
      || lower.includes("unclear")
      || lower.includes("insufficient")
    ) {
      return {
        text: "Sources conflict — verify independently.",
        source: null,
        confidence: "uncertain",
      };
    }

    const source = parsePerplexityCitations(data.citations, content);
    if (!source) {
      return { text: null, source: null, confidence: "unverifiable" };
    }

    return { text: content, source, confidence: "confirmed" };
  } catch {
    return { text: null, source: null, confidence: "unverifiable" };
  } finally {
    clearTimeout(timer);
  }
}

async function runLevel3(
  extraction: TextOverlayExtraction,
  level1: string,
): Promise<string | null> {
  const profile = buildUserProfile().trim();
  if (!profile || profile.length < 20) return null;

  const apiKey = resolveAnthropicKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), L3_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 180,
        system:
          "Adapt the comprehension note for this specific user using ONLY their memory profile. One short sentence. If nothing relevant, respond with exactly: SKIP",
        messages: [
          {
            role: "user",
            content: `User profile:\n${profile}\n\nContent type: ${extraction.contentType}\nText: ${extraction.logicalUnit}\nComprehension: ${level1}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text || text === "SKIP") return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type TextOverlayProgressiveEmit = {
  /** Card first paint — fired as soon as ANY level resolves (L1 or L2). */
  onFirst: (card: TextOverlayCard) => void;
  /** Later levels appended to the live card. */
  onUpdate: (update: TextOverlayCardUpdate) => void;
};

/**
 * Progressive four-level pipeline. The card is born from the first level that
 * resolves and grows as later levels land — it never waits for the full batch.
 * A successful L2 (Perplexity) is never discarded because L1 timed out.
 */
export async function runTextOverlayIntelligence(input: {
  extraction: TextOverlayExtraction;
  cursorX: number;
  cursorY: number;
  cardId: string;
  signal?: AbortSignal;
  textAnchor?: TextOverlayCard["textAnchor"];
  appTint?: TextOverlayCard["appTint"];
  lightMode?: boolean;
  emit?: TextOverlayProgressiveEmit;
}): Promise<TextOverlayCard | null> {
  if (input.signal?.aborted) return null;

  if (process.env.IIVO_GLASS_E2E === "1") {
    const stub = buildE2eTextOverlayCard(input);
    if (stub) input.emit?.onFirst(stub);
    return stub;
  }

  const { extraction } = input;
  const pending = {
    l1: true,
    l2: shouldRunL2Verification(extraction.contentType),
    l3: true,
  };
  const acc: {
    level1: string | null;
    level2: string | null;
    level2Source: TextOverlayCard["level2Source"];
    verificationConfidence: VerificationConfidence;
    level3: string | null;
  } = {
    level1: null,
    level2: null,
    level2Source: undefined,
    verificationConfidence: "unverifiable",
    level3: null,
  };
  let shown = false;

  const buildCard = (): TextOverlayCard => ({
    id: input.cardId,
    rawText: extraction.rawText,
    logicalUnit: extraction.logicalUnit,
    contentType: extraction.contentType,
    level1: acc.level1,
    level1Disclaimer: needsLevel1Disclaimer(extraction.contentType)
      ? LEVEL1_DISCLAIMER
      : undefined,
    level2: acc.level2,
    level2Source: acc.level2Source,
    verificationConfidence: acc.verificationConfidence,
    level3: acc.level3,
    level4: enrichTextOverlayActions(
      deriveTextOverlayActions(extraction.contentType),
      {
        rawText: extraction.rawText,
        level1: acc.level1 ?? "",
        contentType: extraction.contentType,
      },
    ),
    triggerSource: extraction.triggerSource,
    cursorX: input.cursorX,
    cursorY: input.cursorY,
    createdAt: Date.now(),
    textAnchor: input.textAnchor,
    appTint: input.appTint,
    lightMode: input.lightMode,
    pendingLevels: { ...pending },
  });

  const emitProgress = (): void => {
    if (!input.emit || input.signal?.aborted) return;
    if (!shown) {
      if (acc.level1 == null && acc.level2 == null) return;
      shown = true;
      input.emit.onFirst(buildCard());
      return;
    }
    input.emit.onUpdate({
      cardId: input.cardId,
      level1: acc.level1,
      level2: acc.level2,
      level2Source: acc.level2Source,
      verificationConfidence: acc.verificationConfidence,
      level3: acc.level3,
      pendingLevels: { ...pending },
    });
  };

  const l1Task = runLevel1(extraction).then((level1) => {
    pending.l1 = false;
    acc.level1 = level1;
    emitProgress();
    return level1;
  });

  const l2Task = runLevel2(extraction).then((l2Result) => {
    pending.l2 = false;
    acc.verificationConfidence = l2Result.confidence;
    if (l2Result.confidence === "confirmed" && l2Result.text && l2Result.source) {
      acc.level2 = l2Result.text;
      acc.level2Source = l2Result.source;
    } else if (l2Result.confidence === "uncertain" && l2Result.text) {
      acc.level2 = l2Result.text;
    }
    emitProgress();
    return l2Result;
  });

  const level1 = await l1Task;
  if (input.signal?.aborted) return null;

  if (level1) {
    acc.level3 = await runLevel3(extraction, level1);
  }
  pending.l3 = false;
  if (input.signal?.aborted) return null;
  emitProgress();

  await l2Task;
  if (input.signal?.aborted) return null;
  emitProgress();

  if (acc.level1 == null && acc.level2 == null) return null;
  return buildCard();
}

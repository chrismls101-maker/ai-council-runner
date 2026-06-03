import type { Memory } from "./types.js";

export const VISION_MEMORY_GENERIC_TERMS = new Set([
  "ai",
  "website",
  "page",
  "design",
  "business",
  "landing",
  "screenshot",
  "analyze",
  "visual",
  "company",
  "service",
  "tool",
  "product",
  "site",
  "web",
  "app",
  "home",
  "logo",
  "graphic",
  "content",
  "stand",
  "out",
  "matters",
  "risks",
  "issues",
  "next",
  "tell",
  "what",
  "see",
  "review",
]);

const PROMPT_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "with",
  "this",
  "that",
  "from",
  "should",
  "when",
  "about",
  "your",
  "you",
  "are",
  "was",
  "be",
  "is",
  "it",
  "of",
  "as",
  "my",
  "our",
  "me",
  "do",
  "does",
  "can",
  "will",
  "would",
  "could",
  "have",
  "has",
  "had",
  "not",
  "only",
  "also",
  "into",
  "than",
  "then",
  "them",
  "they",
  "their",
  "there",
  "these",
  "those",
  "how",
  "why",
  "who",
  "which",
  "where",
  "while",
  "during",
  "after",
  "before",
  "very",
  "just",
  "like",
  "make",
  "made",
  "take",
  "tell",
  "give",
  "need",
  "want",
  "help",
  "please",
]);

export interface VisionMemoryGuardInput {
  prompt: string;
  screenshotTitle?: string;
  sourceUrl?: string;
  contextTags?: string[];
  candidateMemory: Memory;
  projectNameHint?: string;
}

export interface VisionMemoryRunContext {
  prompt: string;
  screenshotTitle?: string;
  sourceUrl?: string;
  contextTags?: string[];
  projectNameHint?: string;
}

export interface VisionMemoryGuardTrace {
  applied: boolean;
  candidateCount: number;
  includedCount: number;
  excludedCount: number;
  note: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenizeForVision(text: string): string[] {
  return [
    ...new Set(
      normalizeText(text)
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 &&
            !PROMPT_STOP_WORDS.has(word) &&
            !VISION_MEMORY_GENERIC_TERMS.has(word),
        ),
    ),
  ];
}

function memoryProjectName(memory: Memory): string | undefined {
  if (memory.type === "preference" || memory.type === "evidence") {
    return memory.projectName?.trim() || undefined;
  }
  return memory.projectName?.trim() || undefined;
}

function memorySearchText(memory: Memory): string {
  const parts: string[] = [];
  switch (memory.type) {
    case "project_fact":
      parts.push(memory.projectName, memory.title, memory.content, ...memory.tags);
      break;
    case "decision":
      parts.push(memory.projectName, memory.decision, memory.reason, memory.status);
      break;
    case "outcome":
      parts.push(memory.projectName, memory.notes ?? "", memory.resultMetric ?? "", memory.outcomeStatus);
      break;
    case "preference":
      parts.push(memory.title, memory.content, memory.projectName ?? "", memory.scope);
      break;
    case "evidence":
      parts.push(
        memory.title,
        memory.content,
        memory.projectName ?? "",
        memory.sourceUrl ?? "",
        memory.sourceType ?? "",
      );
      break;
  }
  return parts.join(" ");
}

function extractHostname(url?: string): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function promptReferencesProject(prompt: string, projectName: string): boolean {
  const promptLower = prompt.toLowerCase();
  const projectLower = projectName.toLowerCase();
  if (promptLower.includes(projectLower)) return true;

  const slug = slugify(projectName);
  const compactProject = compact(projectName);
  if (slug && promptLower.includes(slug)) return true;
  if (compactProject && promptLower.includes(compactProject)) return true;

  const possessive = new RegExp(`\\b(?:my|our)\\s+${escapeRegExp(projectLower)}\\b`, "i");
  if (possessive.test(prompt)) return true;

  const pageRef = new RegExp(
    `\\b${escapeRegExp(projectLower)}\\s+(?:landing\\s+)?(?:page|site|dashboard|screen|ui|homepage)\\b`,
    "i",
  );
  if (pageRef.test(prompt)) return true;

  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function promptComparesToNamedProduct(prompt: string, productName: string): boolean {
  const promptLower = prompt.toLowerCase();
  const productLower = productName.toLowerCase();
  if (!promptLower.includes("compare")) return false;
  return promptLower.includes(productLower);
}

function screenshotReferencesProject(input: {
  screenshotTitle?: string;
  sourceUrl?: string;
  contextTags?: string[];
  projectName: string;
}): boolean {
  const { screenshotTitle, sourceUrl, contextTags, projectName } = input;
  const projectLower = projectName.toLowerCase();
  const slug = slugify(projectName);
  const compactProject = compact(projectName);

  if (screenshotTitle?.toLowerCase().includes(projectLower)) return true;

  const hostname = extractHostname(sourceUrl);
  if (hostname) {
    if (hostname.includes(slug) || hostname.includes(compactProject)) return true;
    if (sourceUrl?.toLowerCase().includes(slug)) return true;
  }

  if (contextTags?.some((tag) => tag.toLowerCase().includes(projectLower))) return true;

  return false;
}

function countStrongKeywordOverlap(contextText: string, memoryText: string): number {
  const contextTokens = tokenizeForVision(contextText);
  const memoryTokens = new Set(tokenizeForVision(memoryText));
  return contextTokens.filter((token) => memoryTokens.has(token)).length;
}

export function shouldIncludeMemoryForVisionRun(input: VisionMemoryGuardInput): boolean {
  const {
    prompt,
    screenshotTitle,
    sourceUrl,
    contextTags,
    candidateMemory,
    projectNameHint,
  } = input;

  const memoryProject = memoryProjectName(candidateMemory);
  const memoryText = memorySearchText(candidateMemory);
  const contextBundle = [prompt, screenshotTitle, sourceUrl, ...(contextTags ?? [])]
    .filter(Boolean)
    .join(" ");

  if (memoryProject) {
    if (promptReferencesProject(prompt, memoryProject)) return true;

    if (
      promptComparesToNamedProduct(prompt, memoryProject) ||
      (memoryProject.toLowerCase() === "iivo" && promptComparesToNamedProduct(prompt, "IIVO"))
    ) {
      return true;
    }

    if (
      screenshotReferencesProject({
        screenshotTitle,
        sourceUrl,
        contextTags,
        projectName: memoryProject,
      })
    ) {
      return true;
    }

    if (projectNameHint && normalizeText(projectNameHint) === normalizeText(memoryProject)) {
      if (
        screenshotReferencesProject({
          screenshotTitle,
          sourceUrl,
          contextTags,
          projectName: memoryProject,
        }) ||
        promptReferencesProject(prompt, memoryProject)
      ) {
        return true;
      }
    }
  }

  if (promptComparesToNamedProduct(prompt, "IIVO")) {
    const haystack = normalizeText(memoryText);
    if (haystack.includes("iivo")) return true;
  }

  const overlap = countStrongKeywordOverlap(contextBundle, memoryText);
  if (overlap >= 3) return true;

  if (overlap >= 2 && memoryProject) {
    const overlapTokens = tokenizeForVision(contextBundle).filter((token) =>
      tokenizeForVision(memoryText).includes(token),
    );
    const projectTokens = tokenizeForVision(memoryProject);
    if (overlapTokens.some((token) => projectTokens.includes(token))) return true;
  }

  return false;
}

export function filterMemoriesForVisionRun(
  memories: Memory[],
  context: VisionMemoryRunContext,
): Memory[] {
  return memories.filter((candidateMemory) =>
    shouldIncludeMemoryForVisionRun({
      prompt: context.prompt,
      screenshotTitle: context.screenshotTitle,
      sourceUrl: context.sourceUrl,
      contextTags: context.contextTags,
      candidateMemory,
      projectNameHint: context.projectNameHint,
    }),
  );
}

export function applyVisionMemoryGuard(
  memories: Memory[],
  context: VisionMemoryRunContext,
): { memories: Memory[]; trace: VisionMemoryGuardTrace } {
  const filtered = filterMemoriesForVisionRun(memories, context);
  const excludedCount = memories.length - filtered.length;

  let note: string;
  if (filtered.length === 0) {
    note =
      excludedCount > 0
        ? "Memory was not included because this screenshot analysis did not match saved project context."
        : "No memory context included.";
  } else if (excludedCount > 0) {
    note = "Memory included: matched screenshot/project context. Unrelated memories were excluded.";
  } else {
    note = "Memory included: matched screenshot/project context.";
  }

  return {
    memories: filtered,
    trace: {
      applied: true,
      candidateCount: memories.length,
      includedCount: filtered.length,
      excludedCount,
      note,
    },
  };
}

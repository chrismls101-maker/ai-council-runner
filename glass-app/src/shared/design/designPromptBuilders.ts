import type {
  CodebaseStylePack,
  DesignGenerationInput,
  DesignScreenSpec,
  DesignToCodeAction,
  DesignToCodeContext,
} from "./designToCodeTypes.ts";
import type { DesignStack } from "./designToCodeTypes.ts";
import { langTagFor, stackHint } from "./designStackRegistry.ts";
import { serializeScreenSpecForPrompt } from "./designScreenSpecSchema.ts";

export function buildSharedVisionPreamble(): string {
  return [
    "The attached screenshot is the source of truth for layout, hierarchy, spacing, colors, visible copy, and interaction cues.",
    "Reproduce the visible UI faithfully — not creatively.",
    "Do not invent extra screens, states, features, or content.",
    "Prefer semantic structure and reusable components over absolute positioning unless the design clearly requires tight positioning.",
    "If a region is unclear, preserve intent conservatively and note uncertainty instead of hallucinating detail.",
    "Follow the output contract exactly.",
  ].join(" ");
}

export function buildDesignScreenSpecPrompt(): string {
  return [
    buildSharedVisionPreamble(),
    "Analyze the screenshot and return ONLY valid JSON (no markdown fences).",
    "Schema fields:",
    '{"screenType","confidence","warnings","visibleRegions","layoutTree","components","repeatedPatterns","textContent","palette","typography","spacing","borders","shadows","interactionAffordances","estimatedResponsiveness","uncertainAreas"}',
    "Count repeated elements accurately. Flag uncertainAreas where text or structure is ambiguous.",
  ].join("\n");
}

function specSection(spec: DesignScreenSpec): string {
  return `\n\nStructured screen spec (from prior analysis — use with screenshot):\n${serializeScreenSpecForPrompt(spec)}`;
}

function stylePackSection(pack?: CodebaseStylePack): string {
  if (!pack || pack.confidence === "none") return "";
  const lines: string[] = ["\n\nCodebase style pack:"];
  if (pack.confidence === "degraded") {
    lines.push("(Reduced confidence — limited local context was available.)");
  }
  if (pack.framework) lines.push(`Framework: ${pack.framework}`);
  if (pack.stylingSystem) lines.push(`Styling: ${pack.stylingSystem}`);
  if (pack.uiLibraries?.length) lines.push(`UI libraries: ${pack.uiLibraries.join(", ")}`);
  if (pack.componentPatterns?.length) {
    lines.push(`Component patterns: ${pack.componentPatterns.join("; ")}`);
  }
  if (pack.namingPatterns?.length) {
    lines.push(`Naming: ${pack.namingPatterns.join("; ")}`);
  }
  if (pack.importConventions?.length) {
    lines.push(`Imports: ${pack.importConventions.join("; ")}`);
  }
  if (pack.pathAliasConventions?.length) {
    lines.push(`Path aliases: ${pack.pathAliasConventions.join("; ")}`);
  }
  if (pack.designTokens?.length) lines.push(`Tokens: ${pack.designTokens.join("; ")}`);
  if (pack.packageJsonSummary) lines.push(`package.json: ${pack.packageJsonSummary}`);
  if (pack.tailwindSummary) lines.push(`Tailwind: ${pack.tailwindSummary}`);
  if (pack.openFileContext) {
    lines.push(
      `Open file: ${pack.openFileContext.fileName} (${pack.openFileContext.language})`,
    );
  }
  return lines.join("\n");
}

function stackComponentPrompt(stack: DesignStack): { fence: string; instructions: string } {
  switch (stack) {
    case "vue":
    case "nuxt":
      return {
        fence: "vue",
        instructions: stackHint(stack),
      };
    case "svelte":
      return { fence: "svelte", instructions: stackHint(stack) };
    case "solid":
      return { fence: "tsx", instructions: stackHint(stack) };
    case "astro":
      return { fence: "astro", instructions: stackHint(stack) };
    case "angular":
      return { fence: "typescript", instructions: stackHint(stack) };
    case "react-native":
      return { fence: "tsx", instructions: stackHint(stack) };
    case "html-css":
      return { fence: "html", instructions: stackHint(stack) };
    default:
      return { fence: "tsx", instructions: stackHint(stack) };
  }
}

export function buildReactPrompt(
  spec: DesignScreenSpec,
  stack: DesignStack,
  stylePack?: CodebaseStylePack,
): string {
  const { fence, instructions } = stackComponentPrompt(stack);
  return [
    buildSharedVisionPreamble(),
    `Generate a single self-contained component that faithfully implements the design.`,
    `Return exactly one fenced \`\`\`${fence} code block with the complete component.`,
    "Use semantic structure. No extra explanation outside the code block.",
    instructions,
    specSection(spec),
    stylePackSection(stylePack),
  ].join(" ");
}

export function buildHtmlPrompt(spec: DesignScreenSpec, stylePack?: CodebaseStylePack): string {
  return [
    buildSharedVisionPreamble(),
    "Generate semantic HTML5 markup with an inline <style> block that faithfully implements the design.",
    "Return exactly one fenced ```html code block.",
    "No JavaScript frameworks — plain HTML and CSS only.",
    specSection(spec),
    stylePackSection(stylePack),
  ].join(" ");
}

export function buildDescribePrompt(spec: DesignScreenSpec): string {
  return [
    buildSharedVisionPreamble(),
    "Provide a precise visual analysis. Do not write code or use code fences.",
    "Cover: layout, hierarchy, spacing, palette, typography, visual style, component breakdown, interaction hints, ambiguities.",
    specSection(spec),
  ].join(" ");
}

export function buildMatchCodebasePrompt(
  spec: DesignScreenSpec,
  ctx: DesignToCodeContext,
  stack: DesignStack,
  stylePack?: CodebaseStylePack,
): string {
  const { fence } = stackComponentPrompt(stack);
  const base = [
    buildSharedVisionPreamble(),
    `Generate a single self-contained component matching the screenshot and your codebase conventions.`,
    `Return exactly one fenced \`\`\`${fence} code block.`,
    specSection(spec),
    stylePackSection(stylePack),
  ];

  if (ctx.content !== null && ctx.fileName) {
    const tag = langTagFor(ctx.language);
    let p = base.join(" ");
    p += `\n\nOpen file (${ctx.fileName}, ${ctx.language}):\n\`\`\`${tag}\n${ctx.content}\n\`\`\``;
    const imports = ctx.importedFiles ?? [];
    if (imports.length > 0) {
      p += `\n\nImported files for context:`;
      for (const imp of imports) {
        const impTag = langTagFor(imp.language);
        p += `\n\n**${imp.fileName}** (${imp.language}):\n\`\`\`${impTag}\n${imp.content}\n\`\`\``;
      }
    }
    p += "\n\nMatch import style, component patterns, styling approach, and naming from the codebase.";
    return p;
  }

  return `${base.join(" ")} No codebase file was available. ${stackHint(stack)}`;
}

export function buildGenerationPrompt(input: DesignGenerationInput): string {
  const { action, stack, screenSpec, stylePack, ctx, refinementFeedback, priorGeneratedCode } =
    input;

  let prompt: string;
  switch (action) {
    case "react":
      prompt = buildReactPrompt(screenSpec, stack, stylePack);
      break;
    case "html":
      prompt = buildHtmlPrompt(screenSpec, stylePack);
      break;
    case "describe":
      prompt = buildDescribePrompt(screenSpec);
      break;
    case "match-codebase":
      prompt = buildMatchCodebasePrompt(screenSpec, ctx, stack, stylePack);
      break;
  }

  if (priorGeneratedCode?.trim()) {
    prompt += `\n\nPrevious generated output (refine this while staying faithful to the screenshot unless the user asks to deviate):\n\`\`\`\n${priorGeneratedCode.trim()}\n\`\`\``;
  }

  if (input.refinementHistory?.length) {
    prompt += "\n\nPrior refinements:";
    for (const entry of input.refinementHistory) {
      prompt += `\n- ${entry.text}`;
    }
  }

  if (refinementFeedback?.trim()) {
    prompt += buildRefinementPrompt(refinementFeedback);
  }

  return prompt;
}

export function buildRefinementPrompt(refinementFeedback: string): string {
  return `\n\n---\n**Refinement request:** ${refinementFeedback.trim()}\nApply this refinement while preserving fidelity to the original screenshot unless explicitly asked to change layout or content substantially.`;
}

export function buildVerifierPrompt(
  spec: DesignScreenSpec,
  action: DesignToCodeAction,
  generatedCode: string,
): string {
  return [
    "You are a UI fidelity verifier. Compare generated code against the structured screen spec and screenshot.",
    `Action was: ${action}.`,
    "Return ONLY valid JSON: {\"ok\":boolean,\"severity\":\"none\"|\"minor\"|\"severe\",\"issues\":[\"string\"],\"repairHint\":\"string?\"}",
    "Check: missing major regions, wrong repeated element counts, major palette mismatch, hierarchy mismatch, severe layout divergence.",
    specSection(spec),
    `\n\nGenerated code:\n\`\`\`\n${generatedCode.slice(0, 12_000)}\n\`\`\``,
  ].join("\n");
}

export function buildRepairPrompt(
  originalPrompt: string,
  repairHint: string,
  issues: string[],
): string {
  return [
    originalPrompt,
    "\n\n---\n**Verifier repair pass (one attempt):**",
    issues.length ? `Issues: ${issues.join("; ")}` : "",
    repairHint,
    "Fix the generated output to address these issues while staying faithful to the screenshot.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Backward-compatible wrapper for legacy single-pass callers. */
export function buildDesignToCodePrompt(
  action: DesignToCodeAction,
  ctx: DesignToCodeContext,
  stack: DesignStack = "react-tsx",
  refinementFeedback?: string,
  screenSpec?: DesignScreenSpec,
  stylePack?: CodebaseStylePack,
): string {
  const spec =
    screenSpec
    ?? ({
      screenType: "ui-screen",
      confidence: 0.5,
      warnings: [],
      visibleRegions: [],
      layoutTree: "See screenshot.",
      components: [],
      repeatedPatterns: [],
      textContent: [],
      palette: [],
      typography: [],
      spacing: [],
      borders: [],
      shadows: [],
      interactionAffordances: [],
      estimatedResponsiveness: "unknown",
      uncertainAreas: [],
    } satisfies DesignScreenSpec);

  return buildGenerationPrompt({
    action,
    stack,
    screenSpec: spec,
    stylePack,
    ctx,
    refinementFeedback,
    refinementHistory: [],
  });
}

export const SHARED_VISION_PREAMBLE_FIRST_LINE =
  "The attached screenshot is the source of truth for layout, hierarchy, spacing, colors, visible copy, and interaction cues.";

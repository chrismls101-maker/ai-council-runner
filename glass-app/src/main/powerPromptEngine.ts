/**
 * Power Prompt Engine — builds the meta-prompt that instructs the IIVO API
 * to generate an expert-level, target-optimised prompt from a one-line intent.
 */

import type { PromptMode, PromptTarget } from "../shared/ipc.ts";

export type { PromptMode, PromptTarget };

export interface PromptGenContext {
  intent: string;
  target: PromptTarget;
  mode: PromptMode;
  workingContext?: string;
  activeApp?: string;
}

// ---------------------------------------------------------------------------
// Human-readable labels
// ---------------------------------------------------------------------------

const TARGET_LABELS: Record<PromptTarget, string> = {
  claude: "Claude (Anthropic)",
  gpt: "GPT-4 / ChatGPT",
  cursor: "Cursor AI (inline code editor)",
  v0: "v0 by Vercel (UI / component generator)",
  midjourney: "Midjourney (image generation)",
  agent: "AI Agent system prompt",
  general: "General AI (any model)",
};

const MODE_LABELS: Record<PromptMode, string> = {
  build: "Build / Create Code",
  debug: "Debug / Fix",
  explain: "Explain / Teach",
  create: "Create Content",
  research: "Research / Analyze",
  "design-agent": "Design an AI Agent",
  review: "Review / Audit",
};

// ---------------------------------------------------------------------------
// Target-specific format instructions
// ---------------------------------------------------------------------------

function getTargetFormatInstructions(target: PromptTarget): string {
  switch (target) {
    case "claude":
      return `FORMAT REQUIREMENTS — optimised for Claude:
• Use XML tags to delimit sections: <role>, <task>, <context>, <requirements>, <output_format>
• Ask Claude to "think step by step" before answering
• Specify output format precisely (length, structure, code language if applicable)
• Include explicit constraints and quality bar
• Claude responds well to clear, structured instructions with explicit expectations`;

    case "gpt":
      return `FORMAT REQUIREMENTS — optimised for GPT-4 / ChatGPT:
• Open with a strong "You are a [specific persona]" role statement (first sentence)
• Use numbered lists for multi-step tasks
• Be explicit about tone, audience, and expected output format
• Add a few-shot example if the task follows a repeatable pattern
• End with: "Think step by step." or "Let's approach this methodically."`;

    case "cursor":
      return `FORMAT REQUIREMENTS — optimised for Cursor AI (inline editor):
• Be direct and code-specific — no preamble or pleasantries
• Reference the exact file, function, or component type if context is available
• State: what currently exists → what needs to change → what the output should look like
• Name the language, framework, and any patterns that must be followed
• Short and precise — Cursor reads surrounding code too, so rely on specifics, not explanations`;

    case "v0":
      return `FORMAT REQUIREMENTS — optimised for v0 (Vercel):
• Lead with: "Build a [component type] that [does what]."
• Specify the stack: React / Next.js / Tailwind / shadcn/ui / etc.
• Describe interactive behavior: hover states, click handlers, animations
• Describe the visual style: colours, spacing, density, typography
• Close with constraints: "Responsive", "Dark mode", "Accessible (ARIA)"
• v0 excels with concrete, visual, component-level descriptions`;

    case "midjourney":
      return `FORMAT REQUIREMENTS — optimised for Midjourney:
• Structure: [subject], [medium / art style], [composition], [lighting], [mood / atmosphere], [technical params]
• Use specific, visual adjectives — abstract words produce generic images
• Reference artistic styles, photographers, art movements, or specific artists when helpful
• Close with params: --ar [ratio] --v 6.1 (or appropriate version / style)
• Aim for 40–80 descriptive words before the params
• Translate abstract intent into concrete visual elements`;

    case "agent":
      return `FORMAT REQUIREMENTS — AI Agent system prompt:
• Open with a crisp role definition: "You are a [role] responsible for [core purpose]."
• State the objective in one sentence
• List available tools or capabilities the agent has access to
• Provide numbered step-by-step operating instructions
• Define the output schema (format, required fields, examples)
• Include error handling: what to do when uncertain, when to stop, when to ask
• Close with hard rules the agent must never violate`;

    case "general":
      return `FORMAT REQUIREMENTS — general purpose (works across Claude, GPT, Gemini):
• Open with a clear role statement
• State the task precisely in one sentence
• Provide all relevant context (tech, audience, constraints)
• List requirements or success criteria
• Specify the output format: length, structure, tone
• Clear and structured — no model-specific syntax`;
  }
}

// ---------------------------------------------------------------------------
// Mode-specific structure instructions
// ---------------------------------------------------------------------------

function getModeStructureInstructions(mode: PromptMode): string {
  switch (mode) {
    case "build":
      return `STRUCTURE — Build mode:
The generated prompt must direct the AI to:
1. Take the role of an expert developer / engineer in the relevant stack
2. Receive the specific task (informed by intent + Glass context)
3. Consider the tech stack, existing patterns, and constraints visible from context
4. Produce complete, production-ready code — not a skeleton
5. Briefly explain key architectural decisions after the code
6. Think through the implementation before writing a single line`;

    case "debug":
      return `STRUCTURE — Debug mode:
The generated prompt must direct the AI to:
1. Take the role of an expert debugger / root-cause analyst
2. Receive the full error (message, stack trace, relevant code) from the user
3. Identify the root cause before suggesting any fix
4. Provide the exact fix with code — not a general suggestion
5. Output three things: (1) root cause, (2) the fix, (3) how to verify it worked`;

    case "explain":
      return `STRUCTURE — Explain mode:
The generated prompt must direct the AI to:
1. Take the role of a clear teacher / domain expert
2. Explain the specific subject identified in the intent
3. Target the appropriate audience level (infer from context — e.g. beginner or senior dev)
4. Use intuition first, mechanics second, concrete example third
5. Keep it dense but readable — no fluff, no condescension`;

    case "create":
      return `STRUCTURE — Create content mode:
The generated prompt must direct the AI to:
1. Take the role of an expert content creator in the relevant domain
2. Produce the specific content type named in the intent
3. Match the intended audience and tone
4. Follow any format, length, or structural requirements
5. Output the final content ready to use — not a draft or outline`;

    case "research":
      return `STRUCTURE — Research mode:
The generated prompt must direct the AI to:
1. Take the role of a rigorous research analyst / domain expert
2. Answer the specific question stated in the intent
3. Define scope: what to include and what is out of scope
4. Cite evidence or reasoning for each key finding
5. Output structured findings with a clear, actionable conclusion`;

    case "design-agent":
      return `STRUCTURE — Design Agent mode:
Generate a complete, production-ready system prompt for an AI agent. It must include:
1. Role definition — what the agent is and its exact purpose
2. Objective — the primary goal stated clearly
3. Tools — what the agent can use (even if hypothetical; user will adapt)
4. Operating process — numbered step-by-step instructions for how the agent runs
5. Output schema — the exact format / fields the agent returns
6. Error handling — what to do when stuck, uncertain, or when input is incomplete
7. Hard rules — inviolable constraints the agent must always respect`;

    case "review":
      return `STRUCTURE — Review mode:
The generated prompt must direct the AI to:
1. Take the role of a senior reviewer (engineer / designer / editor — match the context)
2. Receive the artifact to review (code / design / copy)
3. Apply the right criteria: bugs, security, performance, conventions, style
4. Output findings categorised by severity: Critical / Warning / Suggestion
5. Be direct, specific, and evidence-based — no generic praise or vague suggestions`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the meta-prompt sent to the IIVO API.
 * The API will respond with a complete, expert-level prompt ready to copy.
 */
export function buildMetaPrompt(ctx: PromptGenContext): string {
  const targetLabel = TARGET_LABELS[ctx.target];
  const modeLabel = MODE_LABELS[ctx.mode];

  const contextLines: string[] = [];
  if (ctx.activeApp) contextLines.push(`Active app: ${ctx.activeApp}`);
  if (ctx.workingContext) {
    contextLines.push(`What the user is working on right now: ${ctx.workingContext}`);
  }

  const contextSection =
    contextLines.length > 0
      ? `\nGLASS SCREEN CONTEXT (auto-detected — use this to make the output specific, not generic):\n${contextLines.join("\n")}\n`
      : "\n(No screen context available — generate a general but high-quality prompt.)\n";

  return `You are a world-class AI prompt engineer. Transform the user's one-sentence intent into a complete, expert-level prompt optimised for ${targetLabel}.

USER INTENT: "${ctx.intent}"
${contextSection}
TASK MODE: ${modeLabel}

${getTargetFormatInstructions(ctx.target)}

${getModeStructureInstructions(ctx.mode)}

ABSOLUTE RULES:
- Output ONLY the final prompt. No preamble. No "Here is your prompt:". No markdown wrapper.
- The prompt must be specific to the detected context above — name the actual app, stack, or project type if visible.
- The output must be paste-ready. Someone should be able to copy it and use it immediately with zero editing.
- Do NOT wrap the prompt in a code block or any other container.
- Every sentence must earn its place. No padding, no filler, no vague language.
- If the Glass context is empty or unhelpful, generate the best possible general version of the prompt.`;
}

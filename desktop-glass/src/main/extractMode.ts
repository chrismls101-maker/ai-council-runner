/**
 * Extract & Build Mode — AI prompt builders for the two-stage pipeline.
 *
 * Stage 1 (Haiku-class, debounced while transcript grows):
 *   Detect whether the accumulating transcript contains someone explaining
 *   how to build something. Returns a 4-6 word label or null.
 *
 * Stage 2 (Opus-class, runs once at the end):
 *   Take the full transcript and generate a grand master build prompt the
 *   user can paste straight into Cursor or Claude Code.
 */

// ── Stage 1: Detection prompt ─────────────────────────────────────────────────

export function buildDetectionPrompt(transcript: string): string {
  const trimmed = transcript.slice(-4000); // last ~4k chars is plenty for detection
  return [
    "You are analyzing a partial audio transcript to detect if the speaker is explaining how to build something specific — a product, tool, app, system, or technical implementation.",
    "",
    "Rules:",
    "- If you detect clear 'how to build X' content (architecture, tech stack, implementation steps, or specific product/service being built), respond with ONLY a 4-6 word label describing what is being built. Examples: 'AI agents for enterprise companies' | 'Stripe payment integration system' | 'real-time chat app with WebSockets'",
    "- If the transcript does NOT contain clear build-related content (it's general discussion, news, entertainment, theory, etc.), respond with exactly: null",
    "- Output nothing except the label or the word null. No punctuation, no quotes, no explanation.",
    "",
    `Transcript excerpt:`,
    `"""`,
    trimmed,
    `"""`,
  ].join("\n");
}

// ── Stage 2: Grand master prompt generation ───────────────────────────────────

export function buildGenerationPrompt(transcript: string, detectedLabel?: string): string {
  const labelContext = detectedLabel
    ? `The speaker appears to be explaining how to build: ${detectedLabel}\n\n`
    : "";

  return [
    "You are receiving a full transcript of someone explaining how to build something. Your job is to extract everything technically useful from what they said and produce a single, comprehensive build prompt that a developer can paste directly into an AI coding assistant (Cursor, Claude Code, etc.) to actually build it.",
    "",
    "What to extract:",
    "- What exactly is being built (be specific about the product/feature/system)",
    "- The full technical approach the speaker described",
    "- Tech stack, tools, libraries, APIs mentioned",
    "- Architecture decisions and the reasoning behind them",
    "- Specific implementation details, 'the sauce', insider tips they gave",
    "- Any step-by-step process or sequence they described",
    "- Business logic, edge cases, or constraints mentioned",
    "",
    "Output format — write ONE grand master build prompt with these sections:",
    "1. WHAT WE'RE BUILDING — a precise 2-3 sentence description",
    "2. TECH STACK — specific tools, libraries, APIs to use",
    "3. ARCHITECTURE — how it fits together, key design decisions",
    "4. IMPLEMENTATION — step-by-step build instructions incorporating everything the speaker said",
    "5. KEY DETAILS — any specific 'sauce' or insights from the speaker that make this different",
    "",
    "Write the prompt in second person as instructions to an AI coding assistant. Be specific and opinionated — use exactly what the speaker said, not generic alternatives. This should be immediately actionable.",
    "",
    labelContext +
    `Full transcript:`,
    `"""`,
    transcript,
    `"""`,
  ].join("\n");
}

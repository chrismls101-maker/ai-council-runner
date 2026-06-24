import type { HydratedContext } from "../shared/glassMemory.ts";

export function buildSystemPrompt(basePrompt: string, context: HydratedContext): string {
  const memoryBlock = [
    context.userProfile ? `## What I know about you\n${context.userProfile}` : "",
    context.relevantMemories
      ? `## Relevant context from past sessions\n${context.relevantMemories}`
      : "",
  ].filter(Boolean).join("\n\n");

  if (!memoryBlock) return basePrompt;

  return `${basePrompt}\n\n${memoryBlock}\n\n---\nThe above context is from your local memory and is private to your device.`;
}

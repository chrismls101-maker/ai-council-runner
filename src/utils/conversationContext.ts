import type { AgentOutputs, ConversationTurn } from "../types";

export interface ConversationContextPayload {
  previousUserPrompt?: string;
  previousAssistantAnswer?: string;
}

function answerTextFromOutputs(outputs: AgentOutputs): string {
  return outputs.finalJudge || outputs.strategy || "";
}

function contextFromTurn(turn: ConversationTurn): ConversationContextPayload | undefined {
  if (!turn.userPrompt?.trim()) return undefined;
  const previousAnswer = answerTextFromOutputs(turn.outputs).trim();
  if (!previousAnswer) return undefined;
  return {
    previousUserPrompt: turn.userPrompt.trim(),
    previousAssistantAnswer: previousAnswer,
  };
}

/**
 * Builds follow-up context for the next API request.
 * Prefers the most recent turn that has a completed assistant answer.
 */
export function buildConversationContextForApi(
  completedTurns: ConversationTurn[],
  activeUserPrompt: string | null,
  activeOutputs: AgentOutputs,
): ConversationContextPayload | undefined {
  const activeAnswer = answerTextFromOutputs(activeOutputs).trim();
  if (activeUserPrompt?.trim() && activeAnswer) {
    return {
      previousUserPrompt: activeUserPrompt.trim(),
      previousAssistantAnswer: activeAnswer,
    };
  }

  for (let i = completedTurns.length - 1; i >= 0; i -= 1) {
    const fromTurn = contextFromTurn(completedTurns[i]!);
    if (fromTurn) return fromTurn;
  }

  if (activeUserPrompt?.trim()) {
    return undefined;
  }

  return undefined;
}

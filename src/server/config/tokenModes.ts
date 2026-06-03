import type { AgentId } from "../types/index.js";

export type TokenMode = "small" | "standard" | "deep";

export const DEFAULT_TOKEN_MODE: TokenMode = "small";

export const TOKEN_MODE_LABELS: Record<TokenMode, string> = {
  small: "Small",
  standard: "Standard",
  deep: "Deep",
};

export const TOKEN_MODE_LIMITS: Record<
  TokenMode,
  Record<AgentId, number>
> = {
  small: {
    strategy: 800,
    critic: 600,
    research: 1000,
    salesWriter: 1000,
    finalJudge: 1200,
  },
  standard: {
    strategy: 1200,
    critic: 1000,
    research: 2500,
    salesWriter: 2500,
    finalJudge: 3000,
  },
  deep: {
    strategy: 1500,
    critic: 1200,
    research: 3500,
    salesWriter: 3500,
    finalJudge: 4000,
  },
};

export function normalizeTokenMode(value: unknown): TokenMode {
  if (value === "standard" || value === "deep" || value === "small") {
    return value;
  }
  return DEFAULT_TOKEN_MODE;
}

export function getMaxOutputTokens(
  agentId: AgentId,
  tokenMode: TokenMode,
): number {
  return TOKEN_MODE_LIMITS[tokenMode][agentId];
}

export function logConfiguredTokenModes(): void {
  console.log("Token mode defaults:");
  for (const mode of Object.keys(TOKEN_MODE_LIMITS) as TokenMode[]) {
    const limits = TOKEN_MODE_LIMITS[mode];
    const summary = Object.entries(limits)
      .map(([agent, tokens]) => `${agent}=${tokens}`)
      .join(", ");
    console.log(`  ${mode}: ${summary}`);
  }
}

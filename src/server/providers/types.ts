export interface ProviderUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageAvailable: boolean;
}

export interface ResearchAgentMeta {
  mode: string;
  provider: string;
  searchRequestCount?: number;
  searchRequestFeeUsd?: number;
}

export interface ProviderResult {
  content: string;
  provider: string;
  model: string;
  usage: ProviderUsage;
  citations?: string[];
  researchMeta?: ResearchAgentMeta;
}

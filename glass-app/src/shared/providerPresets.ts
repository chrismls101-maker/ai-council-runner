/** Named provider shortcuts for custom OpenAI-compatible endpoints. */

export const PROVIDER_BASE_URL_SHORTCUTS: Record<string, string> = {
  Groq: "https://api.groq.com/openai/v1",
  "Together AI": "https://api.together.xyz/v1",
  Mistral: "https://api.mistral.ai/v1",
  xAI: "https://api.x.ai/v1",
};

export const PROVIDER_SHORTCUT_NAMES = Object.keys(PROVIDER_BASE_URL_SHORTCUTS);

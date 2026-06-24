import type { ApiKeyMeta } from "../shared/ipc.ts";

export const GLASS_ANTHROPIC_KEY_ID = "key_anthropic_glass";

export const GLASS_ANTHROPIC_KEY_META: ApiKeyMeta = {
  id: GLASS_ANTHROPIC_KEY_ID,
  service: "anthropic",
  label: "Anthropic (Glass)",
  environment: "any",
  createdAt: Date.now(),
  lastUsedAt: null,
};

export const GLASS_OPENAI_KEY_ID = "key_openai_glass";

export const GLASS_OPENAI_KEY_META: ApiKeyMeta = {
  id: GLASS_OPENAI_KEY_ID,
  service: "openai",
  label: "OpenAI (Glass)",
  environment: "any",
  createdAt: Date.now(),
  lastUsedAt: null,
};

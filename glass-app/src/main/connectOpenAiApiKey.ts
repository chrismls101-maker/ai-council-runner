/**
 * Validate and persist OpenAI API keys (main process only).
 */

import { isApiKeyEncryptionAvailable, saveApiKey } from "./apiKeyStore.ts";
import { validateOpenAiApiKeyLive } from "./openaiKeyValidation.ts";
import { GLASS_OPENAI_KEY_META } from "../shared/glassProviderKeys.ts";
import type { ActivationConnectResponse } from "../shared/ipc.ts";

export async function connectOpenAiApiKey(rawKey: unknown): Promise<ActivationConnectResponse> {
  if (!isApiKeyEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage is unavailable on this system — cannot save API keys.",
    };
  }
  if (typeof rawKey !== "string" || !rawKey.trim()) {
    return { ok: false, error: "Enter your OpenAI API key." };
  }
  const validation = await validateOpenAiApiKeyLive(rawKey);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  try {
    saveApiKey({ ...GLASS_OPENAI_KEY_META, createdAt: Date.now() }, rawKey.trim());
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not store key.";
    return { ok: false, error: message };
  }
}

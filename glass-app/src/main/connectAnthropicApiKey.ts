/**
 * Validate and persist Anthropic API keys (main process only).
 */

import { validateAnthropicApiKeyLive } from "./anthropicKeyValidation.ts";
import { saveAnthropicApiKey } from "./anthropicKeyStore.ts";
import { notifyMemoryServicesReady } from "./glassMemoryEngine.ts";
import { isApiKeyEncryptionAvailable } from "./apiKeyStore.ts";
import type { ActivationConnectResponse } from "../shared/ipc.ts";

export async function connectAnthropicApiKey(rawKey: unknown): Promise<ActivationConnectResponse> {
  if (!isApiKeyEncryptionAvailable()) {
    return {
      ok: false,
      error: "Secure storage is unavailable on this system — cannot save API keys.",
    };
  }
  if (typeof rawKey !== "string" || !rawKey.trim()) {
    return { ok: false, error: "Enter your Anthropic API key." };
  }
  const validation = await validateAnthropicApiKeyLive(rawKey);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  try {
    saveAnthropicApiKey(rawKey.trim());
    void notifyMemoryServicesReady().catch((err) => {
      console.warn("[memory] post-key notifyMemoryServicesReady failed:", err);
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not store key.";
    return { ok: false, error: message };
  }
}

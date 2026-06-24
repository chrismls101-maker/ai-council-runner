/**
 * Anthropic API key — macOS Keychain via Electron safeStorage (api-keys.json).
 *
 * Priority: encrypted key store → ANTHROPIC_API_KEY env (dev migration only).
 * Railway IIVO_GLASS_API_SECRET is NOT used for inference.
 */

import {
  GLASS_ANTHROPIC_KEY_ID,
  GLASS_ANTHROPIC_KEY_META,
} from "../shared/glassProviderKeys.ts";
import {
  deleteApiKey,
  getApiKeyValue,
  isApiKeyEncryptionAvailable,
  listApiKeys,
  saveApiKey,
} from "./apiKeyStore.ts";

export { GLASS_ANTHROPIC_KEY_ID, GLASS_ANTHROPIC_KEY_META } from "../shared/glassProviderKeys.ts";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DIAGNOSTIC_ANTHROPIC_MODEL = "claude-opus-4-8";

export function resolveAnthropicApiKey(): string | null {
  const dedicated = getApiKeyValue(GLASS_ANTHROPIC_KEY_ID);
  if (dedicated) return dedicated;

  for (const meta of listApiKeys()) {
    const svc = meta.service.toLowerCase();
    const lbl = (meta.label ?? "").toLowerCase();
    if (svc.includes("anthropic") || lbl.includes("anthropic")) {
      const value = getApiKeyValue(meta.id);
      if (value) return value;
    }
  }

  return process.env.ANTHROPIC_API_KEY?.trim() ?? null;
}

export function hasStoredAnthropicKey(): boolean {
  if (getApiKeyValue(GLASS_ANTHROPIC_KEY_ID)) return true;
  return listApiKeys().some((meta) => {
    const svc = meta.service.toLowerCase();
    return svc.includes("anthropic") && Boolean(getApiKeyValue(meta.id));
  });
}

/**
 * One-time migration: persist ANTHROPIC_API_KEY from .env into Keychain.
 * Returns true when a new key was written.
 */
export function migrateAnthropicKeyFromEnv(): boolean {
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!envKey || !isApiKeyEncryptionAvailable()) return false;
  if (hasStoredAnthropicKey()) return false;

  saveApiKey(
    { ...GLASS_ANTHROPIC_KEY_META, createdAt: Date.now() },
    envKey,
  );
  console.log("[anthropicKeyStore] Migrated ANTHROPIC_API_KEY from env into safeStorage");
  return true;
}

export function saveAnthropicApiKey(value: string): void {
  saveApiKey(
    { ...GLASS_ANTHROPIC_KEY_META, createdAt: Date.now() },
    value,
  );
}

export function clearAnthropicApiKey(): void {
  deleteApiKey(GLASS_ANTHROPIC_KEY_ID);
}

export function resolveGlassAnthropicModel(
  purpose: "default" | "semantic" | "diagnostic" = "default",
): string {
  if (purpose === "diagnostic") {
    return process.env.IIVO_GLASS_ANTHROPIC_DIAGNOSTIC_MODEL?.trim()
      || DIAGNOSTIC_ANTHROPIC_MODEL;
  }
  return process.env.IIVO_GLASS_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function anthropicKeyStatus(): {
  available: boolean;
  encryptionAvailable: boolean;
  source: "keychain" | "env" | "none";
} {
  if (hasStoredAnthropicKey()) {
    return {
      available: true,
      encryptionAvailable: isApiKeyEncryptionAvailable(),
      source: "keychain",
    };
  }
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) {
    return {
      available: true,
      encryptionAvailable: isApiKeyEncryptionAvailable(),
      source: "env",
    };
  }
  return {
    available: false,
    encryptionAvailable: isApiKeyEncryptionAvailable(),
    source: "none",
  };
}

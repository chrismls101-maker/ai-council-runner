/**
 * API Key Store — safeStorage-backed persistence for the Builder Strip key manager.
 *
 * Metadata (service, label, env, dates) lives in a plain JSON file in userData.
 * The key VALUE is encrypted via Electron's safeStorage (OS keychain / DPAPI)
 * and stored as a base64 string alongside the metadata. This means keys are
 * never written in plaintext to disk.
 */

import { app, safeStorage } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { ApiKeyMeta } from "../shared/ipc.ts";
import {
  normalizeApiKeyId,
  normalizeApiKeyMeta,
  normalizeApiKeyValue,
} from "../shared/apiKeyValidation.ts";
import { maskApiKeyDisplay } from "../shared/maskApiKey.ts";

// ---------------------------------------------------------------------------
// Internal stored shape (metadata + encrypted value)
// ---------------------------------------------------------------------------

interface StoredApiKey extends ApiKeyMeta {
  /** safeStorage.encryptString result, stored as base64. */
  encryptedValue: string;
}

// ---------------------------------------------------------------------------
// Store path
// ---------------------------------------------------------------------------

function storePath(): string {
  return join(app.getPath("userData"), "api-keys.json");
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

function readStore(): StoredApiKey[] {
  try {
    const p = storePath();
    if (!existsSync(p)) return [];
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredApiKey[]) : [];
  } catch {
    return [];
  }
}

function writeStore(keys: StoredApiKey[]): void {
  writeFileSync(storePath(), JSON.stringify(keys, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isApiKeyEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Returns all key metadata — no values. */
export function listApiKeys(): ApiKeyMeta[] {
  return readStore().map(({ encryptedValue: _ev, ...meta }) => meta);
}

/**
 * Returns the decrypted value for a key, or null if not found / decryption
 * fails (e.g. different machine / OS user).
 */
export function getApiKeyValue(id: string): string | null {
  const normalizedId = normalizeApiKeyId(id);
  if (!normalizedId || !safeStorage.isEncryptionAvailable()) return null;
  const entry = readStore().find((k) => k.id === normalizedId);
  if (!entry) return null;
  try {
    const buf = Buffer.from(entry.encryptedValue, "base64");
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

/**
 * Create or update a key. The provided `value` is encrypted before writing.
 * If a key with the same id already exists it is replaced in-place;
 * otherwise it is appended.
 */
export function saveApiKey(meta: ApiKeyMeta, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage is not available on this system");
  }
  const normalizedMeta = normalizeApiKeyMeta(meta);
  if (!normalizedMeta) {
    throw new Error("Invalid key metadata");
  }
  const normalizedValue = normalizeApiKeyValue(value);
  if (!normalizedValue) {
    throw new Error("API key value is required");
  }
  const encBuf = safeStorage.encryptString(normalizedValue);
  const encryptedValue = encBuf.toString("base64");
  const stored: StoredApiKey = { ...normalizedMeta, encryptedValue };

  const keys = readStore();
  const idx = keys.findIndex((k) => k.id === meta.id);
  if (idx >= 0) {
    keys[idx] = stored;
  } else {
    keys.push(stored);
  }
  writeStore(keys);
}

/** Returns a masked display string — never the raw key. */
export function getApiKeyMaskedDisplay(id: string): string | null {
  const value = getApiKeyValue(id);
  if (!value) return null;
  return maskApiKeyDisplay(value);
}

/** Delete a key by id. No-op if not found. */
export function deleteApiKey(id: string): void {
  const normalizedId = normalizeApiKeyId(id);
  if (!normalizedId) return;
  const keys = readStore().filter((k) => k.id !== normalizedId);
  writeStore(keys);
}

/**
 * Update lastUsedAt for a key (called when the user copies a value).
 * Silent no-op if the key doesn't exist.
 */
export function touchApiKey(id: string): void {
  const normalizedId = normalizeApiKeyId(id);
  if (!normalizedId) return;
  const keys = readStore();
  const entry = keys.find((k) => k.id === normalizedId);
  if (!entry) return;
  entry.lastUsedAt = Date.now();
  writeStore(keys);
}

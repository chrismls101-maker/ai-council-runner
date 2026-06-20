import type { ApiKeyMeta } from "./ipc.ts";

const MAX_SERVICE_LEN = 64;
const MAX_LABEL_LEN = 128;
const MAX_ID_LEN = 128;
const MAX_VALUE_LEN = 8192;
const ID_PATTERN = /^key_[a-zA-Z0-9_]+$/;

export function normalizeApiKeyId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_ID_LEN) return null;
  if (!ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function normalizeApiKeyMeta(meta: unknown): ApiKeyMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Partial<ApiKeyMeta>;
  const id = normalizeApiKeyId(m.id);
  if (!id) return null;

  const service =
    typeof m.service === "string" ? m.service.trim().slice(0, MAX_SERVICE_LEN) : "";
  if (!service) return null;

  const label =
    typeof m.label === "string" ? m.label.trim().slice(0, MAX_LABEL_LEN) : "";

  const environment =
    m.environment === "dev" || m.environment === "prod" || m.environment === "any"
      ? m.environment
      : "any";

  const createdAt =
    typeof m.createdAt === "number" && Number.isFinite(m.createdAt)
      ? m.createdAt
      : Date.now();

  const lastUsedAt =
    m.lastUsedAt === null ||
    (typeof m.lastUsedAt === "number" && Number.isFinite(m.lastUsedAt))
      ? (m.lastUsedAt ?? null)
      : null;

  return { id, service, label, environment, createdAt, lastUsedAt };
}

export function normalizeApiKeyValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_VALUE_LEN) return null;
  return trimmed;
}

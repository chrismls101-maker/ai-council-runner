/**
 * Redact API keys and bearer tokens from strings (shared by main, renderer, Sentry).
 */

const SK_ANT_PATTERN = /sk-ant-[a-zA-Z0-9\-_]{10,}/g;
const SK_OPENAI_PATTERN = /sk-[A-Za-z0-9\-_]{20,}/g;
const BEARER_PATTERN = /Authorization:\s*Bearer\s+\S+/gi;
const LONG_HEX_PATTERN = /\b[0-9a-f]{40,}\b/gi;

export function sanitizeLogText(text: string): string {
  return text
    .replace(SK_ANT_PATTERN, "sk-ant-[REDACTED]")
    .replace(SK_OPENAI_PATTERN, "[REDACTED]")
    .replace(BEARER_PATTERN, "Authorization: Bearer [REDACTED]")
    .replace(LONG_HEX_PATTERN, "[REDACTED]");
}

/** Also redact known env secret values (main process). */
export function sanitizeLogTextWithEnvSecrets(text: string): string {
  let out = sanitizeLogText(text);
  const secrets = [
    process.env.IIVO_GLASS_API_SECRET,
    process.env.DEEPGRAM_API_KEY,
    process.env.IIVO_GLASS_OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.SENTRY_DSN,
  ].filter((v): v is string => typeof v === "string" && v.length > 8);

  for (const secret of secrets) {
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
  }
  return out;
}

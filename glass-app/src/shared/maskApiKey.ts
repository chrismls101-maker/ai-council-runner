/**
 * Mask stored API keys for display — never show full decrypted values in UI.
 */

export function maskApiKeyDisplay(value: string, visiblePrefix = 7, visibleSuffix = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return "••••••••";
  if (trimmed.length <= visiblePrefix + visibleSuffix) {
    return "••••••••";
  }
  const prefix = trimmed.slice(0, visiblePrefix);
  const suffix = trimmed.slice(-visibleSuffix);
  return `${prefix}••••••••${suffix}`;
}

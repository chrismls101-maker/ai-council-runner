/** Anthropic secret key shape — shared by activation UI and main validation. */
export const ANTHROPIC_KEY_FORMAT = /^sk-ant-[a-zA-Z0-9\-_]{90,}$/;

export function isAnthropicKeyFormatValid(key: string): boolean {
  return ANTHROPIC_KEY_FORMAT.test(key.trim());
}

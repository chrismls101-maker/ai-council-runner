/** OpenAI secret key shape. */
export const OPENAI_KEY_FORMAT = /^sk-[A-Za-z0-9\-_]{20,}$/;

export function isOpenAiKeyFormatValid(key: string): boolean {
  return OPENAI_KEY_FORMAT.test(key.trim());
}

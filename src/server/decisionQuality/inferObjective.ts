/** Infer a decision objective from the user prompt when none was provided. */
export function inferDecisionObjective(prompt: string): string {
  const text = prompt.trim();
  if (!text) return "";

  const firstLine = text.split(/\n/)[0]?.trim() ?? text;
  const cleaned = firstLine.replace(/\s+/g, " ");

  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117)}…`;
}

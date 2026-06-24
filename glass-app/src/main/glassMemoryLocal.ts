/**
 * Local fallbacks for memory when cloud extraction is unavailable.
 */

export function buildLocalSessionSummary(transcript: string): string {
  const trimmed = transcript.trim();
  if (!trimmed) return "";

  const lines = trimmed.split("\n");
  const userLines: string[] = [];
  const assistantLines: string[] = [];

  for (const line of lines) {
    const userMatch = /^user:\s*(.*)$/i.exec(line);
    if (userMatch?.[1]?.trim()) {
      userLines.push(userMatch[1].trim());
      continue;
    }
    const roleMatch = /^(assistant|strategy|critic|judge|research|writing|coder|code):\s*(.*)$/i.exec(line);
    if (roleMatch?.[2]?.trim()) {
      assistantLines.push(roleMatch[2].trim());
    }
  }

  const firstUser = userLines[0] ?? "";
  const lastUser = userLines[userLines.length - 1] ?? firstUser;
  const lastAssistant = assistantLines[assistantLines.length - 1] ?? "";

  if (lastUser && lastAssistant) {
    return `Session about: ${clip(lastUser, 220)}. Result: ${clip(lastAssistant, 420)}`;
  }
  if (lastUser) {
    return `Session about: ${clip(lastUser, 320)}`;
  }

  return clip(trimmed.replace(/\s+/g, " "), 500);
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

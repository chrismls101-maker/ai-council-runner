/**
 * Glass IDE composer — @-file mention parsing (pure).
 */

const MENTION_RE = /@([^\s@]+)/g;

/** Extract @-mention path tokens from a composer prompt. */
export function parseComposerMentions(prompt: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const match of prompt.matchAll(MENTION_RE)) {
    const raw = match[1]?.trim().replace(/\\/g, "/");
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    mentions.push(raw);
  }
  return mentions;
}

/** Resolve mention tokens against project file paths (fuzzy suffix match). */
export function resolveComposerMentions(
  mentions: string[],
  projectPaths: string[],
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const mention of mentions) {
    const needle = mention.replace(/^\.\//, "").toLowerCase();
    const exact = projectPaths.find((p) => p.toLowerCase() === needle);
    if (exact && !seen.has(exact)) {
      seen.add(exact);
      resolved.push(exact);
      continue;
    }
    const suffixMatches = projectPaths.filter((p) => (
      p.toLowerCase() === needle
      || p.toLowerCase().endsWith(`/${needle}`)
    ));
    suffixMatches.sort((a, b) => a.split("/").length - b.split("/").length);
    const best = suffixMatches[0];
    if (best && !seen.has(best)) {
      seen.add(best);
      resolved.push(best);
    }
  }

  return resolved;
}

export function filterComposerMentionCandidates(
  query: string,
  projectPaths: string[],
  limit = 12,
): string[] {
  const q = query.trim().replace(/^\.\//, "").toLowerCase();
  if (!q) {
    return projectPaths.slice(0, limit);
  }
  const scored = projectPaths
    .map((p) => {
      const lower = p.toLowerCase();
      const base = lower.split("/").pop() ?? lower;
      let score = 0;
      if (lower === q) score = 100;
      else if (lower.endsWith(`/${q}`)) score = 80;
      else if (base === q) score = 70;
      else if (lower.includes(q)) score = 50;
      else if (base.includes(q)) score = 40;
      return { p, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.p.localeCompare(b.p));
  return scored.slice(0, limit).map((row) => row.p);
}

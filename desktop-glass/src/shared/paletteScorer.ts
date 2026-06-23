/**
 * Glass Command Palette — fuzzy search + context scoring (Task #66).
 * No Electron or React imports — safe for src/shared/.
 */

import type {
  PaletteItem,
  PaletteQuery,
  PaletteSection,
  PaletteContextTag,
  GlassCommandItem,
  TerminalHistoryItem,
} from "./paletteTypes.ts";

/**
 * Simple character-subsequence fuzzy match. Returns a score in [0, 1].
 *   - exact prefix match            → 1.0
 *   - full substring (not prefix)   → 0.85
 *   - all chars as subsequence      → 0.4 .. 0.8 (rewards consecutive runs)
 *   - not all chars present         → 0
 * Empty query → 0 (callers treat empty query specially).
 */
export function fuzzyMatch(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (!t) return 0;

  if (t.startsWith(q)) return 1.0;
  const idx = t.indexOf(q);
  if (idx >= 0) {
    // Full substring match — strong but below a prefix match.
    // Slightly favour earlier matches.
    return 0.85 - Math.min(idx, 20) * 0.005;
  }

  // Subsequence scan — every query char must appear in order.
  let ti = 0;
  let matched = 0;
  let consecutive = 0;
  let bestRun = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        matched++;
        consecutive++;
        if (consecutive > bestRun) bestRun = consecutive;
        ti++;
        found = true;
        break;
      }
      consecutive = 0;
      ti++;
    }
    if (!found) return 0; // a query char could not be placed → no match
  }
  if (matched < q.length) return 0;

  // Base 0.4 for a complete subsequence, plus up to ~0.4 for long consecutive runs.
  const runBonus = Math.min(0.4, (bestRun / q.length) * 0.4);
  return Math.min(0.8, 0.4 + runBonus);
}

/** True when the item's context tags include the given tag. */
function hasTag(item: PaletteItem, tag: PaletteContextTag): boolean {
  if (item.type === "command") {
    return (item as GlassCommandItem).contextTags.includes(tag);
  }
  if (item.type === "quick-action") {
    return item.triggerSignal === tag;
  }
  return false;
}

/** Which context tags are currently "active" given the live signals. */
function activeContextTags(query: PaletteQuery): PaletteContextTag[] {
  const tags: PaletteContextTag[] = [];
  const ctx = query.context;
  if (ctx.terminalOpen) tags.push("terminal");
  if (ctx.lastTerminalBlock?.status === "error") tags.push("terminal-error");
  if (ctx.lastTerminalBlock?.status === "success") tags.push("terminal-success");
  if (ctx.clipboardText && ctx.clipboardText.length > 0) tags.push("has-clipboard");
  if (ctx.extractModeActive) tags.push("extract-active");
  if (ctx.hasLastResult) tags.push("has-last-result");
  return tags;
}

const TERMINAL_RECENCY_WINDOW_MS = 1000 * 60 * 30; // 30 min decay window

export function scoreItem(item: PaletteItem, query: PaletteQuery): number {
  const q = query.query.trim();
  const activeTags = activeContextTags(query);

  // ── Empty query: surface always-top + context-relevant items ──────────────
  if (!q) {
    if (hasTag(item, "always-top")) return 1.0;
    // Items whose context tag is currently active stay visible & ranked high.
    let base = 0.5;
    if (item.type === "command") {
      const cmd = item as GlassCommandItem;
      const matchesContext = cmd.contextTags.some((t) => activeTags.includes(t));
      if (!matchesContext && cmd.contextTags.length > 0) {
        // Has context requirements that aren't met → keep low but visible.
        base = 0.15;
      } else if (matchesContext) {
        base = 0.7;
      }
    }
    base += useCountBoost(item);
    base += recencyBoost(item);
    return base;
  }

  // ── Non-empty query: fuzzy match across title/subtitle/keywords ───────────
  let best = fuzzyMatch(item.title, q);
  if (item.subtitle) best = Math.max(best, fuzzyMatch(item.subtitle, q) * 0.9);
  if (item.type === "command") {
    for (const kw of (item as GlassCommandItem).keywords) {
      best = Math.max(best, fuzzyMatch(kw, q) * 0.85);
    }
  }
  if (item.type === "terminal-history" || item.type === "scrollback-result") {
    best = Math.max(best, fuzzyMatch((item as TerminalHistoryItem).command, q) * 0.95);
  }
  if (item.type === "api-key") {
    best = Math.max(best, fuzzyMatch(item.title, q));
  }

  if (best <= 0) return 0;

  // ── Boosts ────────────────────────────────────────────────────────────────
  let score = best;
  for (const tag of activeTags) {
    if (hasTag(item, tag)) score += 0.3;
  }
  score += recencyBoost(item);
  score += useCountBoost(item);

  return score;
}

/** Recency boost for terminal-history items (decays over 30 min), capped at +0.2. */
function recencyBoost(item: PaletteItem): number {
  if (item.type !== "terminal-history") return 0;
  const hist = item as TerminalHistoryItem;
  const age = Date.now() - hist.finishedAt;
  if (age < 0) return 0.2;
  if (age >= TERMINAL_RECENCY_WINDOW_MS) return 0;
  return 0.2 * (1 - age / TERMINAL_RECENCY_WINDOW_MS);
}

/** useCount boost for command items (log scale), capped at +0.2. */
function useCountBoost(item: PaletteItem): number {
  if (item.type !== "command") return 0;
  const count = (item as GlassCommandItem).useCount;
  if (!count || count <= 0) return 0;
  return Math.min(0.2, Math.log10(count + 1) * 0.1);
}

/**
 * Score every item in every section, drop zero-score items (unless the query
 * is empty), sort each section by score desc, and omit empty sections.
 */
export function buildSections(
  rawSections: PaletteSection[],
  query: PaletteQuery,
): PaletteSection[] {
  const emptyQuery = query.query.trim().length === 0;

  const built: PaletteSection[] = [];
  for (const section of rawSections) {
    const scored: PaletteItem[] = [];
    for (const item of section.items) {
      const score = scoreItem(item, query);
      if (!emptyQuery && score <= 0) continue;
      if (emptyQuery && score <= 0) continue;
      scored.push({ ...item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;
    built.push({ ...section, items: scored });
  }

  built.sort((a, b) => a.order - b.order);
  return built;
}

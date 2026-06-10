/**
 * Speaker name extraction — resolves [S0]/[S1] diarization tags to real names.
 *
 * Scans a rolling transcript for introduction patterns common in podcasts,
 * interviews, courses, and webinars. Zero API calls — pure string matching.
 *
 * Call `extractSpeakerNames(transcript)` incrementally as new chunks arrive.
 * Once a speaker's name is resolved it stays resolved (names don't change).
 *
 * Returns a map like { "0": "Lex", "1": "Sam Altman" }.
 * When a speaker is unnamed, their key is absent from the map.
 */

// ─── Non-name words to reject (prevent false positives) ──────────────────────

const STOPWORDS = new Set([
  // Articles / prepositions
  "the", "a", "an", "in", "on", "up", "down", "out", "over", "at", "by", "for",
  // Common filler openers
  "hi", "hey", "hello", "thanks", "thank", "so", "well", "just", "right", "okay",
  "ok", "yes", "no", "sure", "now", "also", "too", "not", "very", "really",
  "good", "great", "nice", "glad", "happy", "excited", "honored", "thrilled",
  "awesome", "perfect", "absolutely", "definitely", "exactly",
  // Pronouns / groups
  "everyone", "everybody", "anyone", "somebody", "nobody",
  "you", "your", "we", "our", "us", "they", "them",
  // Time words
  "today", "tomorrow", "tonight", "yesterday", "here", "back", "there",
  // Verbs that slip through
  "going", "listening", "watching", "talking", "speaking", "saying", "thinking",
  "ready", "welcome", "coming", "joining", "looking", "working", "doing",
  // Other common non-names
  "this", "that", "these", "those", "what", "when", "where", "how",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if this looks like a real personal name (or short full name).
 * Accepts: "Lex", "Sam Altman", "Joe Rogan", "Tim", "Andrew"
 * Rejects:  common words, lowercase, numbers, too-long phrases.
 */
function looksLikeName(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 2 || s.length > 40) return false;
  // Must start with an uppercase letter.
  if (!/^[A-Z]/.test(s)) return false;
  // Must be word characters only (letters, spaces, hyphens, apostrophes).
  if (!/^[A-Za-z][A-Za-z\s\-'.]*$/.test(s)) return false;
  // Reject stop words (first word of the extracted name).
  const firstWord = s.split(/\s+/)[0]!.toLowerCase();
  if (STOPWORDS.has(firstWord)) return false;
  return true;
}

/**
 * Extract a speaker index from a `[Sx]` prefix, e.g. "[S1] Hi" → 1.
 * Returns undefined if no tag is present (single-speaker transcript).
 */
function speakerFromPrefix(line: string): { speakerId: number | undefined; text: string } {
  const m = line.match(/^\[S(\d+)\]\s*(.*)/s);
  if (!m) return { speakerId: undefined, text: line };
  return { speakerId: parseInt(m[1]!, 10), text: m[2]! };
}

// ─── Pattern extractors ───────────────────────────────────────────────────────

// Each returns a name string if matched, undefined otherwise.
// `speaker` is the text already stripped of the [Sx] prefix.

// Name capture group: 1 or 2 capitalized words only — "Lex" or "Sam Altman", not phrases.
const NAME_PAT = `([A-Z][a-z]{1,18}(?:\\s[A-Z][a-z]{1,18})?)`;

const SELF_INTRO_PATTERNS: RegExp[] = [
  // "I'm [Name]" / "I am [Name]" — stop at comma, period, "and", "from", "here"
  new RegExp(`\\bI'?m\\s+${NAME_PAT}(?=[,. !?]|$|\\s+and\\b|\\s+from\\b|\\s+here\\b)`),
  // "My name is [Name]"
  new RegExp(`\\bMy name(?:'s| is)\\s+${NAME_PAT}(?=[,. !?]|$)`),
  // "This is [Name]" (self-intro, e.g. "This is Tim Ferriss")
  new RegExp(`\\bThis is ${NAME_PAT}(?=[,. !?]|$|\\s+and\\b|\\s+from\\b)`),
  // "your host [Name]" / "host, [Name]"
  new RegExp(`\\bhost[,\\s]+${NAME_PAT}(?=[,. !?]|$)`),
];

const GUEST_INTRO_PATTERNS: RegExp[] = [
  // "joining me/us/today is [Name]"
  new RegExp(`\\bjoining (?:me|us|today)(?: is|,)?\\s+${NAME_PAT}(?=[,. !?]|$)`, "i"),
  // "my guest today is [Name]" / "today's guest is [Name]"
  new RegExp(`\\bguest(?:\\s+today)? is\\s+${NAME_PAT}(?=[,. !?]|$)`, "i"),
  // "joined by [Name]"
  new RegExp(`\\bjoined by\\s+${NAME_PAT}(?=[,. !?]|$)`, "i"),
  // "please welcome [Name]"
  new RegExp(`\\bplease welcome\\s+${NAME_PAT}(?=[,. !?]|\\s+to\\b|$)`, "i"),
  // "[Name] is here today / on the show / with us"
  new RegExp(`\\b${NAME_PAT} is (?:here|on the show|with us)(?:\\s+today)?(?=[,. !?]|$)`),
];

// Addressed-by-name: speaker X says "Lex," or "Thanks Lex" → resolves the OTHER speaker.
// Very conservative — single capitalized word only, explicit filler guard.
const ADDRESS_PATTERNS: RegExp[] = [
  // "So [Name]," / "Well [Name]," / "Now [Name],"
  /^(?:So|Well|And|Now|Okay|Right|Yeah),?\s+([A-Z][a-z]{2,18}),\s+/,
  // "Thanks [Name]" / "Thank you [Name]"
  /\bThanks?\s+(?:you\s+)?([A-Z][a-z]{2,18})(?=[,. !?]|$)/,
  // Plain direct address: "[Name]," at very start, single word only
  /^([A-Z][a-z]{2,18}),\s+(?!I\b)/,
];

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * Scan `transcript` for speaker names, returning a map of speakerId → name.
 * Pass `existing` to preserve already-resolved names (they won't be overwritten).
 *
 * Call on every new transcript chunk — it's cheap (no I/O).
 * Single-speaker transcripts (no [Sx] tags) are stored under key "0".
 */
export function extractSpeakerNames(
  transcript: string,
  existing: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const result: Record<string, string> = { ...existing };
  const lines = transcript.split(/\n|(?<=\.)\s+/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const { speakerId, text } = speakerFromPrefix(line);
    const key = speakerId != null ? String(speakerId) : "0";

    // ── Self-introduction (speaker introduces themselves) ─────────────────
    if (!result[key]) {
      for (const pat of SELF_INTRO_PATTERNS) {
        const m = text.match(pat);
        if (m?.[1] && looksLikeName(m[1])) {
          result[key] = m[1].trim();
          break;
        }
      }
    }

    // ── Guest introduction (one speaker introduces another) ──────────────
    // The speaker saying this intro is typically the host — they're naming the OTHER speaker.
    for (const pat of GUEST_INTRO_PATTERNS) {
      const m = text.match(pat);
      if (m?.[1] && looksLikeName(m[1])) {
        // Assign the named person to the OTHER speaker slot.
        const otherKey = speakerId != null ? String(speakerId === 0 ? 1 : 0) : "1";
        if (!result[otherKey]) {
          result[otherKey] = m[1].trim();
        }
        break;
      }
    }

    // ── Address patterns (speaker X addresses speaker Y by name) ─────────
    for (const pat of ADDRESS_PATTERNS) {
      const m = text.match(pat);
      if (m?.[1] && looksLikeName(m[1])) {
        // The person being addressed is the OTHER speaker.
        const otherKey = speakerId != null ? String(speakerId === 0 ? 1 : 0) : "1";
        if (!result[otherKey]) {
          result[otherKey] = m[1].trim();
        }
        break;
      }
    }
  }

  return result;
}

// ─── Speaker label helper ─────────────────────────────────────────────────────

/**
 * Resolve an [Sx] tag string like "[S1]" to a human name if available,
 * or fall back to "the speaker" / "the host" / "the guest".
 *
 * Used in the AI notes prompt builder.
 */
export function resolveSpeakerTag(
  tag: string,
  names: Readonly<Record<string, string>>,
): string {
  const m = tag.match(/\[S(\d+)\]/);
  if (!m) return tag;
  const id = m[1]!;
  if (names[id]) return names[id]!;
  // Fallback labels: S0 is typically the host, S1+ are guests.
  return id === "0" ? "the host" : "the guest";
}

/**
 * Extract speaker names from a video/page title — e.g. a YouTube tab title.
 *
 * Handles common podcast formats:
 *   "Lex Fridman Podcast #400 | Sam Altman: OpenAI, GPT-5..."
 *   "Joe Rogan Experience #2000 - Elon Musk"
 *   "Tim Ferriss Show with Naval Ravikant"
 *   "Sam Altman: OpenAI | Lex Fridman Podcast"
 *   "Andrew Huberman on Sleep, Matthew Walker"
 *
 * Returns { "0": hostName, "1": guestName } — partial map is fine.
 * Call at listen-start to seed names before Deepgram connects.
 */
export function extractNamesFromTitle(title: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Helper: strip common non-name noise from a title segment and return the
  // leading name-like phrase, or undefined if nothing useful found.
  function leadingName(seg: string): string | undefined {
    const cleaned = seg
      .replace(/#\d+/g, "") // episode numbers
      .replace(/\bPodcast\b|\bShow\b|\bEpisode\b|\bInterview\b|\bExperience\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const m = cleaned.match(/^([A-Z][a-z]{1,18}(?:\s[A-Z][a-z]{1,18})?)/);
    return m?.[1] && looksLikeName(m[1]) ? m[1] : undefined;
  }

  // ── Pattern 1: "Left | Right" or "Left: topic | Right" ───────────────────
  // "Lex Fridman Podcast #400 | Sam Altman: OpenAI…"
  const pipeIdx = title.indexOf("|");
  if (pipeIdx !== -1) {
    const left = title.slice(0, pipeIdx);
    const right = title.slice(pipeIdx + 1).replace(/:.*$/, ""); // strip ": subtitle"
    const n0 = leadingName(left);
    const n1 = leadingName(right);
    if (n0) result["0"] = n0;
    if (n1) result["1"] = n1;
  }

  // ── Pattern 2: "Show Name - Guest Name" ───────────────────────────────────
  // "Joe Rogan Experience #2000 - Elon Musk"
  if (Object.keys(result).length < 2) {
    const dashM = title.match(/^(.+?)\s*[-–]\s*([A-Z][a-z][\w\s]{0,30})(?:\s*[,|:]|$)/);
    if (dashM) {
      if (!result["0"]) {
        const n = leadingName(dashM[1]!);
        if (n) result["0"] = n;
      }
      if (!result["1"]) {
        const n = leadingName(dashM[2]!);
        if (n) result["1"] = n;
      }
    }
  }

  // ── Pattern 3: "…with [Full Name]" ───────────────────────────────────────
  // "Tim Ferriss Show with Naval Ravikant"
  if (!result["1"]) {
    const withM = title.match(/\bwith\s+((?:[A-Z][a-z]{1,18}\s?){1,2})/);
    if (withM?.[1]) {
      const n = withM[1].trim();
      if (looksLikeName(n)) result["1"] = n;
    }
  }

  // ── Pattern 4: bare "First Last: subtitle" at start, no separators ───────
  if (!result["0"]) {
    const bareM = title.match(/^([A-Z][a-z]{1,18}\s[A-Z][a-z]{1,18})(?:\s*[:|,]|$)/);
    if (bareM?.[1] && looksLikeName(bareM[1])) result["0"] = bareM[1];
  }

  return result;
}

/**
 * Build a speaker-mapping block for the AI prompt.
 * Returns empty string when no names are resolved.
 *
 * Example output:
 *   "Speaker mapping: [S0] = Lex Fridman (host), [S1] = Sam Altman (guest)"
 */
export function buildSpeakerMappingBlock(names: Readonly<Record<string, string>>): string {
  const entries = Object.entries(names);
  if (entries.length === 0) return "";
  const parts = entries.map(([id, name]) => {
    const role = id === "0" ? "host" : "guest";
    return `[S${id}] = ${name} (${role})`;
  });
  return `Speaker mapping: ${parts.join(", ")}`;
}

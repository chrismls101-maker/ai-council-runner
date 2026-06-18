/**
 * Clipboard Intelligence — pure pattern detection for #159.
 *
 * Classifies clipboard text as "error", "code", or "plain" using
 * additive regex scoring. No Electron imports — fully unit-testable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipboardContentKind = "error" | "code" | "plain";

export interface ClipboardClassification {
  kind: ClipboardContentKind;
  confidence: number;       // 0..1
  signals: string[];        // matched signal names (for debug/QA)
  language?: string;        // best-effort language guess for "code" kind
  exitCode?: number;        // parsed exit code for "error" kind
}

export interface ClipboardAnalysisDecision {
  shouldFire: boolean;
  classification: ClipboardClassification;
  reason: "fire" | "below-threshold" | "too-short" | "cooldown" | "plain";
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum content length to avoid false positives on tiny copies. */
export const MIN_CONTENT_LENGTH = 40;

/** Minimum lines for code classification (single-line pastes are usually not code). */
const MIN_LINE_COUNT_FOR_CODE = 2;

/** Confidence threshold to fire on error kind. */
export const MIN_CONFIDENCE_ERROR = 0.55;

/** Confidence threshold to fire on code kind (higher — more prone to false positives). */
export const MIN_CONFIDENCE_CODE = 0.65;

/** After firing on content, suppress re-fire for this long even if the same text is re-copied. */
export const COOLDOWN_MS = 60_000;

/** Max chars to send to the AI prompt (prevents oversized payloads). */
export const MAX_PROMPT_CHARS = 4_000;

// ─── Truncation helper ────────────────────────────────────────────────────────

/**
 * Truncate to MAX_PROMPT_CHARS. For errors, keep more of the tail (error details
 * at the end); for code/default, keep the head.
 */
export function truncateForPrompt(
  text: string,
  kind: ClipboardContentKind,
  max = MAX_PROMPT_CHARS,
): string {
  if (text.length <= max) return text;
  if (kind === "error") {
    // Keep last ~70% for errors (stack traces end with the most useful info)
    const tailChars = Math.floor(max * 0.7);
    const headChars = max - tailChars;
    return (
      text.slice(0, headChars) +
      "\n… [truncated] …\n" +
      text.slice(text.length - tailChars)
    );
  }
  return text.slice(0, max) + "\n… [truncated]";
}

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Score clipboard text for "error" signals. Returns 0..1.
 */
function scoreError(
  text: string,
  signals: string[],
): { score: number; exitCode?: number } {
  let score = 0;
  let exitCode: number | undefined;

  // Exit code lines
  const exitCodeMatch =
    text.match(/\bexit(?:ed)?(?: with)?(?: code| status)?\s+([1-9]\d*)\b/i) ??
    text.match(/\bprocess exited with code ([1-9]\d*)/i) ??
    text.match(/\bnpm ERR!.*exit code ([1-9]\d*)/i);
  if (exitCodeMatch) {
    score += 0.4;
    exitCode = parseInt(exitCodeMatch[1], 10);
    signals.push("exit-code");
  }

  // JS/TS/Node stack trace frames
  if (/^\s+at\s+.+\(.+:\d+:\d+\)/m.test(text)) {
    score += 0.35;
    signals.push("js-stack-frame");
  }

  // Python traceback
  if (/^\s+File ".+", line \d+/m.test(text)) {
    score += 0.35;
    signals.push("python-traceback");
  }

  // Rust panic
  if (/panicked at/.test(text)) {
    score += 0.35;
    signals.push("rust-panic");
  }

  // Error/exception at line start
  if (
    /^(Error|Exception|Traceback|panic:|fatal:|FATAL|ERR!|error\[E\d+\])/m.test(text)
  ) {
    score += 0.3;
    signals.push("error-keyword-line-start");
  }

  // Compiler diagnostics — file:line:col + error keyword anywhere on line
  // Matches both `error:` (clang/gcc) and `error TS2322:` (TypeScript) and `error[E0432]` (Rust)
  if (/:\d+:\d+:/.test(text) && /\b(error|warning)\b/i.test(text)) {
    score += 0.3;
    signals.push("compiler-diagnostic");
  }

  // TypeScript compiler error IDs (error TS2xxx / error TS1xxx) — high-confidence standalone
  if (/\berror TS\d+:/i.test(text) || /\bwarning TS\d+:/i.test(text)) {
    score += 0.4;
    signals.push("ts-compiler-error");
  }

  // Runtime errors / unhandled rejections
  if (
    /Unhandled (?:promise )?rejection|Segmentation fault|core dumped|TypeError:|ReferenceError:|NullPointerException|AssertionError/
      .test(text)
  ) {
    score += 0.3;
    signals.push("runtime-error");
  }

  // Build/npm failure markers
  if (/npm ERR!|ELIFECYCLE|Build failed|Compilation failed|FAILED\b|✖|✗/.test(text)) {
    score += 0.2;
    signals.push("build-failure");
  }

  return { score: Math.min(1, score), exitCode };
}

/**
 * Score clipboard text for "code" signals. Returns 0..1 + detected language.
 */
function scoreCode(
  text: string,
  lineCount: number,
  signals: string[],
): { score: number; language?: string } {
  if (lineCount < MIN_LINE_COUNT_FOR_CODE) return { score: 0 };

  let score = 0;
  let language: string | undefined;

  // Structural tokens at line ends (common in code)
  if (/[{};]\s*$/m.test(text)) {
    score += 0.25;
    signals.push("structural-tokens");
  }

  // Keyword-led lines
  if (
    /^\s*(function|const|let|var|class|def\s|fn\s|func\s|import\s|from\s|public\s|private\s|return\s|export\s)/m
      .test(text)
  ) {
    score += 0.3;
    signals.push("code-keywords");
  }

  // Arrow functions / interface / type annotation
  if (/\s=>\s|interface\s+\w|:\s*(string|number|boolean|void|any)\b/.test(text)) {
    score += 0.15;
    language = "ts";
    signals.push("ts-patterns");
  }

  // Python-specific
  if (/^def\s+\w+\s*\(.*\)\s*:/m.test(text) || /^\s*import\s+\w+$/m.test(text)) {
    score += 0.2;
    language = "py";
    signals.push("python-patterns");
  }

  // Rust-specific
  if (/^fn\s+\w+|->|impl\s+\w+/.test(text)) {
    score += 0.2;
    if (!language) language = "rust";
    signals.push("rust-patterns");
  }

  // Go-specific
  if (/^func\s+\w+|^package\s+\w+/.test(text)) {
    score += 0.2;
    if (!language) language = "go";
    signals.push("go-patterns");
  }

  // C/C++-specific
  if (/#include\s*[<"]|std::/.test(text)) {
    score += 0.2;
    if (!language) language = "cpp";
    signals.push("cpp-patterns");
  }

  // Consistent indentation (≥3 lines starting with whitespace)
  const indentedLines = text.split("\n").filter((l) => /^\s{2,}/.test(l));
  if (indentedLines.length >= 3) {
    score += 0.15;
    signals.push("consistent-indentation");
  }

  // Rough bracket balance (code has structured brackets)
  const opens = (text.match(/[({[]/g) ?? []).length;
  const closes = (text.match(/[)}\]]/g) ?? []).length;
  if (opens >= 3 && Math.abs(opens - closes) < opens * 0.5) {
    score += 0.1;
    signals.push("bracket-balance");
  }

  return { score: Math.min(1, score), language };
}

/**
 * Classify clipboard text. Never throws.
 */
export function classifyClipboard(text: string): ClipboardClassification {
  const trimmed = text.trim();

  // Too-short guard
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return { kind: "plain", confidence: 0, signals: ["too-short"] };
  }

  const lineCount = trimmed.split("\n").length;
  const errorSignals: string[] = [];
  const codeSignals: string[] = [];

  const { score: errorScore, exitCode } = scoreError(trimmed, errorSignals);
  const { score: codeScore, language } = scoreCode(trimmed, lineCount, codeSignals);

  // Errors win over code when both score comparably —
  // pasted error output commonly contains code-shaped stack frames.
  if (errorScore >= 0.5 && errorScore >= codeScore - 0.1) {
    return {
      kind: "error",
      confidence: errorScore,
      signals: errorSignals,
      exitCode,
    };
  }

  if (codeScore > errorScore) {
    return {
      kind: "code",
      confidence: codeScore,
      signals: codeSignals,
      language,
    };
  }

  if (errorScore > 0) {
    return {
      kind: "error",
      confidence: errorScore,
      signals: errorSignals,
      exitCode,
    };
  }

  return { kind: "plain", confidence: 0, signals: [] };
}

// ─── Gate ─────────────────────────────────────────────────────────────────────

/**
 * Normalise text to a cheap dedup hash.
 * Keeps first 200 + last 200 chars after whitespace collapsing.
 */
function clipHash(text: string): string {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (normalised.length <= 400) return normalised;
  return normalised.slice(0, 200) + "…" + normalised.slice(-200);
}

/**
 * Stateful gate that enforces confidence thresholds and cooldown.
 * Inject `now` for deterministic unit tests.
 */
export class ClipboardIntelligenceGate {
  private lastFiredHash = "";
  private lastFiredAt = 0;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  decide(
    text: string,
    cls: ClipboardClassification,
  ): ClipboardAnalysisDecision {
    if (cls.signals.includes("too-short")) {
      return { shouldFire: false, classification: cls, reason: "too-short" };
    }

    if (cls.kind === "plain") {
      return { shouldFire: false, classification: cls, reason: "plain" };
    }

    const minConfidence =
      cls.kind === "error" ? MIN_CONFIDENCE_ERROR : MIN_CONFIDENCE_CODE;

    if (cls.confidence < minConfidence) {
      return {
        shouldFire: false,
        classification: cls,
        reason: "below-threshold",
      };
    }

    const hash = clipHash(text);
    if (
      hash === this.lastFiredHash &&
      this.now() - this.lastFiredAt < COOLDOWN_MS
    ) {
      return { shouldFire: false, classification: cls, reason: "cooldown" };
    }

    return { shouldFire: true, classification: cls, reason: "fire" };
  }

  /** Call after a successful AI dispatch so cooldown is correctly anchored. */
  markFired(text: string): void {
    this.lastFiredHash = clipHash(text);
    this.lastFiredAt = this.now();
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

export function buildErrorPrompt(text: string): string {
  const excerpt = truncateForPrompt(text, "error");
  return [
    "You are Glass, an ambient coding assistant. The user just copied this error output to their clipboard.",
    "",
    "Error output:",
    '"""',
    excerpt,
    '"""',
    "",
    "In 2-3 sentences: (1) what the root cause is, (2) the single most likely fix.",
    "Do not restate the error. Be specific and actionable. If you need a file not shown, say so briefly.",
  ].join("\n");
}

export function buildCodePrompt(text: string, language?: string): string {
  const excerpt = truncateForPrompt(text, "code");
  const lang = language ?? "code";
  return [
    `You are Glass, an ambient coding assistant. The user just copied this ${lang} snippet to their clipboard.`,
    "",
    '"""',
    excerpt,
    '"""',
    "",
    "In 2-3 sentences, point out the most important bug, risk, or improvement.",
    "If it looks correct and idiomatic, say so in one sentence. Do not rewrite the whole snippet.",
  ].join("\n");
}

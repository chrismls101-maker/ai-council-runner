/** Lightweight syntax tokens for Glass IDE read-only viewer (no Monaco). */

export type SyntaxTokenKind = "comment" | "string" | "keyword" | "number" | "plain";

export interface SyntaxToken {
  kind: SyntaxTokenKind;
  text: string;
}

const JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "default", "delete", "do", "else", "export", "extends", "false", "finally",
  "for", "from", "function", "if", "import", "in", "instanceof", "interface",
  "let", "new", "null", "of", "return", "super", "switch", "this", "throw",
  "true", "try", "typeof", "undefined", "var", "void", "while", "yield", "type",
]);

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "False", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass",
  "raise", "return", "True", "try", "while", "with", "yield",
]);

function keywordSetForLanguage(language: string): Set<string> | null {
  if (language === "typescript" || language === "javascript") return JS_KEYWORDS;
  if (language === "python") return PY_KEYWORDS;
  return null;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

/** Tokenize a single line for display (best-effort, not a full parser). */
export function tokenizeLine(line: string, language: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const keywords = keywordSetForLanguage(language);
  let i = 0;

  const push = (kind: SyntaxTokenKind, text: string): void => {
    if (text) tokens.push({ kind, text });
  };

  while (i < line.length) {
    const rest = line.slice(i);

    if (language === "python" && rest.startsWith("#")) {
      push("comment", rest);
      break;
    }

    if (
      (language === "typescript" || language === "javascript" || language === "css")
      && rest.startsWith("//")
    ) {
      push("comment", rest);
      break;
    }

    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end === -1) {
        push("comment", rest);
        break;
      }
      push("comment", rest.slice(0, end + 2));
      i += end + 2;
      continue;
    }

    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      push("string", rest.slice(0, j));
      i += j;
      continue;
    }

    if (/[0-9]/.test(rest[0])) {
      let j = 1;
      while (j < rest.length && /[0-9._xXa-fA-F]/.test(rest[j])) j += 1;
      push("number", rest.slice(0, j));
      i += j;
      continue;
    }

    if (isIdentStart(rest[0])) {
      let j = 1;
      while (j < rest.length && isIdentPart(rest[j])) j += 1;
      const word = rest.slice(0, j);
      push(keywords?.has(word) ? "keyword" : "plain", word);
      i += j;
      continue;
    }

    push("plain", rest[0]);
    i += 1;
  }

  return tokens;
}

export function languageIdFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".jsx") || name.endsWith(".js") || name.endsWith(".mjs")) return "javascript";
  if (name.endsWith(".py")) return "python";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".json")) return "javascript";
  if (name.endsWith(".html")) return "javascript";
  if (name.endsWith(".md")) return "plain";
  if (name.endsWith(".rs")) return "plain";
  if (name.endsWith(".go")) return "plain";
  return "plain";
}

export function languageIdFromLabel(languageLabel?: string): string {
  if (!languageLabel) return "plain";
  const label = languageLabel.toLowerCase();
  if (label.includes("typescript") || label === "tsx") return "typescript";
  if (label.includes("javascript") || label === "jsx") return "javascript";
  if (label === "python") return "python";
  if (label === "css") return "css";
  if (label === "json") return "javascript";
  return "plain";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TOKEN_CLASS: Record<SyntaxTokenKind, string> = {
  comment: "gide-syntax-comment",
  string: "gide-syntax-str",
  keyword: "gide-syntax-kw",
  number: "gide-syntax-num",
  plain: "gide-syntax-plain",
};

/** Render a source line as HTML spans for diff / viewer surfaces. */
export function highlightLineToHtml(line: string, language: string): string {
  if (language === "plain") return escapeHtml(line);
  return tokenizeLine(line, language)
    .map((token) => {
      const cls = TOKEN_CLASS[token.kind];
      return `<span class="${cls}">${escapeHtml(token.text)}</span>`;
    })
    .join("");
}

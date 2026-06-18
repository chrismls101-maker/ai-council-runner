/**
 * Markdown code block extractor — pure, no Electron imports.
 * Used by the overlay to locate code inside AI responses
 * so the "Apply to file" button can extract it reliably.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Test whether a trimmed line is a code fence (``` or ~~~, optional lang tag on
 * opening fences only).
 */
function parseFence(trimmed: string): { char: string; len: number } | null {
  if (trimmed.length < 3) return null;
  const ch = trimmed[0];
  if (ch !== '`' && ch !== '~') return null;
  let i = 1;
  while (i < trimmed.length && trimmed[i] === ch) i++;
  if (i < 3) return null;
  // Rest must be empty or a language identifier (for opening fences)
  const rest = trimmed.slice(i).trim();
  // Closing fences must have no trailing content
  if (rest.length > 0 && /[`~]/.test(rest)) return null; // nested fence character
  return { char: ch, len: i };
}

function isClosingFence(
  trimmed: string,
  openChar: string,
  openLen: number,
): boolean {
  if (trimmed.length < openLen) return false;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== openChar) return false;
  }
  return trimmed.length >= openLen;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract the content of the first fenced code block in `markdown`.
 *
 * Returns the raw content between the fences (preserving indentation and
 * newlines exactly as they appear), or `null` if no code block is found.
 *
 * Handles:
 * - triple-backtick (```) and triple-tilde (~~~) fences
 * - optional language tag on the opening fence (`\`\`\`typescript`)
 * - unclosed fences at end-of-string (returns content collected so far)
 */
export function extractFirstCodeBlock(markdown: string): string | null {
  const lines = markdown.split('\n');
  let openChar: string | null = null;
  let openLen = 0;
  const contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (openChar === null) {
      // Looking for an opening fence
      const fence = parseFence(trimmed);
      if (fence) {
        openChar = fence.char;
        openLen = fence.len;
      }
    } else {
      // Inside block: test for matching closing fence
      if (isClosingFence(trimmed, openChar, openLen)) {
        return contentLines.join('\n');
      }
      contentLines.push(line);
    }
  }

  // Unclosed block — return what we collected (still useful for applying)
  if (openChar !== null && contentLines.length > 0) {
    return contentLines.join('\n');
  }
  return null;
}

/**
 * Returns true if `markdown` contains at least one fenced code block.
 */
export function hasCodeBlock(markdown: string): boolean {
  return extractFirstCodeBlock(markdown) !== null;
}

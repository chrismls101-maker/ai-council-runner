/**
 * Lightweight markdown renderer for Glass answer cards.
 * Handles: headings, bold, italic, inline code, code blocks,
 * bullet lists, numbered lists, and paragraphs.
 * No external dependencies — pure React.
 */

type Token =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullet"; items: string[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "codeblock"; code: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" };

function tokenize(raw: string): Token[] {
  const lines = raw.split("\n");
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      tokens.push({ kind: "codeblock", code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      tokens.push({ kind: "heading", level, text: headingMatch[2] });
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ""));
        i++;
      }
      tokens.push({ kind: "bullet", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      tokens.push({ kind: "ordered", items });
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      tokens.push({ kind: "blank" });
      i++;
      continue;
    }

    // Paragraph — collect until blank/heading/list
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*•]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("```")
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({ kind: "paragraph", text: paraLines.join("\n") });
    }
  }

  return tokens;
}

/** Render inline markdown: ==highlight==, **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(==.+?==|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (/^==.+==$/s.test(part)) {
      return <mark key={idx} className="glass-md-mark">{part.slice(2, -2)}</mark>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={idx} className="glass-md-code">{part.slice(1, -1)}</code>;
    }
    // Preserve newlines within paragraphs as <br>
    const newlineParts = part.split("\n");
    return newlineParts.map((chunk, j) => (
      <span key={`${idx}-${j}`}>
        {chunk}
        {j < newlineParts.length - 1 ? <br /> : null}
      </span>
    ));
  });
}

function renderListItem(text: string, idx: number): React.ReactNode {
  return <li key={idx}>{renderInline(text)}</li>;
}

export function GlassMarkdown({ children }: { children: string }): JSX.Element {
  const tokens = tokenize(children ?? "");
  const nodes: React.ReactNode[] = [];
  let keyIdx = 0;

  for (const token of tokens) {
    const k = keyIdx++;
    if (token.kind === "blank") continue;

    if (token.kind === "heading") {
      const Tag = (`h${token.level}`) as "h1" | "h2" | "h3";
      nodes.push(
        <Tag key={k} className={`glass-md-h${token.level}`}>
          {renderInline(token.text)}
        </Tag>,
      );
      continue;
    }

    if (token.kind === "bullet") {
      nodes.push(
        <ul key={k} className="glass-md-ul">
          {token.items.map(renderListItem)}
        </ul>,
      );
      continue;
    }

    if (token.kind === "ordered") {
      nodes.push(
        <ol key={k} className="glass-md-ol">
          {token.items.map(renderListItem)}
        </ol>,
      );
      continue;
    }

    if (token.kind === "codeblock") {
      nodes.push(
        <pre key={k} className="glass-md-pre">
          <code>{token.code}</code>
        </pre>,
      );
      continue;
    }

    if (token.kind === "paragraph") {
      nodes.push(
        <p key={k} className="glass-md-p">
          {renderInline(token.text)}
        </p>,
      );
    }
  }

  return <div className="glass-md">{nodes}</div>;
}

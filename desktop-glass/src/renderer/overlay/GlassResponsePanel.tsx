import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  lastAskResponseBody,
  type GlassLastAskResponse,
} from "../../shared/glassAskTypes.ts";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import "./GlassResponsePanel.css";

interface GlassResponsePanelProps {
  response: GlassLastAskResponse | null;
  open: boolean;
  onDismiss: () => void;
}

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

// ---------------------------------------------------------------------------
// Minimal inline markdown renderer (no external dependency).
// ---------------------------------------------------------------------------

let inlineKeyCounter = 0;
function nextKey(prefix: string): string {
  inlineKeyCounter += 1;
  return `${prefix}-${inlineKeyCounter}`;
}

/** Parse inline spans: **bold**, _italic_, `code`. */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenize on inline code first, then bold, then italic.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={nextKey("c")}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={nextKey("b")}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("_")) {
      nodes.push(<em key={nextKey("i")}>{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void window.glass.writeClipboard(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div className="grp-code-block">
      <button type="button" className="grp-code-copy" onClick={copy} aria-label="Copy code">
        {copied ? "Copied" : "Copy"}
      </button>
      <pre data-lang={lang ?? undefined}>{code}</pre>
    </div>
  );
}

/** Convert markdown text into JSX. Handles headers, code fences, lists, paragraphs. */
export function parseMarkdown(text: string): ReactNode {
  inlineKeyCounter = 0;
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join(" ").trim();
    if (joined) {
      blocks.push(<p key={nextKey("p")}>{parseInline(joined)}</p>);
    }
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      const lang = fence[1];
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(<CodeBlock key={nextKey("code")} code={codeLines.join("\n")} lang={lang} />);
      continue;
    }

    // Headings
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const content = parseInline(heading[2]);
      const key = nextKey("h");
      if (level === 1) blocks.push(<h1 key={key}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={key}>{content}</h2>);
      else blocks.push(<h3 key={key}>{content}</h3>);
      i += 1;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*[-*]\s+/, "");
        items.push(<li key={nextKey("li")}>{parseInline(item)}</li>);
        i += 1;
      }
      blocks.push(<ul key={nextKey("ul")}>{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(<li key={nextKey("li")}>{parseInline(item)}</li>);
        i += 1;
      }
      blocks.push(<ol key={nextKey("ol")}>{items}</ol>);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();

  return <>{blocks}</>;
}

export function GlassResponsePanel({
  response,
  open,
  onDismiss,
}: GlassResponsePanelProps): JSX.Element {
  const [copiedAll, setCopiedAll] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const answer = lastAskResponseBody(response);
  const rendered = useMemo(() => parseMarkdown(answer), [answer]);

  // Reset transient footer states when the response changes.
  useEffect(() => {
    setCopiedAll(false);
    setSavedNote(false);
  }, [response?.runId, response?.at]);

  const copyAll = (): void => {
    if (!answer) return;
    void window.glass.writeClipboard(answer).then(() => {
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    });
  };

  const saveAsFile = (): void => {
    if (!answer) return;
    try {
      const blob = new Blob([answer], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `iivo-response-${stamp}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      // Fallback: copy to clipboard with a note.
      void window.glass.writeClipboard(answer);
    }
    setSavedNote(true);
    window.setTimeout(() => setSavedNote(false), 1800);
  };

  return (
    <div
      className={`grp-panel${open ? " grp-panel--open" : ""}`}
      data-testid="glass-response-panel"
      aria-hidden={!open}
      onMouseEnter={ensureOverlayInteractive}
      onMouseDown={ensureOverlayInteractive}
    >
      <div className="grp-header">
        <span className="grp-label">Answer Panel · {formatTimestamp(response?.at)}</span>
        <button
          type="button"
          className="grp-dismiss"
          aria-label="Dismiss answer panel"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
        >
          ✕
        </button>
      </div>

      {response?.prompt ? (
        <div className="grp-prompt" title={response.prompt}>
          {truncate(response.prompt, 60)}
        </div>
      ) : null}

      <div className="grp-content" onWheel={handlePaletteListWheel}>
        {rendered}
      </div>

      <div className="grp-footer">
        <button type="button" className="grp-btn grp-btn--primary" onClick={copyAll}>
          {copiedAll ? "Copied!" : "Copy all"}
        </button>
        <button type="button" className="grp-btn" onClick={saveAsFile}>
          {savedNote ? "Saved .md" : "Save as file"}
        </button>
      </div>
    </div>
  );
}

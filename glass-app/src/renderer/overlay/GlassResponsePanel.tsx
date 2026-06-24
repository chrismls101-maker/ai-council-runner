import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  lastAskResponseBody,
  type GlassLastAskResponse,
} from "../../shared/glassAskTypes.ts";
import { agentCatalogName } from "../../shared/agentCatalog.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { ensureOverlayInteractive, handlePaletteListWheel } from "../glassTextInteraction.ts";
import "./GlassResponsePanel.css";

interface GlassResponsePanelProps {
  response: GlassLastAskResponse | null;
  open: boolean;
  onDismiss: () => void;
  /** Re-sync panel content from the latest streamed agent state (does not re-run). */
  onRefresh?: () => void;
}

function interactivePointerProps(): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
} {
  return {
    onPointerDown: (e) => {
      e.stopPropagation();
      ensureOverlayInteractive();
    },
    onPointerEnter: ensureOverlayInteractive,
  };
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

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

// ---------------------------------------------------------------------------
// Toolbar icons (inline SVG — no external dependency)
// ---------------------------------------------------------------------------

function IconReveal(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4.5h12v9H2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5 7.5h6M5 10h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCopy(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="8" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4 11H3.5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRefresh(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M12.5 3.5A5.5 5.5 0 1 0 13 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M13 2.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
      <button
        type="button"
        className="grp-code-copy"
        onClick={copy}
        aria-label="Copy code"
        {...interactivePointerProps()}
      >
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
      i += 1;
      blocks.push(<CodeBlock key={nextKey("code")} code={codeLines.join("\n")} lang={lang} />);
      continue;
    }

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
  onRefresh,
}: GlassResponsePanelProps): JSX.Element {
  const [copiedAll, setCopiedAll] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const answer = lastAskResponseBody(response);
  const rendered = useMemo(() => parseMarkdown(answer), [answer]);
  const agentMeta = response?.agentMeta;
  const savedFilePath = agentMeta?.savedFilePath;
  const isAgent = !!agentMeta;

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

  const revealInFinder = (): void => {
    if (!savedFilePath) return;
    void window.glass.agentRevealPath(savedFilePath);
  };

  const openSavedFile = (): void => {
    if (!savedFilePath) return;
    void window.glass.agentOpenPath(savedFilePath);
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
      void window.glass.writeClipboard(answer);
    }
    setSavedNote(true);
    window.setTimeout(() => setSavedNote(false), 1800);
  };

  const headerLabel = isAgent
    ? `${agentCatalogName(agentMeta.agentId)} · ${formatTimestamp(response?.at)}`
    : `Answer Panel · ${formatTimestamp(response?.at)}`;

  return (
    <div
      className={`grp-panel${open ? " grp-panel--open" : ""}`}
      data-testid="glass-response-panel"
      aria-hidden={!open}
      onMouseEnter={ensureOverlayInteractive}
      onPointerDownCapture={ensureOverlayInteractive}
    >
      <div className="grp-header">
        <span className="grp-label" title={headerLabel}>{headerLabel}</span>
        <div className="grp-header-actions">
          {savedFilePath ? (
            <GlassHoverTooltip label="Show in Finder" placement="bottom">
              <button
                type="button"
                className="grp-icon-btn"
                onClick={revealInFinder}
                aria-label="Show in Finder"
                {...interactivePointerProps()}
              >
                <IconReveal />
              </button>
            </GlassHoverTooltip>
          ) : null}
          <GlassHoverTooltip label={copiedAll ? "Copied" : "Copy answer"} placement="bottom">
            <button
              type="button"
              className="grp-icon-btn"
              onClick={copyAll}
              aria-label={copiedAll ? "Copied" : "Copy answer"}
              {...interactivePointerProps()}
            >
              <IconCopy />
            </button>
          </GlassHoverTooltip>
          {isAgent && onRefresh ? (
            <GlassHoverTooltip label="Refresh panel" placement="bottom">
              <button
                type="button"
                className="grp-icon-btn"
                onClick={onRefresh}
                aria-label="Refresh panel"
                {...interactivePointerProps()}
              >
                <IconRefresh />
              </button>
            </GlassHoverTooltip>
          ) : null}
          <GlassHoverTooltip label="Close panel" placement="bottom">
            <button
              type="button"
              className="grp-icon-btn grp-icon-btn--dismiss"
              aria-label="Close answer panel"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                ensureOverlayInteractive();
                onDismiss();
              }}
            >
              ✕
            </button>
          </GlassHoverTooltip>
        </div>
      </div>

      {response?.prompt ? (
        <GlassHoverTooltip label={response.prompt} placement="bottom">
          <div className="grp-prompt">
            {truncate(response.prompt, 60)}
          </div>
        </GlassHoverTooltip>
      ) : null}

      <div className="grp-content" onWheel={handlePaletteListWheel}>
        {rendered}
      </div>

      {savedFilePath ? (
        <div className="grp-file-link">
          <GlassHoverTooltip label={savedFilePath} placement="top">
            <button
              type="button"
              className="grp-file-link__btn"
              onClick={openSavedFile}
              aria-label={`Open ${basename(savedFilePath)}`}
              {...interactivePointerProps()}
            >
              <span className="grp-file-link__icon" aria-hidden="true">📄</span>
              Open {basename(savedFilePath)}
            </button>
          </GlassHoverTooltip>
          <GlassHoverTooltip label="Show in Finder" placement="top">
            <button
              type="button"
              className="grp-file-link__reveal"
              onClick={revealInFinder}
              {...interactivePointerProps()}
            >
              Show in Finder
            </button>
          </GlassHoverTooltip>
        </div>
      ) : null}

      <div className="grp-footer">
        <button type="button" className="grp-btn grp-btn--primary" onClick={copyAll} {...interactivePointerProps()}>
          {copiedAll ? "Copied!" : "Copy all"}
        </button>
        {!isAgent ? (
          <button type="button" className="grp-btn" onClick={saveAsFile} {...interactivePointerProps()}>
            {savedNote ? "Saved .md" : "Save as file"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

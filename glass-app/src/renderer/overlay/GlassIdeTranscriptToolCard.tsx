import { useCallback, useRef, useState } from "react";
import type { DiffLine } from "../../shared/diff.ts";
import type { CoderTranscriptToolItem } from "../../shared/glassIdeCoderTranscript.ts";
import { isCoderWriteTool } from "../../shared/glassIdeCoderTranscript.ts";
import { pathsMatchRelative } from "../../shared/glassIdeInlineDiff.ts";
import type { GlassState } from "../../shared/ipc.ts";
import { highlightLineToHtml, languageIdFromLabel, languageIdFromPath } from "../../shared/glassIdeSyntax.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";

function fileNameFromPath(filePath: string | undefined): string {
  if (!filePath) return "file";
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function parentPathFromRelative(filePath: string | undefined): string | null {
  if (!filePath || !filePath.includes("/")) return null;
  const parts = filePath.split("/");
  parts.pop();
  const parent = parts.join("/");
  return parent || null;
}

function highlightCodeLine(text: string, languageLabel?: string, relativePath?: string): string {
  const language = relativePath
    ? languageIdFromPath(relativePath)
    : languageIdFromLabel(languageLabel);
  return highlightLineToHtml(text, language);
}

function cardMatchesPendingApproval(
  item: CoderTranscriptToolItem,
  pending: GlassState["agentPendingApproval"],
  activeRunId: string | null,
): boolean {
  if (!pending || pending.agentId !== "coder" || !activeRunId || pending.runId !== activeRunId) {
    return false;
  }
  if (item.status !== "running") return false;
  if (item.toolUseId && item.toolUseId === pending.pendingToolId) return true;
  if (item.relativePath && pending.relativePath && pathsMatchRelative(item.relativePath, pending.relativePath)) {
    return true;
  }
  return false;
}

function buildCommandFixPrompt(item: CoderTranscriptToolItem): string {
  const output = [item.commandOutputHead, item.commandOutputTail].filter(Boolean).join("\n").trim();
  const clipped = output.length > 2000 ? `${output.slice(0, 2000)}\n…` : output;
  return [
    "The following command failed. Fix the underlying issue and rerun verification if needed.",
    "",
    `\`${item.command ?? item.label}\``,
    item.commandCwd ? `cwd: ${item.commandCwd}` : null,
    item.exitCode != null ? `exit code: ${item.exitCode}` : null,
    clipped ? `\n\`\`\`\n${clipped}\n\`\`\`` : null,
  ].filter(Boolean).join("\n");
}

function ToolGlyph({ toolName, status }: { toolName: string; status: CoderTranscriptToolItem["status"] }): JSX.Element {
  const spinning = status === "running";
  const cls = `gide-transcript-tool__icon${spinning ? " gide-transcript-tool__icon--spin" : ""}`;
  if (toolName === "read_file") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3 2.5h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 5h6M4 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (toolName === "search_files" || toolName === "web_search") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="6" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8.6 8.6L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (toolName === "list_directory") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 4.5h4l1 1.5h5v5H2z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (toolName === "run_project_command") {
    return (
      <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M3.5 3.5 8 7l-4.5 3.5V3.5z" fill="currentColor" />
        <path d="M9 4.5h2v5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {status === "done" ? <path d="M5 7l1.5 1.5L9.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /> : null}
      {status === "error" ? <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /> : null}
    </svg>
  );
}

function DiffBody({
  lines,
  languageLabel,
  relativePath,
  pending,
}: {
  lines: DiffLine[];
  languageLabel?: string;
  relativePath?: string;
  pending?: boolean;
}): JSX.Element {
  return (
    <pre className={`glass-diff__body gide-transcript-diff__body${pending ? " gide-transcript-diff__body--pending" : ""}`}>
      {lines.map((line, i) => {
        if (line.collapsed !== undefined) {
          return (
            <div key={i} className="glass-diff__line glass-diff__line--sentinel">
              ⋯ {line.collapsed} unchanged {line.collapsed === 1 ? "line" : "lines"}
            </div>
          );
        }
        const cls =
          line.op === "add"
            ? "glass-diff__line glass-diff__line--add"
            : line.op === "remove"
              ? "glass-diff__line glass-diff__line--remove"
              : "glass-diff__line glass-diff__line--equal";
        const prefix = line.op === "add" ? "+" : line.op === "remove" ? "−" : " ";
        const useSyntax = line.op === "add" || line.op === "equal" || line.op === "remove";
        return (
          <div key={i} className={cls}>
            <span className="glass-diff__gutter">{prefix}</span>
            {useSyntax ? (
              <span
                className="glass-diff__text gide-syntax-line"
                dangerouslySetInnerHTML={{ __html: highlightCodeLine(line.text, languageLabel, relativePath) }}
              />
            ) : (
              <span className="glass-diff__text">{line.text}</span>
            )}
          </div>
        );
      })}
    </pre>
  );
}

interface GlassIdeTranscriptToolCardProps {
  item: CoderTranscriptToolItem;
  onOpenFile?: (relativePath: string, displayLines?: DiffLine[]) => void;
  pendingApproval?: GlassState["agentPendingApproval"];
  activeRunId?: string | null;
  onPrefillComposer?: (text: string) => void;
  onSendPrompt?: (text: string) => void;
}

const HUNK_HOVER_THROTTLE_MS = 900;

export function GlassIdeTranscriptToolCard({
  item,
  onOpenFile,
  pendingApproval,
  activeRunId,
  onPrefillComposer,
  onSendPrompt,
}: GlassIdeTranscriptToolCardProps): JSX.Element {
  const lastHunkHoverRef = useRef<{ path: string; at: number } | null>(null);
  const [diffExpanded, setDiffExpanded] = useState(false);

  const revealHunk = useCallback((): void => {
    if (!item.relativePath || !item.displayLines?.length || !onOpenFile) return;
    onOpenFile(item.relativePath, item.displayLines);
  }, [item.displayLines, item.relativePath, onOpenFile]);

  const handleHunkHover = useCallback((): void => {
    if (!item.relativePath || !item.displayLines?.length || !onOpenFile) return;
    const now = Date.now();
    const last = lastHunkHoverRef.current;
    if (last && last.path === item.relativePath && now - last.at < HUNK_HOVER_THROTTLE_MS) {
      return;
    }
    lastHunkHoverRef.current = { path: item.relativePath, at: now };
    revealHunk();
  }, [item.displayLines, item.relativePath, onOpenFile, revealHunk]);

  const handleApprove = useCallback((approved: boolean): void => {
    if (!pendingApproval || !activeRunId || pendingApproval.runId !== activeRunId) return;
    void window.glass.agentApprove({
      runId: activeRunId,
      pendingToolId: pendingApproval.pendingToolId,
      approved,
    });
  }, [activeRunId, pendingApproval]);

  const showDiffCard = isCoderWriteTool(item.toolName);
  const compact = Boolean(item.displayCompact) && !diffExpanded;
  const fileName = fileNameFromPath(item.relativePath);
  const parentPath = parentPathFromRelative(item.relativePath);
  const hasDiff = Boolean(item.displayLines?.length && item.diff && !item.diff.unchanged);
  const isPending = item.status === "running" && hasDiff;
  const awaitingApproval = cardMatchesPendingApproval(item, pendingApproval, activeRunId ?? null);

  if (!showDiffCard) {
    const isCommand = item.toolName === "run_project_command";
    const statusClass =
      item.status === "running"
        ? "gide-transcript-tool--running"
        : item.status === "error"
          ? "gide-transcript-tool--error"
          : item.status === "skipped"
            ? "gide-transcript-tool--skipped"
            : "gide-transcript-tool--done";

    if (isCommand && (item.command || item.status === "running" || item.commandOutputHead)) {
      const exitOk = item.exitCode === 0;
      const exitFail = item.exitCode != null && item.exitCode !== 0;
      const receiptClass =
        item.status === "running"
          ? "gide-transcript-receipt--running"
          : exitFail || item.status === "error"
            ? "gide-transcript-receipt--error"
            : "gide-transcript-receipt--done";
      const outputOpen = !compact && (exitFail || item.status === "running");
      const showCommandActions = exitFail && item.status !== "running" && Boolean(item.command);

      return (
        <article
          className={`gide-transcript-receipt ${receiptClass}${compact ? " gide-transcript-receipt--compact" : ""}`}
          data-testid="glass-ide-transcript-command"
        >
          <header className="gide-transcript-receipt__header">
            <span className="gide-transcript-receipt__glyph" aria-hidden="true">▶</span>
            <div className="gide-transcript-receipt__title">
              <code className="gide-transcript-receipt__command">{item.command ?? item.label}</code>
              {item.commandCwd ? (
                <span className="gide-transcript-receipt__cwd">{item.commandCwd}</span>
              ) : null}
            </div>
            <div className="gide-transcript-receipt__meta">
              {item.durationMs != null && item.status !== "running" ? (
                <span className="gide-transcript-receipt__duration">
                  {(item.durationMs / 1000).toFixed(1)}
                  s
                </span>
              ) : null}
              {item.exitCode != null && item.status !== "running" ? (
                <span
                  className={`gide-transcript-receipt__exit${exitOk ? " gide-transcript-receipt__exit--ok" : " gide-transcript-receipt__exit--fail"}`}
                >
                  exit
                  {" "}
                  {item.exitCode}
                </span>
              ) : item.status === "running" ? (
                <span className="gide-transcript-receipt__live">Running</span>
              ) : null}
            </div>
          </header>
          {item.commandOutputHead ? (
            <details className="gide-transcript-receipt__output" open={outputOpen}>
              <summary className="gide-transcript-receipt__output-summary">Output</summary>
              <pre className="gide-transcript-receipt__output-body">
                {item.commandOutputHead}
                {item.commandOutputTail ? (
                  <>
                    {"\n⋯\n"}
                    {item.commandOutputTail}
                  </>
                ) : null}
              </pre>
            </details>
          ) : item.status === "running" ? (
            <div className="gide-transcript-receipt__pending">
              <span className="gide-transcript-diff-card__spinner" aria-hidden="true" />
              <span>Running command…</span>
            </div>
          ) : null}
          {showCommandActions ? (
            <div className="gide-transcript-receipt__actions">
              <button
                type="button"
                className="gide-transcript-receipt__action"
                data-testid="glass-ide-command-retry"
                onClick={() => onPrefillComposer?.(item.command!)}
                onPointerDown={ensureOverlayInteractive}
              >
                Retry
              </button>
              <button
                type="button"
                className="gide-transcript-receipt__action gide-transcript-receipt__action--primary"
                data-testid="glass-ide-command-send-agent"
                onClick={() => onSendPrompt?.(buildCommandFixPrompt(item))}
                onPointerDown={ensureOverlayInteractive}
              >
                Send to agent
              </button>
            </div>
          ) : null}
        </article>
      );
    }

    return (
      <div
        className={`gide-transcript-tool ${statusClass}${compact ? " gide-transcript-tool--compact" : ""}`}
        data-testid="glass-ide-transcript-tool"
      >
        <ToolGlyph toolName={item.toolName} status={item.status} />
        <div className="gide-transcript-tool__body">
          <span className="gide-transcript-tool__label">{item.label}</span>
          {!compact && item.result && item.status !== "running" ? (
            <span className="gide-transcript-tool__result">{item.result}</span>
          ) : null}
        </div>
        {item.status === "done" ? (
          <span className="gide-transcript-tool__badge gide-transcript-tool__badge--done">Done</span>
        ) : item.status === "running" ? (
          <span className="gide-transcript-tool__badge gide-transcript-tool__badge--live">Live</span>
        ) : null}
      </div>
    );
  }

  const statusClass =
    item.status === "running"
      ? "gide-transcript-diff-card--running"
      : item.status === "error"
        ? "gide-transcript-diff-card--error"
        : item.status === "skipped"
          ? "gide-transcript-diff-card--skipped"
          : item.isDelete
            ? "gide-transcript-diff-card--delete"
            : "gide-transcript-diff-card--done";

  const canExpandCompact = Boolean(item.displayCompact && hasDiff && item.displayLines);

  return (
    <article
      className={`gide-transcript-diff-card glass-diff ${statusClass}${isPending ? " gide-transcript-diff-card--preview" : ""}${compact ? " gide-transcript-diff-card--compact" : ""}${awaitingApproval ? " gide-transcript-diff-card--awaiting" : ""}`}
      data-testid={hasDiff ? "glass-ide-transcript-diff" : "glass-ide-transcript-tool"}
      onMouseEnter={hasDiff && !compact ? handleHunkHover : undefined}
    >
      <header className="glass-diff__header gide-transcript-diff-card__header">
        <div className="gide-transcript-diff-card__title">
          {parentPath ? (
            <span className="gide-transcript-diff-card__dir">{parentPath}/</span>
          ) : null}
          <span className="glass-diff__filename">{fileName}</span>
          {item.languageLabel ? (
            <span className="gide-transcript-diff-card__lang">{item.languageLabel}</span>
          ) : null}
          {item.isDelete ? (
            <span className="gide-transcript-diff-card__delete-badge">Delete</span>
          ) : null}
        </div>
        <div className="gide-transcript-diff-card__meta">
          {item.status === "running" && !hasDiff ? (
            <span className="glass-diff__meta gide-transcript-diff-card__working">
              <span className="gide-transcript-diff-card__spinner" aria-hidden="true" />
              Working…
            </span>
          ) : item.diff && !item.diff.unchanged ? (
            <span className="glass-diff__meta">
              <span className="glass-diff__add-count">+{item.diff.added}</span>
              {" "}
              <span className="glass-diff__rem-count">−{item.diff.removed}</span>
            </span>
          ) : item.status === "skipped" ? (
            <span className="glass-diff__meta">Skipped</span>
          ) : item.status === "done" ? (
            <span className="gide-transcript-diff-card__applied">Applied</span>
          ) : null}
          {canExpandCompact ? (
            <button
              type="button"
              className="gide-transcript-diff-card__open"
              data-testid="glass-ide-diff-expand"
              onClick={() => setDiffExpanded((open) => !open)}
              onPointerDown={ensureOverlayInteractive}
            >
              {diffExpanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
          {item.relativePath && onOpenFile && hasDiff ? (
            <button
              type="button"
              className="gide-transcript-diff-card__open gide-transcript-diff-card__jump"
              onClick={revealHunk}
              onPointerDown={ensureOverlayInteractive}
            >
              Jump
            </button>
          ) : null}
          {item.relativePath && onOpenFile && item.status === "done" ? (
            <button
              type="button"
              className="gide-transcript-diff-card__open"
              onClick={() => onOpenFile(item.relativePath!)}
              onPointerDown={ensureOverlayInteractive}
            >
              Open
            </button>
          ) : null}
        </div>
      </header>
      {hasDiff && item.displayLines && !compact ? (
        <DiffBody
          lines={item.displayLines}
          languageLabel={item.languageLabel}
          relativePath={item.relativePath}
          pending={isPending}
        />
      ) : item.status === "running" ? (
        <div className="gide-transcript-diff-card__pending">
          <span className="gide-transcript-diff-card__spinner" aria-hidden="true" />
          <span>{item.label}</span>
        </div>
      ) : item.result ? (
        <div className="gide-transcript-diff-card__result">{item.result}</div>
      ) : null}
      {awaitingApproval ? (
        <footer className="gide-transcript-approval" data-testid="glass-ide-diff-approval">
          <span className="gide-transcript-approval__hint">
            {item.isDelete ? "Delete this file?" : "Review this change"}
          </span>
          <div className="gide-transcript-approval__actions">
            <button
              type="button"
              className={`gide-transcript-approval__btn gide-transcript-approval__btn--primary${item.isDelete ? " gide-transcript-approval__btn--danger" : ""}`}
              data-testid="glass-ide-diff-apply"
              onClick={() => handleApprove(true)}
              onPointerDown={ensureOverlayInteractive}
            >
              {item.isDelete ? "Delete" : "Apply"}
            </button>
            <button
              type="button"
              className="gide-transcript-approval__btn"
              data-testid="glass-ide-diff-skip"
              onClick={() => handleApprove(false)}
              onPointerDown={ensureOverlayInteractive}
            >
              Skip
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  );
}

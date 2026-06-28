import { useCallback, useEffect, useState } from "react";
import type { GlassProjectDetail } from "../../shared/glassStorageProjectTypes.ts";
import { glassProjectStatusLabel } from "../../shared/glassStorageProjectTypes.ts";
import {
  DESIGN_STACK_LABELS,
  DESIGN_TO_CODE_ACTION_LABELS,
} from "../../shared/design/designStackRegistry.ts";
import { prepareGlassTextPointerDown } from "../glassTextInteraction.ts";
import "./DesignToCodeProjectDetail.css";

type DetailTab = "output" | "files" | "notes";

function formatWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  projectId: string;
}

export function DesignToCodeProjectDetail({ projectId }: Props): JSX.Element {
  const [detail, setDetail] = useState<GlassProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("output");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTab("output");
    void window.glass.getGlassStorageProjectDetail(projectId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setDetail(null);
        setError("Project files could not be loaded.");
      } else {
        setDetail(loaded);
      }
      setLoading(false);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setDetail(null);
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleReveal = useCallback((): void => {
    void window.glass.revealGlassStorageProject(projectId);
  }, [projectId]);

  if (loading) {
    return (
      <div className="d2c-detail d2c-detail--loading" data-testid="d2c-project-detail">
        <p className="d2c-detail__loading">Loading project…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="d2c-detail d2c-detail--error" data-testid="d2c-project-detail">
        <p className="d2c-detail__error">{error ?? "Project not found."}</p>
      </div>
    );
  }

  const { record, manifest, revisions, files } = detail;
  const actionLabel = record.action
    ? DESIGN_TO_CODE_ACTION_LABELS[record.action]
    : "Design to Code";
  const stackLabel = record.stack ? DESIGN_STACK_LABELS[record.stack] : null;
  const statusLabel = glassProjectStatusLabel(record.status, record.saveError);
  const refinements = manifest?.refinementHistory ?? [];
  const warnings = manifest?.latestWarnings ?? [];
  const assetFiles = files.filter((f) => f.kind === "asset" || f.kind === "revision");

  return (
    <div className="d2c-detail" data-testid="d2c-project-detail">
      <div className="d2c-detail__preview">
        {detail.previewDataUrl ? (
          <img
            className="d2c-detail__preview-img"
            src={detail.previewDataUrl}
            alt={`Capture preview for ${record.title}`}
          />
        ) : (
          <div className="d2c-detail__preview-empty" aria-hidden="true" />
        )}
      </div>

      <header className="d2c-detail__header">
        <div className="d2c-detail__header-main">
          <h2 className="d2c-detail__title">{record.title}</h2>
          <p className="d2c-detail__source">{record.source}</p>
        </div>
        <button
          type="button"
          className="d2c-detail__reveal"
          onPointerDown={prepareGlassTextPointerDown}
          onClick={handleReveal}
        >
          Show in Finder
        </button>
      </header>

      <dl className="d2c-detail__meta">
        <div className="d2c-detail__meta-item">
          <dt>Action</dt>
          <dd>{actionLabel}</dd>
        </div>
        {stackLabel ? (
          <div className="d2c-detail__meta-item">
            <dt>Stack</dt>
            <dd>{stackLabel}</dd>
          </div>
        ) : null}
        <div className="d2c-detail__meta-item">
          <dt>Updated</dt>
          <dd>{formatWhen(record.updatedAt)}</dd>
        </div>
        {record.detectedFileName ? (
          <div className="d2c-detail__meta-item">
            <dt>Editor file</dt>
            <dd>{record.detectedFileName}</dd>
          </div>
        ) : null}
        <div className="d2c-detail__meta-item">
          <dt>Status</dt>
          <dd
            className={[
              "d2c-detail__status",
              record.status === "warning" && "d2c-detail__status--warn",
              record.status === "failed" && "d2c-detail__status--fail",
            ].filter(Boolean).join(" ")}
          >
            {statusLabel}
          </dd>
        </div>
      </dl>

      {warnings.length > 0 ? (
        <section className="d2c-detail__warnings" aria-label="Fidelity notes">
          <h3 className="d2c-detail__section-title">Warnings</h3>
          <ul className="d2c-detail__warn-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {refinements.length > 0 ? (
        <section className="d2c-detail__refinements" aria-label="Refinement history">
          <h3 className="d2c-detail__section-title">Refinements</h3>
          <ol className="d2c-detail__refine-list">
            {refinements.map((entry) => (
              <li key={`${entry.createdAt}-${entry.text.slice(0, 24)}`}>
                <span className="d2c-detail__refine-text">{entry.text}</span>
                <time className="d2c-detail__refine-time" dateTime={new Date(entry.createdAt).toISOString()}>
                  {formatWhen(entry.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {revisions.length > 0 ? (
        <section className="d2c-detail__revisions" aria-label="Saved revisions">
          <h3 className="d2c-detail__section-title">
            Revisions
            <span className="d2c-detail__section-count">{revisions.length}</span>
          </h3>
          <ul className="d2c-detail__revision-list">
            {revisions.map((rev) => (
              <li key={rev.relativePath}>
                <span className="d2c-detail__revision-label">{rev.label}</span>
                {rev.savedAt > 0 ? (
                  <span className="d2c-detail__revision-time">{formatWhen(rev.savedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="d2c-detail__tabs" role="tablist" aria-label="Project artifacts">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "output"}
          className={`d2c-detail__tab${tab === "output" ? " d2c-detail__tab--active" : ""}`}
          onPointerDown={prepareGlassTextPointerDown}
          onClick={() => setTab("output")}
        >
          Output
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "files"}
          className={`d2c-detail__tab${tab === "files" ? " d2c-detail__tab--active" : ""}`}
          onPointerDown={prepareGlassTextPointerDown}
          onClick={() => setTab("files")}
        >
          Files
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "notes"}
          className={`d2c-detail__tab${tab === "notes" ? " d2c-detail__tab--active" : ""}`}
          onPointerDown={prepareGlassTextPointerDown}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
      </div>

      <div className="d2c-detail__panel" role="tabpanel">
        {tab === "output" ? (
          <div className="d2c-detail__output">
            <div className="d2c-detail__artifact-head">
              <span className="d2c-detail__artifact-name">{detail.primaryFileName}</span>
              <span className="d2c-detail__artifact-kind">Primary artifact</span>
            </div>
            <pre className="d2c-detail__code">
              <code>{detail.primaryContent || "(empty)"}</code>
            </pre>
          </div>
        ) : null}

        {tab === "files" ? (
          <ul className="d2c-detail__file-list">
            {files.map((file) => (
              <li key={file.relativePath} className="d2c-detail__file-row">
                <span className="d2c-detail__file-name">{file.relativePath}</span>
                <span className="d2c-detail__file-kind">{file.kind}</span>
                {file.sizeBytes != null ? (
                  <span className="d2c-detail__file-size">{formatBytes(file.sizeBytes)}</span>
                ) : null}
              </li>
            ))}
            {assetFiles.length === 0 && files.length === 0 ? (
              <li className="d2c-detail__file-empty">No files on disk.</li>
            ) : null}
          </ul>
        ) : null}

        {tab === "notes" ? (
          <div className="d2c-detail__notes">
            {detail.notesMarkdown ? (
              <pre className="d2c-detail__notes-body">{detail.notesMarkdown}</pre>
            ) : (
              <p className="d2c-detail__notes-empty">No session notes saved.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

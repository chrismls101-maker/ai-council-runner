import type { IivoArtifact } from "../../types/artifacts";
import { artifactFullText, copyText, downloadTextFile } from "../../utils/artifactClipboard";
import { downloadArtifactPdf } from "../../utils/artifactPdf";
import ShareSaveMenu from "./ShareSaveMenu";

export interface BuilderToolbarProps {
  artifact: IivoArtifact;
  runId?: string | null;
  onBackToChat: () => void;
  onFeedback?: (message: string) => void;
  onSavedChange?: (saved: boolean) => void;
  onShareAction?: (action: string) => void;
}

export default function BuilderToolbar({
  artifact,
  runId,
  onBackToChat,
  onFeedback,
  onSavedChange,
  onShareAction,
}: BuilderToolbarProps) {
  const notify = (message: string) => onFeedback?.(message);

  return (
    <div className="builder-toolbar" data-testid="builder-toolbar">
      <button type="button" className="btn ghost small" onClick={onBackToChat}>
        Back to Chat
      </button>
      <div className="builder-toolbar-actions">
        <ShareSaveMenu
          artifact={artifact}
          runId={runId}
          onFeedback={onFeedback}
          onSavedChange={onSavedChange}
          onShareAction={onShareAction}
        />
        <button
          type="button"
          className="btn ghost small"
          data-testid="builder-copy"
          onClick={() => void copyText(artifactFullText(artifact)).then(() => notify("Copied"))}
        >
          Copy
        </button>
        <button
          type="button"
          className="btn ghost small"
          data-testid="builder-download"
          onClick={() => {
            downloadTextFile(`${artifact.type}.txt`, artifactFullText(artifact));
            notify("Downloaded");
          }}
        >
          Download
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            downloadTextFile(`${artifact.type}.md`, artifactFullText(artifact), "text/markdown");
            notify("Exported");
          }}
        >
          Export .md
        </button>
        {artifact.actions.includes("download_pdf") && (
          <button
            type="button"
            className="btn ghost small"
            data-testid="builder-download-pdf"
            onClick={() => {
              void downloadArtifactPdf(artifact).then(() => notify("PDF downloaded"));
            }}
          >
            PDF
          </button>
        )}
      </div>
    </div>
  );
}

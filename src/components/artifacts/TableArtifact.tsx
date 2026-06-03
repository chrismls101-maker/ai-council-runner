import type { ArtifactSection, ArtifactTable } from "../../types/artifacts";
import { copyText, sectionPlainText, tableToCsv } from "../../utils/artifactClipboard";
import ArtifactActions from "./ArtifactActions";
import ArtifactSectionActions from "./ArtifactSectionActions";
import type { ArtifactSectionHandlerProps } from "./artifactSectionProps";

export interface TableArtifactProps extends ArtifactSectionHandlerProps {
  onFeedback?: (message: string) => void;
}

function TableSection({
  section,
  onFeedback,
}: {
  section: ArtifactSection;
  onFeedback?: (message: string) => void;
}) {
  if (typeof section.content === "string") {
    return (
      <pre className="artifact-body-text" data-testid="artifact-table-fallback">
        {section.content}
      </pre>
    );
  }

  const table = section.content as ArtifactTable;

  return (
    <div className="artifact-table-wrap" data-testid="artifact-table">
      <div className="artifact-table-scroll">
        <table className="artifact-table">
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {table.columns.map((col) => (
                  <td key={col}>{String(row[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.totals && (
            <tfoot>
              <tr>
                {table.columns.map((col) => (
                  <td key={col}>
                    <strong>{String(table.totals?.[col] ?? "")}</strong>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        className="btn ghost small"
        data-testid="artifact-copy-csv"
        onClick={() =>
          void copyText(tableToCsv(table)).then(() => onFeedback?.("Table copied as CSV"))
        }
      >
        Copy table
      </button>
    </div>
  );
}

export default function TableArtifact({
  artifact,
  onFeedback,
  onRegenerateSection,
  loadingSectionId,
}: TableArtifactProps) {
  return (
    <div className="artifact-table-card" data-testid="artifact-table-card">
      {artifact.summary && <p className="artifact-summary muted">{artifact.summary}</p>}
      {artifact.sections.map((section) => (
        <div key={section.id} className="artifact-section">
          <div className="artifact-section-header">
            <h4>{section.label}</h4>
            <ArtifactSectionActions
              artifact={artifact}
              section={section}
              onRegenerate={onRegenerateSection}
              loadingSectionId={loadingSectionId}
            />
          </div>
          {section.kind === "table" ? (
            <TableSection section={section} onFeedback={onFeedback} />
          ) : (
            <p className="artifact-notes-text">{sectionPlainText(section)}</p>
          )}
        </div>
      ))}
      <ArtifactActions
        artifact={artifact}
        actions={artifact.actions}
        onFeedback={onFeedback}
      />
    </div>
  );
}

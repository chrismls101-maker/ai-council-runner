import type { ArtifactAction } from "../../types/artifacts";
import {
  artifactFullText,
  copyText,
  downloadTextFile,
  sectionPlainText,
  tableToCsv,
} from "../../utils/artifactClipboard";
import { downloadArtifactPdf } from "../../utils/artifactPdf";
import type { ArtifactSection, ArtifactTable, IivoArtifact } from "../../types/artifacts";

export interface ArtifactActionsProps {
  artifact: IivoArtifact;
  section?: ArtifactSection;
  actions: ArtifactAction[];
  onFeedback?: (message: string) => void;
  compact?: boolean;
}

export default function ArtifactActions({
  artifact,
  section,
  actions,
  onFeedback,
  compact = false,
}: ArtifactActionsProps) {
  const notify = (message: string) => onFeedback?.(message);

  const handleCopy = async () => {
    const text = section ? sectionPlainText(section) : artifactFullText(artifact);
    await copyText(text);
    notify(section ? `${section.label} copied` : "Artifact copied");
  };

  const handleDownloadTxt = () => {
    const text = section ? sectionPlainText(section) : artifactFullText(artifact);
    downloadTextFile(`${artifact.type}.txt`, text);
    notify("Downloaded");
  };

  const handleDownloadMd = () => {
    const text = artifactFullText(artifact);
    downloadTextFile(`${artifact.type}.md`, text, "text/markdown;charset=utf-8");
    notify("Downloaded");
  };

  const handleDownloadCsv = () => {
    const tableSection = section?.kind === "table"
      ? section
      : artifact.sections.find((s) => s.kind === "table");
    if (!tableSection || typeof tableSection.content === "string") return;
    const csv = tableToCsv(tableSection.content as ArtifactTable);
    downloadTextFile(`${artifact.type}.csv`, csv, "text/csv;charset=utf-8");
    notify("CSV downloaded");
  };

  const handleDownloadPdf = () => {
    void downloadArtifactPdf(artifact).then(() => notify("PDF downloaded"));
  };

  const showCopy = actions.includes("copy") || actions.includes("copy_section");
  const showTxt = actions.includes("download_txt");
  const showMd = actions.includes("download_md");
  const showCsv = actions.includes("download_csv");
  const showPdf = actions.includes("download_pdf") && !section;

  if (!showCopy && !showTxt && !showMd && !showCsv && !showPdf) return null;

  return (
    <div className={`artifact-actions${compact ? " compact" : ""}`}>
      {showCopy && (
        <button type="button" className="btn ghost small" onClick={() => void handleCopy()}>
          Copy{section ? ` ${section.label}` : " all"}
        </button>
      )}
      {showTxt && (
        <button type="button" className="btn ghost small" onClick={handleDownloadTxt}>
          Download .txt
        </button>
      )}
      {showMd && (
        <button type="button" className="btn ghost small" onClick={handleDownloadMd}>
          Download .md
        </button>
      )}
      {showCsv && (
        <button type="button" className="btn ghost small" onClick={handleDownloadCsv}>
          Download CSV
        </button>
      )}
      {showPdf && (
        <button
          type="button"
          className="btn ghost small"
          data-testid="artifact-download-pdf"
          onClick={handleDownloadPdf}
        >
          Download PDF
        </button>
      )}
    </div>
  );
}

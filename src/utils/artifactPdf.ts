import { jsPDF } from "jspdf";
import type { ArtifactSection, IivoArtifact } from "../types/artifacts";
import { artifactFullText, sectionPlainText } from "./artifactClipboard";

function escapePdfText(text: string): string {
  return text.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
}

function sectionBlock(section: ArtifactSection): string {
  const body = sectionPlainText(section);
  return body ? `${section.label}\n${body}` : "";
}

export function downloadArtifactPdf(artifact: IivoArtifact): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 48;
  const marginY = 56;
  const maxWidth = 516;
  let y = marginY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(escapePdfText(artifact.title), maxWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 18 + 8;

  if (artifact.summary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const summaryLines = doc.splitTextToSize(escapePdfText(artifact.summary), maxWidth);
    doc.text(summaryLines, marginX, y);
    y += summaryLines.length * 14 + 12;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const blocks =
    artifact.sections.length > 0
      ? artifact.sections.map(sectionBlock).filter(Boolean)
      : [artifactFullText(artifact)];

  for (const block of blocks) {
    const lines = doc.splitTextToSize(escapePdfText(block), maxWidth);
    for (const line of lines) {
      if (y > 720) {
        doc.addPage();
        y = marginY;
      }
      doc.text(line, marginX, y);
      y += 14;
    }
    y += 10;
  }

  doc.save(`${artifact.type.replace(/_/g, "-")}.pdf`);
}

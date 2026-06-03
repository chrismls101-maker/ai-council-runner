import { jsPDF } from "jspdf";
import type { ArtifactSection, IivoArtifact } from "../types/artifacts";
import { artifactFullText, sectionPlainText } from "./artifactClipboard";

const IMAGE_PATH_RE = /\/api\/images\/[^/]+\/file/;

function escapePdfText(text: string): string {
  return text.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
}

export function isImageSection(section: ArtifactSection): boolean {
  if (section.kind === "preview") return true;
  if (typeof section.content === "string" && IMAGE_PATH_RE.test(section.content)) return true;
  return false;
}

export function imageSrcFromSection(section: ArtifactSection): string | null {
  if (typeof section.content === "string" && IMAGE_PATH_RE.test(section.content)) {
    return section.content;
  }
  return null;
}

async function loadImageForPdf(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 });
      img.onerror = () => resolve({ width: 512, height: 512 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

function sectionBlock(section: ArtifactSection): string {
  if (isImageSection(section)) return "";
  const body = sectionPlainText(section);
  return body ? `${section.label}\n${body}` : "";
}

function imageMetaCaption(artifact: IivoArtifact, section: ArtifactSection): string {
  const meta = artifact.metadata?.imageStudio as
    | { promptUsed?: string; aspectRatio?: string }
    | undefined;
  const parts = [section.label];
  if (meta?.aspectRatio) parts.push(`Aspect: ${meta.aspectRatio}`);
  if (meta?.promptUsed) parts.push(`Prompt: ${meta.promptUsed.slice(0, 180)}`);
  return parts.join(" — ");
}

export async function downloadArtifactPdf(artifact: IivoArtifact): Promise<void> {
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

  const sections = artifact.sections.length > 0 ? artifact.sections : [];

  if (sections.length === 0) {
    const lines = doc.splitTextToSize(escapePdfText(artifactFullText(artifact)), maxWidth);
    for (const line of lines) {
      if (y > 720) {
        doc.addPage();
        y = marginY;
      }
      doc.text(line, marginX, y);
      y += 14;
    }
  } else {
    for (const section of sections) {
      const src = imageSrcFromSection(section);
      if (src) {
        if (y > 600) {
          doc.addPage();
          y = marginY;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(escapePdfText(section.label), marginX, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const loaded = await loadImageForPdf(src);
        if (loaded) {
          const maxImgWidth = maxWidth;
          const maxImgHeight = 280;
          const scale = Math.min(maxImgWidth / loaded.width, maxImgHeight / loaded.height, 1);
          const drawWidth = loaded.width * scale;
          const drawHeight = loaded.height * scale;
          if (y + drawHeight > 740) {
            doc.addPage();
            y = marginY;
          }
          doc.addImage(loaded.dataUrl, "PNG", marginX, y, drawWidth, drawHeight);
          y += drawHeight + 8;
          const caption = doc.splitTextToSize(escapePdfText(imageMetaCaption(artifact, section)), maxWidth);
          doc.text(caption, marginX, y);
          y += caption.length * 12 + 14;
        } else {
          doc.text("Image could not be embedded.", marginX, y);
          y += 20;
        }
        continue;
      }

      const block = sectionBlock(section);
      if (!block) continue;
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
  }

  doc.save(`${artifact.type.replace(/_/g, "-")}.pdf`);
}

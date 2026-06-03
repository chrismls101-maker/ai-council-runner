import type { ArtifactSection, IivoArtifact } from "../types/artifacts";
import { cleanDisplayText } from "./cleanDisplayText";

export function updateArtifactSection(
  artifact: IivoArtifact,
  sectionId: string,
  newContent: string,
): IivoArtifact {
  const cleaned = cleanDisplayText(newContent, { preserveCodeBlocks: true });
  return {
    ...artifact,
    sections: artifact.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (section.kind === "table" && typeof section.content !== "string") {
        return section;
      }
      if (section.kind === "checklist" && typeof section.content !== "string") {
        return {
          ...section,
          content: {
            items: cleaned
              .split("\n")
              .filter(Boolean)
              .map((label) => ({ label: label.replace(/^[-*•\d.]+\s*/, "").trim() })),
          },
        };
      }
      return { ...section, content: cleaned };
    }),
  };
}

export function sectionSupportsEdit(section: ArtifactSection): boolean {
  return section.kind !== "table";
}

import type { IivoArtifact } from "../../types/artifacts";

export interface ImageResultGridProps {
  artifact: IivoArtifact | null;
}

export default function ImageResultGrid({ artifact }: ImageResultGridProps) {
  if (!artifact) return null;
  return (
    <div className="image-result-grid" data-testid="image-result-grid">
      {artifact.sections.map((section) => {
        const src = typeof section.content === "string" ? section.content : "";
        return (
          <figure key={section.id} className="image-result-card" data-testid="image-result-card">
            <img src={src} alt={section.label} data-testid="image-result-preview" />
            <figcaption>{section.label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

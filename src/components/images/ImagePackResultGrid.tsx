import type { IivoArtifact } from "../../types/artifacts";

export interface ImagePackResultGridProps {
  artifact: IivoArtifact;
  selectedIds: string[];
  favoriteIds: string[];
  onToggleSelect: (imageId: string) => void;
  onToggleFavorite: (imageId: string) => void;
  onDownload: (path: string, title: string) => void;
  onCopyPrompt: (prompt: string) => void;
  onRegenerate: (index: number) => void;
}

export default function ImagePackResultGrid({
  artifact,
  selectedIds,
  favoriteIds,
  onToggleSelect,
  onToggleFavorite,
  onDownload,
  onCopyPrompt,
  onRegenerate,
}: ImagePackResultGridProps) {
  const meta = artifact.metadata?.imageStudio as
    | { imageIds?: string[]; promptUsed?: string }
    | undefined;
  const imageIds = meta?.imageIds ?? [];

  return (
    <div className="image-pack-result-grid" data-testid="image-pack-result-grid">
      {artifact.sections.map((section, index) => {
        const src = typeof section.content === "string" ? section.content : "";
        const imageId = imageIds[index] ?? "";
        const selected = selectedIds.includes(imageId);
        const favorite = favoriteIds.includes(imageId);
        return (
          <figure
            key={section.id}
            className={`image-pack-result-card${selected ? " selected" : ""}`}
            data-testid="image-pack-result-card"
          >
            <img src={src} alt={section.label} data-testid="image-pack-preview" />
            <figcaption>{section.label}</figcaption>
            <div className="image-pack-card-actions">
              <label>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => imageId && onToggleSelect(imageId)}
                />
                Select
              </label>
              <button
                type="button"
                className="btn ghost small"
                data-testid="image-pack-favorite"
                onClick={() => imageId && onToggleFavorite(imageId)}
              >
                {favorite ? "★ Favorite" : "☆ Mark favorite"}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onDownload(src, section.label)}
              >
                Download
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onCopyPrompt(meta?.promptUsed ?? section.label)}
              >
                Copy prompt
              </button>
              <button
                type="button"
                className="btn ghost small"
                data-testid="image-pack-regenerate-one"
                onClick={() => onRegenerate(index)}
              >
                Regenerate
              </button>
            </div>
          </figure>
        );
      })}
    </div>
  );
}

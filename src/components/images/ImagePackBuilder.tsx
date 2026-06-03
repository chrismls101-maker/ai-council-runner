import { useState } from "react";
import type { IivoArtifact } from "../../types/artifacts";
import type { ImagePackType, ImagePackVariation } from "../../types/imageStudio";
import { copyText } from "../../utils/artifactClipboard";
import ImagePackResultGrid from "./ImagePackResultGrid";

const PACK_TYPES: Array<{ id: ImagePackType; label: string }> = [
  { id: "product_render_pack", label: "Product render pack" },
  { id: "ad_creative_pack", label: "Ad creative pack" },
  { id: "social_visual_pack", label: "Social visual pack" },
  { id: "hero_visual_variants", label: "Hero visual variants" },
  { id: "brand_visual_system", label: "Brand visual system" },
];

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:5", "3:4"];

export interface ImagePackBuilderProps {
  sharedPrompt: string;
  creditsPerImage: number;
  visionQaCredits?: number;
  generating: boolean;
  resultArtifact: IivoArtifact | null;
  onGenerate: (input: {
    packType: ImagePackType;
    count: number;
    aspectRatio: string;
    styleConsistency: boolean;
    sharedBriefPrompt: string;
    variations: ImagePackVariation[];
    runVisionQa: boolean;
  }) => void;
  onAttachSelected: (imageIds: string[]) => void;
  onRegenerateIndex: (index: number) => void;
  onFeedback?: (message: string) => void;
}

function emptyVariations(count: number): ImagePackVariation[] {
  return Array.from({ length: count }, () => ({}));
}

export default function ImagePackBuilder({
  sharedPrompt,
  creditsPerImage,
  visionQaCredits = 0,
  generating,
  resultArtifact,
  onGenerate,
  onAttachSelected,
  onRegenerateIndex,
  onFeedback,
}: ImagePackBuilderProps) {
  const [packType, setPackType] = useState<ImagePackType>("product_render_pack");
  const [count, setCount] = useState(2);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [styleConsistency, setStyleConsistency] = useState(true);
  const [briefPrompt, setBriefPrompt] = useState(sharedPrompt);
  const [variations, setVariations] = useState<ImagePackVariation[]>(emptyVariations(2));
  const [runVisionQa, setRunVisionQa] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const creditEstimate =
    count * creditsPerImage + (runVisionQa ? visionQaCredits : 0);

  const updateCount = (next: number) => {
    setCount(next);
    setVariations((prev) => {
      const nextVars = emptyVariations(next);
      for (let i = 0; i < Math.min(prev.length, next); i++) nextVars[i] = prev[i] ?? {};
      return nextVars;
    });
  };

  const updateVariation = (index: number, field: keyof ImagePackVariation, value: string) => {
    setVariations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const notify = (msg: string) => onFeedback?.(msg);

  return (
    <div className="image-pack-builder" data-testid="image-pack-builder">
      <h4>Image pack workflow</h4>
      <div className="image-pack-type-row">
        <label>
          Pack type
          <select
            data-testid="image-pack-type"
            value={packType}
            onChange={(e) => setPackType(e.target.value as ImagePackType)}
          >
            {PACK_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Count
          <select
            data-testid="image-pack-count"
            value={count}
            onChange={(e) => updateCount(Number(e.target.value))}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          Aspect ratio
          <select
            data-testid="image-pack-aspect"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="image-pack-style-toggle">
        <input
          type="checkbox"
          checked={styleConsistency}
          onChange={(e) => setStyleConsistency(e.target.checked)}
        />
        Keep style consistency across pack
      </label>

      <label>
        Shared brief
        <textarea
          data-testid="image-pack-shared-brief"
          value={briefPrompt}
          onChange={(e) => setBriefPrompt(e.target.value)}
          rows={3}
        />
      </label>

      <div className="image-pack-variations">
        <h5>Per-image variation notes</h5>
        {variations.map((variation, index) => (
          <fieldset key={index} className="image-pack-variation" data-testid={`image-pack-variation-${index}`}>
            <legend>Image {index + 1}</legend>
            <input
              placeholder="Angle"
              value={variation.angle ?? ""}
              onChange={(e) => updateVariation(index, "angle", e.target.value)}
            />
            <input
              placeholder="Background"
              value={variation.background ?? ""}
              onChange={(e) => updateVariation(index, "background", e.target.value)}
            />
            <input
              placeholder="Lighting"
              value={variation.lighting ?? ""}
              onChange={(e) => updateVariation(index, "lighting", e.target.value)}
            />
            <input
              placeholder="Composition"
              value={variation.composition ?? ""}
              onChange={(e) => updateVariation(index, "composition", e.target.value)}
            />
            <input
              placeholder="CTA / use case"
              value={variation.useCase ?? ""}
              onChange={(e) => updateVariation(index, "useCase", e.target.value)}
            />
          </fieldset>
        ))}
      </div>

      <div className="image-pack-generate-row">
        <label>
          <input
            type="checkbox"
            checked={runVisionQa}
            onChange={(e) => setRunVisionQa(e.target.checked)}
          />
          Run optional visual QA (+{visionQaCredits} credits)
        </label>
        <span className="muted" data-testid="image-pack-credit-estimate">
          Estimated credits: {creditEstimate}
        </span>
        <button
          type="button"
          className="btn primary"
          data-testid="image-pack-generate-button"
          disabled={generating || !briefPrompt.trim()}
          onClick={() =>
            onGenerate({
              packType,
              count,
              aspectRatio,
              styleConsistency,
              sharedBriefPrompt: briefPrompt,
              variations,
              runVisionQa,
            })
          }
        >
          {generating ? "Generating pack…" : "Generate pack"}
        </button>
      </div>

      {resultArtifact && (
        <>
          <ImagePackResultGrid
            artifact={resultArtifact}
            selectedIds={selectedIds}
            favoriteIds={favorites}
            onToggleSelect={toggleSelected}
            onToggleFavorite={toggleFavorite}
            onDownload={(path, title) => {
              const link = document.createElement("a");
              link.href = path;
              link.download = `${title.replace(/\s+/g, "-").toLowerCase()}.png`;
              link.click();
              notify("Download started");
            }}
            onCopyPrompt={(prompt) => void copyText(prompt).then(() => notify("Prompt copied"))}
            onRegenerate={onRegenerateIndex}
          />
          <div className="image-pack-actions">
            <button
              type="button"
              className="btn ghost small"
              data-testid="image-pack-download-all"
              onClick={() => {
                resultArtifact.sections.forEach((section, index) => {
                  const path = typeof section.content === "string" ? section.content : "";
                  if (!path) return;
                  setTimeout(() => {
                    const link = document.createElement("a");
                    link.href = path;
                    link.download = `pack-${index + 1}.png`;
                    link.click();
                  }, index * 300);
                });
                notify("Downloading all images");
              }}
            >
              Download all
            </button>
            <button
              type="button"
              className="btn ghost small"
              data-testid="image-pack-attach-selected"
              disabled={selectedIds.length === 0}
              onClick={() => onAttachSelected(selectedIds)}
            >
              Attach selected ({selectedIds.length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import type { IivoArtifact } from "../../types/artifacts";
import { copyText } from "../../utils/artifactClipboard";

export interface ImageActionsProps {
  artifact: IivoArtifact;
  imageId?: string;
  onRegenerate?: () => void;
  onCreateVariants?: () => void;
  onAttach?: () => void;
  onFeedback?: (message: string) => void;
}

export default function ImageActions({
  artifact,
  imageId,
  onRegenerate,
  onCreateVariants,
  onAttach,
  onFeedback,
}: ImageActionsProps) {
  const meta = artifact.metadata?.imageStudio as
    | { promptUsed?: string; imageRef?: { value?: string } }
    | undefined;
  const imagePath = meta?.imageRef?.value || artifact.sections[0]?.content;
  const prompt = meta?.promptUsed ?? "";

  const notify = (msg: string) => onFeedback?.(msg);

  return (
    <div className="image-actions" data-testid="image-actions">
      <button
        type="button"
        className="btn ghost small"
        data-testid="image-download-png"
        onClick={() => {
          if (typeof imagePath !== "string" || !imagePath) return;
          const link = document.createElement("a");
          link.href = imagePath;
          link.download = `${artifact.title.replace(/\s+/g, "-").toLowerCase()}.png`;
          link.click();
          notify("Download started");
        }}
      >
        Download PNG
      </button>
      <button
        type="button"
        className="btn ghost small"
        data-testid="image-copy-prompt"
        onClick={() => void copyText(prompt).then(() => notify("Prompt copied"))}
      >
        Copy prompt
      </button>
      <button
        type="button"
        className="btn ghost small"
        data-testid="image-regenerate"
        onClick={() => onRegenerate?.()}
      >
        Regenerate
      </button>
      <button
        type="button"
        className="btn ghost small"
        data-testid="image-create-variants"
        disabled={!imageId}
        onClick={() => onCreateVariants?.()}
      >
        Create variants
      </button>
      <button
        type="button"
        className="btn ghost small"
        data-testid="image-attach-to-artifact"
        disabled={!imageId}
        onClick={() => onAttach?.()}
      >
        Attach to artifact
      </button>
    </div>
  );
}

import type { ArtifactType, IivoArtifact } from "../artifacts/artifactTypes.js";
import type { ImageBrief } from "./imageBriefBuilder.js";
import type { ImageQualityScore } from "./imageQuality.js";
import type { GeneratedImage } from "./imageProvider.js";
import type { VisualNeed } from "./visualNeedDetector.js";
import { visualNeedToArtifactType } from "./imageQuality.js";

export function buildImageArtifact(params: {
  images: GeneratedImage[];
  visualNeed: VisualNeed;
  brief: ImageBrief;
  quality: ImageQualityScore;
  sourceArtifact?: Pick<IivoArtifact, "id" | "title" | "type">;
  safetyStatus?: "ok" | "warning" | "blocked";
  safetyWarnings?: string[];
  packType?: string;
}): IivoArtifact {
  const count = params.images.length;
  const artifactType = (
    params.packType ??
    visualNeedToArtifactType(params.visualNeed.type, count)
  ) as ArtifactType;
  const primary = params.images[0]!;
  const title = `${params.sourceArtifact?.title ?? "Business"} — ${params.visualNeed.type.replace(/_/g, " ")}`;

  return {
    id: `img-art-${primary.id}`,
    type: artifactType,
    renderMode: "inline",
    title,
    summary: params.brief.purpose,
    sections: params.images.map((img, index) => ({
      id: `image-${index + 1}`,
      label: count > 1 ? `Visual ${index + 1}` : "Generated visual",
      kind: "preview" as const,
      content: img.path ?? "",
      copyable: false,
    })),
    actions: [
      "copy",
      "download_png" as never,
      "copy_prompt" as never,
      "regenerate" as never,
      "create_variants" as never,
      "attach_to_artifact" as never,
    ],
    metadata: {
      imageStudio: {
        promptUsed: params.brief.prompt,
        provider: primary.provider,
        model: primary.model,
        sourceArtifactId: params.sourceArtifact?.id,
        sourceArtifactTitle: params.sourceArtifact?.title,
        sourceArtifactType: params.sourceArtifact?.type,
        visualType: params.visualNeed.type,
        imageRef: { mode: "path", value: primary.path ?? "" },
        width: primary.width,
        height: primary.height,
        aspectRatio: params.brief.aspectRatio,
        generatedAt: new Date().toISOString(),
        safetyStatus: params.safetyStatus ?? "ok",
        safetyWarnings: params.safetyWarnings,
        brief: params.brief,
        quality: params.quality,
        imageIds: params.images.map((img) => img.id),
      },
    },
  };
}

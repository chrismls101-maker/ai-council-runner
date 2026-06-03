import type { IivoArtifact } from "../artifacts/artifactTypes.js";
import { getStoredImage } from "./imageStore.js";

export async function attachImageToArtifact(params: {
  targetArtifact: IivoArtifact;
  imageId: string;
  sectionId?: string;
  label?: string;
}): Promise<IivoArtifact> {
  const record = await getStoredImage(params.imageId);
  if (!record) throw new Error("Image not found");

  const sectionLabel = params.label ?? "Attached visual";
  const imagePath = record.publicPath;
  const existing = params.targetArtifact.sections.find((s) => s.id === params.sectionId);
  const attachedMeta = {
    attachedImageId: record.id,
    attachedImagePath: imagePath,
    attachedAt: new Date().toISOString(),
  };

  if (existing) {
    return {
      ...params.targetArtifact,
      sections: params.targetArtifact.sections.map((section) =>
        section.id === existing.id
          ? {
              ...section,
              kind: "preview",
              content: imagePath,
              copyable: false,
            }
          : section,
      ),
      metadata: {
        ...params.targetArtifact.metadata,
        imageAttachments: [
          ...((params.targetArtifact.metadata?.imageAttachments as unknown[]) ?? []),
          attachedMeta,
        ],
      },
    };
  }

  return {
    ...params.targetArtifact,
    sections: [
      ...params.targetArtifact.sections,
      {
        id: `attached-visual-${record.id}`,
        label: sectionLabel,
        kind: "preview",
        content: imagePath,
        copyable: false,
      },
    ],
    metadata: {
      ...params.targetArtifact.metadata,
      imageAttachments: [
        ...((params.targetArtifact.metadata?.imageAttachments as unknown[]) ?? []),
        attachedMeta,
      ],
    },
  };
}

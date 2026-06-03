import type { ArtifactSection, IivoArtifact } from "../../types/artifacts";

export type ArtifactSectionHandlerProps = {
  artifact: IivoArtifact;
  onRegenerateSection?: (section: ArtifactSection) => void;
  onEditSection?: (section: ArtifactSection) => void;
  loadingSectionId?: string | null;
};

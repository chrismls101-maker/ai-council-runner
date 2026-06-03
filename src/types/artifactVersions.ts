import type { ArtifactSection } from "./artifacts";

export type ArtifactSectionVersionSource =
  | "original"
  | "edit"
  | "regenerate"
  | "variant"
  | "transform"
  | "restore";

export type VersionSnapshotMode = "full" | "reference" | "metadata_only";

export type PersistedArtifactSectionVersion = {
  id: string;
  artifactId: string;
  runId?: string;
  sectionId: string;
  sectionLabel?: string;
  sectionKind?: ArtifactSection["kind"];
  createdAt: string;
  source: ArtifactSectionVersionSource;
  instruction?: string;
  variantType?: string;
  content: ArtifactSection["content"];
  contentHash?: string;
  sizeBytes?: number;
  snapshotMode?: VersionSnapshotMode;
};

export type ArtifactSectionVersion = {
  id: string;
  sectionId: string;
  createdAt: string;
  source: ArtifactSectionVersionSource;
  instruction?: string;
  variantType?: string;
  content: ArtifactSection["content"];
};

export type ArtifactVersionState = {
  artifactId: string;
  sectionVersions: Record<string, ArtifactSectionVersion[]>;
};

import type { ArtifactSection } from "./artifacts";

export type ArtifactSectionVersionSource =
  | "original"
  | "edit"
  | "regenerate"
  | "variant"
  | "transform";

export type PersistedArtifactSectionVersion = {
  id: string;
  artifactId: string;
  sectionId: string;
  createdAt: string;
  source: ArtifactSectionVersionSource;
  instruction?: string;
  variantType?: string;
  content: ArtifactSection["content"];
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

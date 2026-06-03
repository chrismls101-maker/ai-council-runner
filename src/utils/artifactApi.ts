import type { TokenMode } from "../types";
import type { SectionVariantType } from "../types/builderWorkspace";
import type { ArtifactRelationship, ArtifactType, IivoArtifact } from "../types/artifacts";
import type { ArtifactTransformType } from "../types/builderWorkspace";
import type { PersistedArtifactSectionVersion } from "../types/artifactVersions";

export type VersionPersistenceMode = "server" | "local" | "hybrid";

export type ArtifactSectionAction = "regenerate" | "edit";

export interface ArtifactSectionRequest {
  userPrompt: string;
  artifactType: ArtifactType;
  sectionLabel: string;
  sectionContent: string;
  fullAnswer: string;
  action: ArtifactSectionAction;
  editInstruction?: string;
  variantType?: SectionVariantType;
  tokenMode?: TokenMode;
}

export interface ArtifactTransformRequest {
  artifact: IivoArtifact;
  transformType: ArtifactTransformType;
  userPrompt: string;
  sourceSectionIds?: string[];
  tokenMode?: TokenMode;
  sourceRunId?: string;
}

export interface ArtifactTransformResponse {
  artifact: IivoArtifact;
  relationship: ArtifactRelationship;
}

export interface ArtifactSectionResponse {
  content: string;
}

export async function requestArtifactSectionUpdate(
  body: ArtifactSectionRequest,
): Promise<ArtifactSectionResponse> {
  const res = await fetch("/api/artifacts/section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Section update failed (${res.status})`);
  }
  return (await res.json()) as ArtifactSectionResponse;
}

export async function requestArtifactTransform(
  body: ArtifactTransformRequest,
): Promise<ArtifactTransformResponse> {
  const res = await fetch("/api/artifacts/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Transform failed (${res.status})`);
  }
  return (await res.json()) as ArtifactTransformResponse;
}

export async function fetchArtifactVersions(
  artifactId: string,
): Promise<PersistedArtifactSectionVersion[]> {
  const res = await fetch(`/api/artifacts/${artifactId}/versions`);
  if (!res.ok) return [];
  const data = (await res.json()) as { versions?: PersistedArtifactSectionVersion[] };
  return data.versions ?? [];
}

export async function persistArtifactVersion(
  version: PersistedArtifactSectionVersion,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/artifacts/${version.artifactId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(version),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchArtifactSaved(artifactId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/artifacts/${artifactId}/saved`);
    if (!res.ok) return false;
    const data = (await res.json()) as { saved?: boolean };
    return Boolean(data.saved);
  } catch {
    return false;
  }
}

export async function saveArtifactToLibrary(params: {
  artifactId: string;
  title: string;
  type: ArtifactType;
  sourceRunId?: string;
  tags?: string[];
  artifact?: IivoArtifact;
}): Promise<boolean> {
  try {
    const res = await fetch(`/api/artifacts/${params.artifactId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function persistBuilderModeAccepted(
  runId: string,
  builderModeAccepted: boolean,
): Promise<void> {
  const res = await fetch(`/api/history/${runId}/artifact-trace`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ builderModeAccepted }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to save builder choice (${res.status})`);
  }
}

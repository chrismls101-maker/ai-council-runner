import type { ArtifactSection, IivoArtifact } from "../types/artifacts";
import type {
  ArtifactSectionVersion,
  ArtifactSectionVersionSource,
  ArtifactVersionState,
  PersistedArtifactSectionVersion,
} from "../types/artifactVersions";
import {
  fetchArtifactVersions,
  persistArtifactVersion,
  type VersionPersistenceMode,
} from "./artifactApi.ts";

const STORAGE_PREFIX = "iivo_artifact_versions_";

export function createVersionState(artifactId: string): ArtifactVersionState {
  return { artifactId, sectionVersions: {} };
}

export function recordSectionVersion(
  state: ArtifactVersionState,
  section: ArtifactSection,
  source: ArtifactSectionVersionSource,
  options?: { instruction?: string; variantType?: string },
): ArtifactVersionState {
  const entry: ArtifactSectionVersion = {
    id: `${section.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sectionId: section.id,
    createdAt: new Date().toISOString(),
    source,
    instruction: options?.instruction,
    variantType: options?.variantType,
    content: structuredClone(section.content),
  };
  const prev = state.sectionVersions[section.id] ?? [];
  return {
    ...state,
    sectionVersions: {
      ...state.sectionVersions,
      [section.id]: [...prev, entry],
    },
  };
}

export function seedOriginalVersions(
  state: ArtifactVersionState,
  sections: ArtifactSection[],
): ArtifactVersionState {
  let next = state;
  for (const section of sections) {
    if ((next.sectionVersions[section.id]?.length ?? 0) > 0) continue;
    next = recordSectionVersion(next, section, "original");
  }
  return next;
}

export function restoreSectionVersion(
  artifact: IivoArtifact,
  state: ArtifactVersionState,
  versionId: string,
): { state: ArtifactVersionState; artifact: IivoArtifact } | null {
  for (const [sectionId, versions] of Object.entries(state.sectionVersions)) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) continue;
    const original = artifact.sections.find((s) => s.id === sectionId);
    if (!original) return null;
    const restored: ArtifactSection = {
      ...original,
      content: structuredClone(v.content),
    };
    return {
      state,
      artifact: {
        ...artifact,
        sections: artifact.sections.map((s) => (s.id === sectionId ? restored : s)),
      },
    };
  }
  return null;
}

export function versionCount(state: ArtifactVersionState): number {
  return Object.values(state.sectionVersions).reduce((n, arr) => n + arr.length, 0);
}

export function loadVersionState(artifactId: string): ArtifactVersionState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${artifactId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ArtifactVersionState;
  } catch {
    return null;
  }
}

export function saveVersionState(state: ArtifactVersionState): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${state.artifactId}`, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function persistedFromSectionVersion(
  v: ArtifactSectionVersion,
  artifactId: string,
): PersistedArtifactSectionVersion {
  return {
    id: v.id,
    artifactId,
    sectionId: v.sectionId,
    createdAt: v.createdAt,
    source: v.source,
    instruction: v.instruction,
    variantType: v.variantType,
    content: v.content,
  };
}

function mergeVersionStates(
  local: ArtifactVersionState,
  serverVersions: PersistedArtifactSectionVersion[],
): { state: ArtifactVersionState; mode: VersionPersistenceMode } {
  const merged = { ...local, sectionVersions: { ...local.sectionVersions } };
  let serverCount = 0;

  for (const sv of serverVersions) {
    const list = merged.sectionVersions[sv.sectionId] ?? [];
    if (list.some((v) => v.id === sv.id)) continue;
    const entry: ArtifactSectionVersion = {
      id: sv.id,
      sectionId: sv.sectionId,
      createdAt: sv.createdAt,
      source: sv.source,
      instruction: sv.instruction,
      variantType: sv.variantType,
      content: structuredClone(sv.content),
    };
    merged.sectionVersions[sv.sectionId] = [...list, entry].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    serverCount++;
  }

  const localOnly = versionCount(local);
  const total = versionCount(merged);
  let mode: VersionPersistenceMode = "local";
  if (serverCount > 0 && localOnly > 0) mode = "hybrid";
  else if (serverCount > 0) mode = "server";
  else if (total > 0) mode = "local";

  return { state: merged, mode };
}

export async function loadMergedVersionState(
  artifactId: string,
  sections: ArtifactSection[],
): Promise<{ state: ArtifactVersionState; mode: VersionPersistenceMode }> {
  const local = loadVersionState(artifactId);
  const base =
    local?.artifactId === artifactId ? local : createVersionState(artifactId);
  const seeded = seedOriginalVersions(base, sections);

  try {
    const serverVersions = await fetchArtifactVersions(artifactId);
    if (serverVersions.length === 0) {
      return { state: seeded, mode: "local" };
    }
    return mergeVersionStates(seeded, serverVersions);
  } catch {
    return { state: seeded, mode: "local" };
  }
}

/** Save locally and best-effort server persist. */
export async function persistSectionVersion(
  state: ArtifactVersionState,
  section: ArtifactSection,
  source: ArtifactSectionVersionSource,
  options?: { instruction?: string; variantType?: string },
): Promise<{ state: ArtifactVersionState; mode: VersionPersistenceMode }> {
  const next = recordSectionVersion(state, section, source, options);
  saveVersionState(next);

  const latest = next.sectionVersions[section.id]?.at(-1);
  if (!latest) return { state: next, mode: "local" };

  const serverOk = await persistArtifactVersion(
    persistedFromSectionVersion(latest, state.artifactId),
  );
  const mode: VersionPersistenceMode = serverOk ? "hybrid" : "local";
  return { state: next, mode };
}

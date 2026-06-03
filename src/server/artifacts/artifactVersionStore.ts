import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ArtifactSection } from "./artifactTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSIONS_DIR = path.resolve(__dirname, "../../../data/artifact-versions");
const VERSION_BLOB_DIR = path.resolve(__dirname, "../../../data/artifact-version-blobs");
const MAX_INLINE_VERSION_BYTES = 512 * 1024;

export type PersistedArtifactSectionVersion = {
  id: string;
  artifactId: string;
  runId?: string;
  sectionId: string;
  sectionLabel?: string;
  sectionKind?: ArtifactSection["kind"];
  createdAt: string;
  source: "original" | "edit" | "regenerate" | "variant" | "transform" | "restore";
  instruction?: string;
  variantType?: string;
  content: ArtifactSection["content"];
  contentHash?: string;
  sizeBytes?: number;
  snapshotMode?: "full" | "reference" | "metadata_only";
  contentRef?: string;
  snapshotWarning?: string;
};

function versionsPath(artifactId: string): string {
  return path.join(VERSIONS_DIR, `${artifactId}.json`);
}

function versionBlobPath(artifactId: string, versionId: string): string {
  return path.join(VERSION_BLOB_DIR, artifactId, `${versionId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
}

async function ensureBlobDir(artifactId: string): Promise<void> {
  await fs.mkdir(path.join(VERSION_BLOB_DIR, artifactId), { recursive: true });
}

export function hashVersionContent(content: ArtifactSection["content"]): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}

export function estimateVersionSizeBytes(content: ArtifactSection["content"]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(content)).length;
  } catch {
    return JSON.stringify(content).length;
  }
}

async function writeVersionBlob(
  artifactId: string,
  versionId: string,
  content: ArtifactSection["content"],
): Promise<string> {
  await ensureBlobDir(artifactId);
  const blobPath = versionBlobPath(artifactId, versionId);
  await fs.writeFile(blobPath, JSON.stringify(content));
  return `${artifactId}/${versionId}.json`;
}

async function readVersionBlob(contentRef: string): Promise<ArtifactSection["content"] | null> {
  try {
    const blobPath = path.join(VERSION_BLOB_DIR, contentRef);
    const raw = await fs.readFile(blobPath, "utf-8");
    return JSON.parse(raw) as ArtifactSection["content"];
  } catch {
    return null;
  }
}

export async function hydrateVersionContent(
  version: PersistedArtifactSectionVersion,
): Promise<PersistedArtifactSectionVersion | null> {
  if (version.snapshotMode !== "reference" || !version.contentRef) {
    return version;
  }
  const content = await readVersionBlob(version.contentRef);
  if (content === null) return null;
  return { ...version, content };
}

export function normalizeVersion(
  version: PersistedArtifactSectionVersion,
): PersistedArtifactSectionVersion {
  const sizeBytes = version.sizeBytes ?? estimateVersionSizeBytes(version.content);
  const contentHash = version.contentHash ?? hashVersionContent(version.content);
  const snapshotMode: PersistedArtifactSectionVersion["snapshotMode"] =
    version.snapshotMode ??
    (version.contentRef ? "reference" : sizeBytes > MAX_INLINE_VERSION_BYTES ? "reference" : "full");
  return { ...version, sizeBytes, contentHash, snapshotMode };
}

function dedupeVersions(
  versions: PersistedArtifactSectionVersion[],
): PersistedArtifactSectionVersion[] {
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const out: PersistedArtifactSectionVersion[] = [];
  for (const raw of versions.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )) {
    const v = normalizeVersion(raw);
    const hashKey = `${v.sectionId}:${v.contentHash}`;
    if (seenIds.has(v.id) || seenHashes.has(hashKey)) continue;
    seenIds.add(v.id);
    seenHashes.add(hashKey);
    out.push(v);
  }
  return out;
}

export async function listArtifactVersions(
  artifactId: string,
): Promise<PersistedArtifactSectionVersion[]> {
  try {
    await ensureDir();
    const raw = await fs.readFile(versionsPath(artifactId), "utf-8");
    const parsed = JSON.parse(raw) as PersistedArtifactSectionVersion[];
    return dedupeVersions(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

/** List versions with reference blobs loaded for client merge/restore. */
export async function listArtifactVersionsHydrated(
  artifactId: string,
): Promise<PersistedArtifactSectionVersion[]> {
  const versions = await listArtifactVersions(artifactId);
  const hydrated: PersistedArtifactSectionVersion[] = [];
  for (const version of versions) {
    if (version.snapshotMode === "reference" && version.contentRef) {
      const loaded = await hydrateVersionContent(version);
      hydrated.push(loaded ?? version);
    } else {
      hydrated.push(version);
    }
  }
  return hydrated;
}

export async function appendArtifactVersion(
  version: PersistedArtifactSectionVersion,
): Promise<PersistedArtifactSectionVersion[]> {
  await ensureDir();
  let normalized = normalizeVersion(version);
  const sizeBytes = normalized.sizeBytes ?? estimateVersionSizeBytes(normalized.content);

  if (sizeBytes > MAX_INLINE_VERSION_BYTES) {
    const contentRef = await writeVersionBlob(
      normalized.artifactId,
      normalized.id,
      normalized.content,
    );
    normalized = {
      ...normalized,
      content: structuredClone(normalized.content),
      snapshotMode: "reference",
      contentRef,
      snapshotWarning: "Large section stored by reference; restore loads full content from blob store.",
    };
  } else {
    normalized = { ...normalized, snapshotMode: "full" };
  }

  const existing = await listArtifactVersions(normalized.artifactId);
  if (existing.some((v) => v.id === normalized.id)) {
    return existing;
  }
  const hashKey = `${normalized.sectionId}:${normalized.contentHash}`;
  if (existing.some((v) => `${v.sectionId}:${v.contentHash}` === hashKey)) {
    return existing;
  }
  const next = dedupeVersions([...existing, normalized]);
  await fs.writeFile(versionsPath(normalized.artifactId), JSON.stringify(next, null, 2));
  return next;
}

export async function getArtifactVersion(
  artifactId: string,
  versionId: string,
): Promise<PersistedArtifactSectionVersion | null> {
  const all = await listArtifactVersions(artifactId);
  const version = all.find((v) => v.id === versionId) ?? null;
  if (!version) return null;
  return hydrateVersionContent(version);
}

export function buildRestoredSection(
  version: PersistedArtifactSectionVersion,
  fallback?: Pick<ArtifactSection, "label" | "kind">,
): ArtifactSection {
  return {
    id: version.sectionId,
    label: version.sectionLabel ?? fallback?.label ?? version.sectionId,
    kind: version.sectionKind ?? fallback?.kind ?? "text",
    content: structuredClone(version.content),
    copyable: true,
  };
}

export async function restoreArtifactSectionVersion(
  artifactId: string,
  versionId: string,
  fallback?: Pick<ArtifactSection, "label" | "kind">,
): Promise<{ restoredVersion: PersistedArtifactSectionVersion; section: ArtifactSection } | null> {
  const version = await getArtifactVersion(artifactId, versionId);
  if (!version || version.snapshotMode === "metadata_only") return null;
  if (version.content === undefined || version.content === null) return null;
  return {
    restoredVersion: version,
    section: buildRestoredSection(version, fallback),
  };
}

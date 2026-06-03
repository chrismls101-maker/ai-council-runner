import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ArtifactType, IivoArtifact } from "./artifactTypes.js";
import { resolveArtifactById } from "./artifactResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARE_DIR = path.resolve(__dirname, "../../../data/artifact-shares");
const SHARE_BLOB_DIR = path.resolve(__dirname, "../../../data/artifact-share-blobs");

export type ArtifactShareRecord = {
  shareId: string;
  artifactId: string;
  runId?: string;
  title: string;
  type: ArtifactType;
  createdAt: string;
  visibility: "private_link" | "public";
  enabled: boolean;
  snapshotMode?: "inline" | "reference";
  contentRef?: string;
};

export type ArtifactSharePayload = {
  share: ArtifactShareRecord;
  artifact?: IivoArtifact | null;
};

function sharePath(shareId: string): string {
  return path.join(SHARE_DIR, `${shareId}.json`);
}

function shareBlobPath(shareId: string): string {
  return path.join(SHARE_BLOB_DIR, `${shareId}.json`);
}

function newShareId(): string {
  return randomBytes(12).toString("hex");
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SHARE_DIR, { recursive: true });
}

async function ensureBlobDir(): Promise<void> {
  await fs.mkdir(SHARE_BLOB_DIR, { recursive: true });
}

async function writeShareBlob(shareId: string, artifact: IivoArtifact): Promise<void> {
  await ensureBlobDir();
  await fs.writeFile(shareBlobPath(shareId), JSON.stringify(artifact));
}

async function readShareBlob(shareId: string): Promise<IivoArtifact | null> {
  try {
    const raw = await fs.readFile(shareBlobPath(shareId), "utf-8");
    return JSON.parse(raw) as IivoArtifact;
  } catch {
    return null;
  }
}

export function isPublicShareAllowed(): boolean {
  return process.env.IIVO_ALLOW_PUBLIC_SHARE === "1";
}

export async function createArtifactShare(params: {
  artifactId: string;
  title: string;
  type: ArtifactType;
  runId?: string;
  visibility?: ArtifactShareRecord["visibility"];
  artifact?: IivoArtifact;
}): Promise<ArtifactShareRecord> {
  await ensureDir();
  const visibility =
    params.visibility === "public" && isPublicShareAllowed()
      ? "public"
      : "private_link";
  const shareId = newShareId();
  let snapshotMode: ArtifactShareRecord["snapshotMode"];
  let contentRef: string | undefined;

  if (params.artifact) {
    await writeShareBlob(shareId, params.artifact);
    snapshotMode = "reference";
    contentRef = `${shareId}.json`;
  }

  const record: ArtifactShareRecord = {
    shareId,
    artifactId: params.artifactId,
    runId: params.runId,
    title: params.title,
    type: params.type,
    createdAt: new Date().toISOString(),
    visibility,
    enabled: true,
    snapshotMode,
    contentRef,
  };
  await fs.writeFile(sharePath(shareId), JSON.stringify(record, null, 2));
  return record;
}

async function loadShareArtifact(record: ArtifactShareRecord): Promise<IivoArtifact | null> {
  if (record.contentRef) {
    const fromBlob = await readShareBlob(record.shareId);
    if (fromBlob) return fromBlob;
  }
  return resolveArtifactById(record.artifactId, record.runId);
}

export async function getArtifactShare(shareId: string): Promise<ArtifactShareRecord | null> {
  try {
    await ensureDir();
    const raw = await fs.readFile(sharePath(shareId), "utf-8");
    return JSON.parse(raw) as ArtifactShareRecord;
  } catch {
    return null;
  }
}

export async function getArtifactSharePayload(shareId: string): Promise<ArtifactSharePayload | null> {
  const share = await getArtifactShare(shareId);
  if (!share || !share.enabled) return null;
  const artifact = await loadShareArtifact(share);
  return { share, artifact };
}

export async function setArtifactShareEnabled(
  shareId: string,
  enabled: boolean,
): Promise<ArtifactShareRecord | null> {
  const record = await getArtifactShare(shareId);
  if (!record) return null;
  const next = { ...record, enabled };
  await fs.writeFile(sharePath(shareId), JSON.stringify(next, null, 2));
  return next;
}

export async function setArtifactShareVisibility(
  shareId: string,
  visibility: ArtifactShareRecord["visibility"],
): Promise<ArtifactShareRecord | null> {
  const record = await getArtifactShare(shareId);
  if (!record) return null;
  const nextVisibility: ArtifactShareRecord["visibility"] =
    visibility === "public" && isPublicShareAllowed() ? "public" : "private_link";
  const next = { ...record, visibility: nextVisibility };
  await fs.writeFile(sharePath(shareId), JSON.stringify(next, null, 2));
  return next;
}

export async function findShareByArtifactId(
  artifactId: string,
): Promise<ArtifactShareRecord | null> {
  try {
    await ensureDir();
    const files = await fs.readdir(SHARE_DIR);
    let latest: ArtifactShareRecord | null = null;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(SHARE_DIR, file), "utf-8");
      const record = JSON.parse(raw) as ArtifactShareRecord;
      if (record.artifactId === artifactId && record.enabled) {
        if (!latest || record.createdAt > latest.createdAt) latest = record;
      }
    }
    return latest;
  } catch {
    /* ignore */
  }
  return null;
}

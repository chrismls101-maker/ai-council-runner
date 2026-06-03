import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = path.resolve(__dirname, "../../../data/images/generated");
const META_DIR = path.resolve(__dirname, "../../../data/images/metadata");

export type StoredImageRecord = {
  id: string;
  filename: string;
  path: string;
  publicPath: string;
  mimeType: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  provider: string;
  model: string;
  prompt: string;
  createdAt: string;
  sizeBytes?: number;
  sourceArtifactId?: string;
  visualType?: string;
};

async function ensureDirs(): Promise<void> {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  await fs.mkdir(META_DIR, { recursive: true });
}

function metaPath(id: string): string {
  return path.join(META_DIR, `${id}.json`);
}

export function newImageId(): string {
  return `img-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export async function saveGeneratedImage(params: {
  id?: string;
  buffer: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  provider: string;
  model: string;
  prompt: string;
  sourceArtifactId?: string;
  visualType?: string;
}): Promise<StoredImageRecord> {
  await ensureDirs();
  const id = params.id ?? newImageId();
  const ext = params.mimeType === "image/png" ? "png" : "png";
  const filename = `${id}.${ext}`;
  const filePath = path.join(IMAGE_DIR, filename);
  await fs.writeFile(filePath, params.buffer);
  const record: StoredImageRecord = {
    id,
    filename,
    path: filePath,
    publicPath: `/api/images/${id}/file`,
    mimeType: params.mimeType ?? "image/png",
    width: params.width,
    height: params.height,
    aspectRatio: params.aspectRatio,
    provider: params.provider,
    model: params.model,
    prompt: params.prompt,
    createdAt: new Date().toISOString(),
    sizeBytes: params.buffer.length,
    sourceArtifactId: params.sourceArtifactId,
    visualType: params.visualType,
  };
  await fs.writeFile(metaPath(id), JSON.stringify(record, null, 2));
  return record;
}

export async function getStoredImage(id: string): Promise<StoredImageRecord | null> {
  try {
    await ensureDirs();
    const raw = await fs.readFile(metaPath(id), "utf-8");
    return JSON.parse(raw) as StoredImageRecord;
  } catch {
    return null;
  }
}

export async function readStoredImageBuffer(id: string): Promise<Buffer | null> {
  const record = await getStoredImage(id);
  if (!record) return null;
  try {
    return await fs.readFile(record.path);
  } catch {
    return null;
  }
}

export async function deleteStoredImage(id: string): Promise<boolean> {
  const record = await getStoredImage(id);
  if (!record) return false;
  try {
    await fs.unlink(record.path);
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(metaPath(id));
  } catch {
    /* ignore */
  }
  return true;
}

/** Minimal valid 1x1 PNG for mock generation. */
export const MOCK_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUVORK5CYII=",
  "base64",
);

/**
 * Write session audio chunks to userData (main process only).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { audioExtensionForMime, sessionAudioChunkPath } from "../shared/audioPersistence.ts";

export async function saveSessionAudioChunk(
  userDataPath: string,
  sessionId: string,
  eventId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ audioPath: string; audioMimeType: string }> {
  const ext = audioExtensionForMime(mimeType);
  const { dir, fullPath } = sessionAudioChunkPath(userDataPath, sessionId, eventId, ext);
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, buffer);
  return { audioPath: fullPath, audioMimeType: mimeType.split(";")[0]?.trim() || mimeType };
}

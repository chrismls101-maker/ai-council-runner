/**
 * Glass Storage — user-uploaded files (glass-storage/files/).
 */

export type GlassStorageFileRecord = {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: number;
  relativePath: string;
};

export function formatGlassStorageFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

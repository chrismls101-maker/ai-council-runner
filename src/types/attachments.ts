export type ComposerAttachmentKind = "image" | "text" | "file";

export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ComposerAttachmentKind;
  /** Object URL for image preview (revoke when removed). */
  previewUrl?: string;
  /** Extracted text for text-based files. */
  textContent?: string;
}

export const ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxTextCharsPerFile: 12_000,
} as const;

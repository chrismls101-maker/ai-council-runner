import { appendToPrompt } from "./composerContext";
import {
  ATTACHMENT_LIMITS,
  type ComposerAttachment,
  type ComposerAttachmentKind,
} from "../types/attachments";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
  ".log",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".css",
  ".scss",
  ".sql",
  ".sh",
  ".env",
  ".ini",
  ".cfg",
  ".toml",
]);

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function slugId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function classifyFile(file: File): ComposerAttachmentKind {
  if (IMAGE_TYPES.has(file.type) || file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("text/")) return "text";
  if (TEXT_EXTENSIONS.has(extensionOf(file.name))) return "text";
  return "file";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAttachmentSize(bytes: number): string {
  return formatBytes(bytes);
}

async function readTextFile(file: File): Promise<string> {
  const raw = await file.text();
  if (raw.length <= ATTACHMENT_LIMITS.maxTextCharsPerFile) return raw;
  return `${raw.slice(0, ATTACHMENT_LIMITS.maxTextCharsPerFile)}\n\n[Truncated — file exceeded ${ATTACHMENT_LIMITS.maxTextCharsPerFile.toLocaleString()} characters]`;
}

export async function fileToAttachment(file: File): Promise<ComposerAttachment> {
  if (file.size > ATTACHMENT_LIMITS.maxFileSizeBytes) {
    throw new Error(
      `"${file.name}" is too large (${formatBytes(file.size)}). Max ${formatBytes(ATTACHMENT_LIMITS.maxFileSizeBytes)} per file.`,
    );
  }

  const kind = classifyFile(file);
  const base: ComposerAttachment = {
    id: slugId(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind,
  };

  if (kind === "image") {
    return { ...base, previewUrl: URL.createObjectURL(file) };
  }

  if (kind === "text") {
    const textContent = await readTextFile(file);
    return { ...base, textContent };
  }

  return base;
}

export async function filesToAttachments(
  files: File[],
  existingCount = 0,
): Promise<ComposerAttachment[]> {
  const available = ATTACHMENT_LIMITS.maxFiles - existingCount;
  if (available <= 0) {
    throw new Error(`Maximum ${ATTACHMENT_LIMITS.maxFiles} attachments per message.`);
  }

  const slice = files.slice(0, available);
  const results: ComposerAttachment[] = [];
  const errors: string[] = [];

  for (const file of slice) {
    try {
      results.push(await fileToAttachment(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Could not attach file.");
    }
  }

  if (files.length > available) {
    errors.push(`Only ${available} more file(s) can be added (max ${ATTACHMENT_LIMITS.maxFiles}).`);
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  if (errors.length > 0) {
    console.warn(errors.join(" "));
  }

  return results;
}

export function revokeAttachmentUrls(attachments: ComposerAttachment[]): void {
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

export function formatAttachmentsBlock(attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return "";

  const sections: string[] = ["Attached Files:"];

  for (const attachment of attachments) {
    sections.push(`---\nFile: ${attachment.name} (${formatBytes(attachment.size)})`);

    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      sections.push(attachment.textContent.trim());
    } else if (attachment.kind === "image") {
      sections.push(
        "[Image attached. Refer to the user's message for what they want analyzed about this image.]",
      );
    } else {
      sections.push(
        `[Binary file attached (${attachment.mimeType || "unknown type"}). Content not extracted.]`,
      );
    }
  }

  return sections.join("\n");
}

export function buildPromptWithAttachments(
  prompt: string,
  attachments: ComposerAttachment[],
): string {
  const block = formatAttachmentsBlock(attachments);
  if (!block) return prompt.trim();
  if (!prompt.trim()) return block;
  return appendToPrompt(prompt, block);
}

export function collectFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  if (dataTransfer.files?.length) {
    for (const file of Array.from(dataTransfer.files)) {
      files.push(file);
    }
  }
  return files;
}

export function isFileDragEvent(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

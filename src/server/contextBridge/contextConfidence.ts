import type { ContextItemType } from "./types.js";

export type SourceConfidenceKind =
  | "user_pasted"
  | "imported_url"
  | "evidence"
  | "file"
  | "screenshot";

export function sourceConfidenceFromType(type: ContextItemType): SourceConfidenceKind {
  switch (type) {
    case "pasted_text":
      return "user_pasted";
    case "url":
      return "imported_url";
    case "evidence":
      return "evidence";
    case "file":
      return "file";
    case "screenshot":
      return "screenshot";
    default:
      return "user_pasted";
  }
}

export function sourceConfidenceLabel(kind: SourceConfidenceKind): string {
  switch (kind) {
    case "user_pasted":
      return "User-pasted context";
    case "imported_url":
      return "Imported URL";
    case "evidence":
      return "Saved evidence";
    case "file":
      return "File upload";
    case "screenshot":
      return "Screenshot";
  }
}

export function sourceConfidenceDetail(kind: SourceConfidenceKind): string {
  switch (kind) {
    case "user_pasted":
      return "User-provided, not independently verified";
    case "imported_url":
      return "Source-backed; extraction may be incomplete";
    case "evidence":
      return "Saved user evidence; not automatically verified";
    case "file":
      return "File content; coming soon";
    case "screenshot":
      return "Screenshot content; coming soon";
  }
}

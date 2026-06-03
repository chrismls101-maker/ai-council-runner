import type { IivoArtifact } from "../types/artifacts";
import type { ArtifactShareRecord } from "./artifactApi";
import { artifactFullText } from "./artifactClipboard";

export function artifactShareSummary(artifact: IivoArtifact): string {
  const lines = [artifact.title, artifact.type.replace(/_/g, " "), ""];
  if (artifact.summary) lines.push(artifact.summary, "");
  lines.push(artifactFullText(artifact).slice(0, 4000));
  return lines.join("\n").trim();
}

export function artifactDeepLink(runId: string | null | undefined, artifactId: string): string | null {
  if (!runId || typeof window === "undefined") return null;
  const base = window.location.origin + window.location.pathname;
  return `${base}?run=${encodeURIComponent(runId)}&artifact=${encodeURIComponent(artifactId)}`;
}

export function artifactShareUrl(shareId: string): string {
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}?share=${encodeURIComponent(shareId)}`;
}

export function parseShareIdFromLocation(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("share");
}

export function clearShareIdFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("share")) return;
  url.searchParams.delete("share");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function isPublicShareEnabled(): boolean {
  return import.meta.env.VITE_IIVO_ALLOW_PUBLIC_SHARE === "1";
}

export function shareLinkLabel(record: ArtifactShareRecord): string {
  if (record.visibility === "public") {
    return "Public link — anyone with the link may view if this app is accessible.";
  }
  return "Private link — anyone with the link may view if this app is accessible.";
}

export function hasPermanentArtifactLink(
  runId: string | null | undefined,
  shareId?: string | null,
): boolean {
  return Boolean(runId?.trim() || shareId?.trim());
}

import type { IivoArtifact } from "../types/artifacts";
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

export function hasPermanentArtifactLink(runId: string | null | undefined): boolean {
  return Boolean(runId?.trim());
}

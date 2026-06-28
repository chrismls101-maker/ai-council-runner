import type { DesignStack, DesignToCodeAction } from "../../shared/designToCode.ts";
import type { DesignScreenSpec, DesignToCodeSession } from "../../shared/designToCode.ts";
import { DESIGN_STACK_LABELS } from "../../shared/designToCode.ts";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatCaptureTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "capture";
}

function inferredComponentLabel(spec?: DesignScreenSpec): string | null {
  if (!spec) return null;
  const first = spec.components?.[0]?.trim();
  if (first) return first;
  if (spec.screenType && spec.screenType !== "unknown") {
    return spec.screenType.replace(/_/g, " ");
  }
  return null;
}

export function titleForDesignToCodeProject(
  session: DesignToCodeSession,
  action: DesignToCodeAction,
): string {
  const fileName = session.detectedFile?.fileName?.trim();
  if (fileName) {
    return `${fileName} — Design to Code`;
  }
  const label = inferredComponentLabel(session.screenSpec);
  if (label) {
    return `${label} — Design to Code`;
  }
  const stackLabel = DESIGN_STACK_LABELS[session.selectedStack] ?? session.selectedStack;
  if (action === "describe") {
    return `Design Capture — Describe`;
  }
  if (action === "html") {
    return `Design Capture — HTML`;
  }
  return `Design Capture — ${stackLabel}`;
}

export function projectFolderName(session: DesignToCodeSession, title: string): string {
  const stamp = formatCaptureTimestamp(session.createdAt);
  const slug = slugify(title);
  return `${stamp}_${slug}`;
}

export function primaryOutputFileName(
  action: DesignToCodeAction,
  stack: DesignStack,
): string {
  if (action === "describe") return "result.md";
  if (action === "html") return "result.html";
  if (stack === "vue" || stack === "nuxt") return "result.vue";
  if (stack === "svelte") return "result.svelte";
  if (stack === "angular") return "result.component.ts";
  return "result.tsx";
}

export function summaryForDesignToCodeProject(
  action: DesignToCodeAction,
  stack: DesignStack,
): string {
  const stackLabel = DESIGN_STACK_LABELS[stack] ?? stack;
  switch (action) {
    case "react":
      return `React component · ${stackLabel}`;
    case "html":
      return "HTML / CSS";
    case "describe":
      return "Screen description";
    case "match-codebase":
      return `Match codebase · ${stackLabel}`;
    default:
      return "Design to Code";
  }
}

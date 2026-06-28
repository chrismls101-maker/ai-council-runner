/**
 * Design-to-Code pipeline types — shared, no Electron imports.
 */

export type DesignToCodeAction = "react" | "html" | "describe" | "match-codebase";

/** Future actions — architecture-ready, not exposed in UI yet. */
export type DesignFutureAction =
  | "extract-spec"
  | "build-from-crop"
  | "find-components"
  | "make-responsive"
  | "use-design-system"
  | "diff-against-file";

export type DesignStack =
  | "react-tsx"
  | "react-tailwind"
  | "next-tailwind"
  | "vue"
  | "nuxt"
  | "svelte"
  | "solid"
  | "astro"
  | "remix"
  | "react-native"
  | "html-css"
  | "angular";

export type DesignCaptureQualityIssue =
  | "blurry"
  | "low_contrast"
  | "tiny_text"
  | "partial_capture"
  | "overlay_present"
  | "low_signal";

export type DesignCaptureQuality = {
  readable: boolean;
  confidence: number;
  issues: DesignCaptureQualityIssue[];
  recommendation?: string;
};

export type DesignScreenRegion = {
  id: string;
  role: string;
  bounds?: { x: number; y: number; width: number; height: number };
  label?: string;
};

export type DesignScreenSpec = {
  screenType: string;
  confidence: number;
  warnings: string[];
  visibleRegions: DesignScreenRegion[];
  layoutTree: string;
  components: string[];
  repeatedPatterns: string[];
  textContent: string[];
  palette: string[];
  typography: string[];
  spacing: string[];
  borders: string[];
  shadows: string[];
  interactionAffordances: string[];
  estimatedResponsiveness: string;
  uncertainAreas: string[];
};

export type CodebaseStylePack = {
  confidence: "full" | "degraded" | "none";
  framework?: string;
  language?: string;
  stylingSystem?: string;
  componentPatterns?: string[];
  namingPatterns?: string[];
  importConventions?: string[];
  pathAliasConventions?: string[];
  designTokens?: string[];
  uiLibraries?: string[];
  utilityHelpers?: string[];
  lintAndFormatSignals?: string[];
  similarLocalComponents?: Array<{ fileName: string; snippet?: string }>;
  openFileContext?: {
    fileName: string;
    language: string;
    filePath: string;
    contentExcerpt?: string;
  };
  importedFileSummaries?: Array<{ fileName: string; language: string }>;
  packageJsonSummary?: string;
  tailwindSummary?: string;
  tsconfigPathsSummary?: string;
};

export type DesignToCodePhase =
  | "ready"
  | "captured"
  | "awaiting_permission"
  | "permission" // legacy alias
  | "reading"
  | "analyzing"
  | "generating"
  | "verifying"
  | "done"
  | "failed";

export type DesignDetectedFile = {
  fileName: string;
  filePath: string | null;
  language: string;
};

export type DesignToCodeSession = {
  id: string;
  feedItemId: string;
  imageDataUrl: string;
  createdAt: number;
  activeApp?: string;
  activeWindowTitle?: string;
  detectedEditor?: string;
  detectedFile?: DesignDetectedFile | null;
  selectedStack: DesignStack;
  selectedAction?: DesignToCodeAction;
  quality?: DesignCaptureQuality;
  screenSpec?: DesignScreenSpec;
  codebaseStylePack?: CodebaseStylePack;
  latestPrompt?: string;
  latestResult?: string;
  latestWarnings?: string[];
  latestResponseFeedItemId?: string;
  qualityAcknowledged?: boolean;
  refinementHistory: Array<{ text: string; createdAt: number }>;
  phase: DesignToCodePhase;
  pendingAction?: DesignToCodeAction;
  pendingRefinementFeedback?: string;
  statusLine?: string;
  fileReadGranted?: boolean;
  /** Linked Glass Storage project (stable id = feedItemId). */
  glassProjectId?: string;
  glassProjectSaveStatus?: "pending" | "saved" | "failed";
  glassProjectSaveError?: string;
};

export type ImportedFileContext = {
  fileName: string;
  language: string;
  filePath: string;
  content: string;
};

export type DesignToCodeContext = {
  fileName: string | null;
  language: string | null;
  filePath: string | null;
  content: string | null;
  importedFiles?: ImportedFileContext[];
};

export type DesignGenerationInput = {
  action: DesignToCodeAction;
  stack: DesignStack;
  screenSpec: DesignScreenSpec;
  stylePack?: CodebaseStylePack;
  ctx: DesignToCodeContext;
  refinementFeedback?: string;
  refinementHistory?: Array<{ text: string; createdAt: number }>;
  priorGeneratedCode?: string;
};

export type DesignVerificationResult = {
  ok: boolean;
  severity: "none" | "minor" | "severe";
  issues: string[];
  repairHint?: string;
};

export function normalizeDesignPhase(phase: DesignToCodePhase): DesignToCodePhase {
  if (phase === "permission") return "awaiting_permission";
  return phase;
}

export function isDesignPhaseWorking(phase: DesignToCodePhase): boolean {
  const p = normalizeDesignPhase(phase);
  return (
    p === "awaiting_permission"
    || p === "reading"
    || p === "analyzing"
    || p === "generating"
    || p === "verifying"
  );
}

export function isCodeGeneratingAction(action: DesignToCodeAction): boolean {
  return action === "react" || action === "html" || action === "match-codebase";
}

import {
  buildGenerationPrompt,
  buildRepairPrompt,
  isCodeGeneratingAction,
  normalizeDesignPhase,
  type DesignStack,
  type DesignToCodeAction,
  type DesignToCodeContext,
} from "../../shared/designToCode.ts";
import { extractFirstCodeBlock } from "../../shared/markdownCode.ts";
import { readFileForDiff } from "../glassActions.ts";
import {
  buildCodebaseStylePack,
  loadImportedFilesForDesign,
} from "./designCodebaseStylePack.ts";
import { buildDesignScreenSpec } from "./designScreenSpecBuilder.ts";
import {
  appendRefinement,
  getDesignSession,
  logDesignPhase,
  patchDesignSession,
  resolveStack,
  type DesignGenerateCommand,
} from "./designToCodeSessionStore.ts";
import { verificationWarnings, verifyGeneratedCode } from "./designVerificationService.ts";

export type DesignSubmitResult = {
  fullAnswer: string;
  responseFeedItemId: string;
};

export type DesignGenerationDeps = {
  push: () => void;
  submitCommand: (
    prompt: string,
    lensContext: null,
    opts: {
      presetImageDataUrl: string;
      codeFilePath?: string;
      designAction: DesignToCodeAction;
      designStack: DesignStack;
      designCaptureId: string;
      taskComplexity?: "fast" | "standard" | "deep";
    },
  ) => Promise<DesignSubmitResult | undefined>;
  runSilentVisualAsk: (
    prompt: string,
    imageDataUrl: string,
    opts?: { taskComplexity?: "standard" | "deep" },
  ) => Promise<string | undefined>;
  updateResponseFeedItem: (
    responseFeedItemId: string,
    overlayBody: string,
    fullBody: string,
    designWarnings?: string[],
  ) => void;
  getSessionId?: () => string;
  onPipelineComplete?: (input: {
    feedItemId: string;
    action: DesignToCodeAction;
    stack: DesignStack;
    fullBody: string;
  }) => Promise<void>;
  onPipelineFailed?: (input: {
    feedItemId: string;
    reason: "generation" | "exception";
    error?: string;
  }) => void;
};

async function loadFileContext(
  filePath: string,
): Promise<{ content: string | null; importedFiles: import("../../shared/designToCode.ts").ImportedFileContext[] }> {
  try {
    const result = await readFileForDiff(filePath);
    if (!result.ok || !result.existed) {
      return { content: null, importedFiles: [] };
    }
    const content =
      result.content.length > 4_000
        ? `${result.content.slice(0, 4_000)}\n…(truncated)`
        : result.content;
    const importedFiles = await loadImportedFilesForDesign(filePath, result.content);
    return { content, importedFiles };
  } catch {
    return { content: null, importedFiles: [] };
  }
}

export async function runDesignGenerationPipeline(
  state: {
    designCaptures?: import("./designToCodeSessionStore.ts").DesignCapturesState;
    glassSettings?: { designStack?: DesignStack };
  },
  feedItemId: string,
  action: DesignToCodeAction,
  readFile: boolean,
  deps: DesignGenerationDeps,
  opts?: { refinementFeedback?: string },
): Promise<void> {
  let session = getDesignSession(state, feedItemId);
  if (!session) return;

  try {
  const stack = resolveStack(state, session);
  const filePath = session.detectedFile?.filePath ?? null;
  let fileContent: string | null = null;
  let importedFiles: import("../../shared/designToCode.ts").ImportedFileContext[] = [];

  const shouldLoadFileContext =
    !!filePath
    && (readFile || (session.fileReadGranted && action === "match-codebase"));

  if (shouldLoadFileContext) {
    if (readFile) {
      patchDesignSession(state, feedItemId, {
        phase: "reading",
        statusLine: `Reading ${session.detectedFile!.fileName}…`,
        fileReadGranted: true,
      });
      deps.push();
    }
    const loaded = await loadFileContext(filePath);
    fileContent = loaded.content;
    importedFiles = loaded.importedFiles;
  } else if (action === "match-codebase" && !readFile && !session.fileReadGranted) {
    patchDesignSession(state, feedItemId, { fileReadGranted: false });
  }

  session = getDesignSession(state, feedItemId)!;

  const retainedQualityWarning =
    !session.qualityAcknowledged && session.quality?.recommendation
      ? [session.quality.recommendation]
      : [];

  patchDesignSession(state, feedItemId, {
    phase: "analyzing",
    statusLine: "Analyzing layout…",
    selectedAction: action,
    selectedStack: stack,
    pendingRefinementFeedback: undefined,
    latestWarnings: retainedQualityWarning.length ? retainedQualityWarning : undefined,
    glassProjectSaveStatus: undefined,
    glassProjectSaveError: undefined,
  });
  deps.push();
  logDesignPhase(feedItemId, "analyzing");

  let screenSpec = session.screenSpec;
  if (!screenSpec) {
    screenSpec = await buildDesignScreenSpec(session.imageDataUrl, {
      sessionId: deps.getSessionId?.(),
    });
    patchDesignSession(state, feedItemId, { screenSpec });
  }

  session = getDesignSession(state, feedItemId)!;

  let stylePack = session.codebaseStylePack;
  if (action === "match-codebase") {
    if (!stylePack) {
      const ctxForPack: DesignToCodeContext = {
        fileName: session.detectedFile?.fileName ?? null,
        language: session.detectedFile?.language ?? null,
        filePath,
        content: fileContent,
        importedFiles: importedFiles.length ? importedFiles : undefined,
      };
      stylePack = await buildCodebaseStylePack({
        ctx: ctxForPack,
        importedFiles,
        readFileGranted: Boolean(session.fileReadGranted || readFile) && !!filePath,
        stackFallback: stack,
      });
      patchDesignSession(state, feedItemId, { codebaseStylePack: stylePack });
      if (stylePack.confidence === "degraded" || stylePack.confidence === "none") {
        const warn =
          stylePack.confidence === "none"
            ? "Skipped file read — convention matching may be limited."
            : "Limited codebase context — convention matching may be partial.";
        const current = getDesignSession(state, feedItemId);
        patchDesignSession(state, feedItemId, {
          latestWarnings: [...(current?.latestWarnings ?? retainedQualityWarning), warn],
        });
      }
    }
  }

  session = getDesignSession(state, feedItemId)!;

  const ctx: DesignToCodeContext = {
    fileName: session.detectedFile?.fileName ?? null,
    language: session.detectedFile?.language ?? null,
    filePath,
    content: fileContent,
    importedFiles: importedFiles.length ? importedFiles : undefined,
  };

  if (opts?.refinementFeedback?.trim()) {
    appendRefinement(state, feedItemId, opts.refinementFeedback.trim());
    session = getDesignSession(state, feedItemId)!;
  }

  const prompt = buildGenerationPrompt({
    action,
    stack,
    screenSpec: session.screenSpec!,
    stylePack,
    ctx,
    refinementFeedback: opts?.refinementFeedback,
    refinementHistory: session.refinementHistory,
    priorGeneratedCode: session.latestResult,
  });

  patchDesignSession(state, feedItemId, {
    phase: "generating",
    statusLine: "Generating…",
    latestPrompt: prompt,
    pendingAction: action,
  });
  deps.push();
  logDesignPhase(feedItemId, "generating", action);

  const submitResult = await deps.submitCommand(prompt, null, {
    presetImageDataUrl: session.imageDataUrl,
    codeFilePath: filePath ?? undefined,
    designAction: action,
    designStack: stack,
    designCaptureId: feedItemId,
    taskComplexity: action === "match-codebase" ? "deep" : "standard",
  });

  if (!submitResult) {
    patchDesignSession(state, feedItemId, {
      phase: "failed",
      statusLine: "Generation failed — try again.",
    });
    deps.push();
    deps.onPipelineFailed?.({ feedItemId, reason: "generation" });
    return;
  }

  patchDesignSession(state, feedItemId, {
    latestResponseFeedItemId: submitResult.responseFeedItemId,
  });

  if (isCodeGeneratingAction(action)) {
    await runPostGenerationVerification(
      state,
      feedItemId,
      action,
      submitResult.fullAnswer,
      submitResult.responseFeedItemId,
      deps,
    );
  } else {
    patchDesignSession(state, feedItemId, {
      phase: "done",
      statusLine: undefined,
      latestResult: submitResult.fullAnswer,
      pendingRefinementFeedback: undefined,
    });
    deps.push();
    logDesignPhase(feedItemId, "done");
    await deps.onPipelineComplete?.({
      feedItemId,
      action,
      stack,
      fullBody: submitResult.fullAnswer,
    });
  }
  } catch (err) {
    console.error(`[DesignToCode] ${feedItemId} pipeline error:`, err);
    patchDesignSession(state, feedItemId, {
      phase: "failed",
      statusLine: "Generation failed — try again.",
    });
    deps.push();
    deps.onPipelineFailed?.({
      feedItemId,
      reason: "exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function handleDesignGenerateCommand(
  state: {
    designCaptures?: import("./designToCodeSessionStore.ts").DesignCapturesState;
    glassSettings?: { designStack?: DesignStack };
  },
  command: DesignGenerateCommand,
  deps: DesignGenerationDeps,
): void {
  const { feedItemId, action, refinementFeedback } = command;
  const session = getDesignSession(state, feedItemId);
  if (!session) return;

  const phase = normalizeDesignPhase(session.phase);
  if (
    phase !== "ready"
    && phase !== "captured"
    && phase !== "done"
    && phase !== "failed"
  ) {
    return;
  }

  if (
    action === "match-codebase"
    && session.detectedFile?.filePath
    && !session.fileReadGranted
  ) {
    patchDesignSession(state, feedItemId, {
      phase: "awaiting_permission",
      pendingAction: action,
      pendingRefinementFeedback: refinementFeedback,
      statusLine: `Allow Glass to read ${session.detectedFile.fileName}?`,
    });
    deps.push();
    return;
  }

  patchDesignSession(state, feedItemId, {
    phase: "analyzing",
    statusLine: "Starting…",
    selectedAction: action,
  });
  deps.push();

  void runDesignGenerationPipeline(state, feedItemId, action, false, deps, {
    refinementFeedback,
  });
}

export async function runPostGenerationVerification(
  state: {
    designCaptures?: import("./designToCodeSessionStore.ts").DesignCapturesState;
    glassSettings?: { designStack?: DesignStack };
  },
  feedItemId: string,
  action: DesignToCodeAction,
  generatedBody: string,
  responseFeedItemId: string,
  deps: DesignGenerationDeps,
): Promise<string> {
  const session = getDesignSession(state, feedItemId);
  if (!session || !isCodeGeneratingAction(action)) {
    return generatedBody;
  }

  const code = extractFirstCodeBlock(generatedBody) ?? generatedBody;

  if (!session.screenSpec) {
    patchDesignSession(state, feedItemId, {
      phase: "done",
      statusLine: undefined,
      latestResult: code,
      pendingRefinementFeedback: undefined,
    });
    deps.push();
    logDesignPhase(feedItemId, "done");
    const stack = resolveStack(state, session);
    await deps.onPipelineComplete?.({
      feedItemId,
      action,
      stack,
      fullBody: generatedBody,
    });
    return generatedBody;
  }

  patchDesignSession(state, feedItemId, {
    phase: "verifying",
    statusLine: "Checking fidelity…",
    latestResult: code,
  });
  deps.push();
  logDesignPhase(feedItemId, "verifying");

  const result = await verifyGeneratedCode({
    spec: session.screenSpec,
    action,
    generatedCode: code,
    imageDataUrl: session.imageDataUrl,
    sessionId: deps.getSessionId?.(),
  });

  let warnings = verificationWarnings(result);
  let finalBody = generatedBody;

  if (!result.ok && result.severity === "severe" && session.latestPrompt) {
    const repairPrompt = buildRepairPrompt(
      session.latestPrompt,
      result.repairHint ?? "Fix layout and structure mismatches.",
      result.issues,
    );
    logDesignPhase(feedItemId, "repair", "single pass");
    patchDesignSession(state, feedItemId, {
      phase: "generating",
      statusLine: "Repairing output…",
    });
    deps.push();
    const repaired = await deps.runSilentVisualAsk(
      repairPrompt,
      session.imageDataUrl,
      { taskComplexity: "deep" },
    );
    if (repaired) {
      finalBody = repaired;
      warnings = [...warnings, "Auto-repair pass applied"];
    }
  } else if (!result.ok) {
    warnings = [...warnings, ...(result.repairHint ? [result.repairHint] : [])];
  }

  const finalCode = extractFirstCodeBlock(finalBody) ?? code;
  const allWarnings = [...(session.latestWarnings ?? []), ...warnings];
  patchDesignSession(state, feedItemId, {
    phase: "done",
    statusLine: undefined,
    latestWarnings: allWarnings,
    latestResult: finalCode,
    pendingRefinementFeedback: undefined,
  });
  deps.push();
  logDesignPhase(feedItemId, "done");

  if (allWarnings.length || finalBody !== generatedBody) {
    const overlayBody =
      finalBody.length > 600 ? `${finalBody.slice(0, 597)}…` : finalBody;
    deps.updateResponseFeedItem(
      responseFeedItemId,
      overlayBody,
      finalBody,
      allWarnings.length ? allWarnings : undefined,
    );
  }

  const stack = resolveStack(state, getDesignSession(state, feedItemId)!);
  await deps.onPipelineComplete?.({
    feedItemId,
    action,
    stack,
    fullBody: finalBody,
  });

  return finalBody;
}

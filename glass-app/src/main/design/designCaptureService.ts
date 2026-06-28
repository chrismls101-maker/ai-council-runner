import type { GlassCommandFeedItem } from "../../shared/commandFeed.ts";
import type { GlassState } from "../../shared/ipc.ts";
import {
  isEditorAppName,
  detectLanguage,
  parseFileNameFromTitle,
  readCodeContext,
} from "./designEditorDetection.ts";
import { analyzeCaptureQuality } from "./designQualityAnalyzer.ts";
import {
  getDesignSession,
  logDesignPhase,
  patchDesignSession,
  writeDesignSession,
  type DesignCapturesState,
} from "./designToCodeSessionStore.ts";
import { DEFAULT_DESIGN_STACK } from "../../shared/designToCode.ts";

export type DesignCaptureDeps = {
  handleCapture: () => Promise<string | null | undefined>;
  getWindowContext: () => GlassState["windowContext"];
  getDesignStack: () => import("../../shared/designToCode.ts").DesignStack;
  createFeedItem: (
    kind: "design-capture",
    prompt: string,
    opts: { designImageDataUrl: string; designDetectedFileName?: string },
  ) => GlassCommandFeedItem;
  pushFeed: (item: GlassCommandFeedItem) => void;
  push: () => void;
  updateFeedThumbnail?: (feedItemId: string, imageDataUrl: string) => void;
};

function initSessionState(state: { designCaptures?: DesignCapturesState }): void {
  if (!state.designCaptures) state.designCaptures = {};
}

export async function startDesignCapture(
  state: {
    designCaptures?: DesignCapturesState;
    windowContext: GlassState["windowContext"];
    glassSettings?: GlassState["glassSettings"];
  },
  deps: DesignCaptureDeps,
): Promise<void> {
  const imageDataUrl = await deps.handleCapture();
  if (!imageDataUrl) return;

  const wCtx = deps.getWindowContext();
  const appName = wCtx.status === "available" ? (wCtx.appName ?? null) : null;
  const windowTitle = wCtx.status === "available" ? (wCtx.windowTitle ?? null) : null;

  let detectedFile: { fileName: string; filePath: string | null; language: string } | null = null;
  if (isEditorAppName(appName)) {
    const fileName = parseFileNameFromTitle(windowTitle);
    if (fileName) {
      detectedFile = { fileName, filePath: null, language: detectLanguage(fileName) };
    }
  }

  const quality = analyzeCaptureQuality(imageDataUrl);
  const feedItem = deps.createFeedItem("design-capture", "", {
    designImageDataUrl: imageDataUrl,
    designDetectedFileName: detectedFile?.fileName,
  });
  const captureId = feedItem.id;

  initSessionState(state);
  writeDesignSession(state, {
    id: captureId,
    feedItemId: captureId,
    imageDataUrl,
    createdAt: Date.now(),
    activeApp: appName ?? undefined,
    activeWindowTitle: windowTitle ?? undefined,
    detectedEditor: isEditorAppName(appName) ? (appName ?? undefined) : undefined,
    detectedFile,
    selectedStack: deps.getDesignStack() ?? DEFAULT_DESIGN_STACK,
    quality,
    refinementHistory: [],
    qualityAcknowledged: false,
    phase: quality.readable ? "ready" : "captured",
    latestWarnings: quality.recommendation ? [quality.recommendation] : undefined,
  });

  logDesignPhase(captureId, "captured", `quality=${quality.confidence}`);
  deps.pushFeed(feedItem);
  deps.push();

  if (detectedFile && appName && windowTitle) {
    readCodeContext({ appName, windowTitle, hintPaths: [] })
      .then((ctx) => {
        if (ctx?.filePath && state.designCaptures?.[captureId]?.detectedFile) {
          patchDesignSession(state, captureId, {
            detectedFile: {
              fileName: ctx.fileName,
              filePath: ctx.filePath,
              language: ctx.language,
            },
          });
          deps.push();
        }
      })
      .catch(() => undefined);
  }
}

export async function recaptureDesignSession(
  state: {
    designCaptures?: DesignCapturesState;
    windowContext: GlassState["windowContext"];
  },
  feedItemId: string,
  deps: DesignCaptureDeps,
): Promise<void> {
  const session = getDesignSession(state, feedItemId);
  if (!session) return;

  const imageDataUrl = await deps.handleCapture();
  if (!imageDataUrl) return;

  const quality = analyzeCaptureQuality(imageDataUrl);
  patchDesignSession(state, feedItemId, {
    imageDataUrl,
    quality,
    screenSpec: undefined,
    codebaseStylePack: undefined,
    latestPrompt: undefined,
    latestResult: undefined,
    latestResponseFeedItemId: undefined,
    refinementHistory: [],
    qualityAcknowledged: false,
    latestWarnings: quality.recommendation ? [quality.recommendation] : undefined,
    phase: quality.readable ? "ready" : "captured",
    statusLine: undefined,
    pendingAction: undefined,
    pendingRefinementFeedback: undefined,
    glassProjectId: undefined,
    glassProjectSaveStatus: undefined,
    glassProjectSaveError: undefined,
  });

  deps.updateFeedThumbnail?.(feedItemId, imageDataUrl);
  logDesignPhase(feedItemId, "recaptured", `quality=${quality.confidence}`);
  deps.push();
}

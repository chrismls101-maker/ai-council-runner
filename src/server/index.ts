import { logApiKeyStatus, logImageVisionStatus } from "./loadEnv.js";
import { logConfiguredModels } from "./config/models.js";
import {
  logConfiguredTokenModes,
} from "./config/tokenModes.js";
import { WORKFLOW_OPTIONS } from "./config/workflows.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  deleteRunHistory,
  exportAllRunHistory,
  deleteAllRunHistory,
  getRunHistory,
  listRunHistory,
  patchRunArtifactTrace,
  updateRunOutcome,
} from "./history/runHistory.js";
import { regenerateArtifactSection } from "./artifacts/regenerateArtifactSection.js";
import type { ArtifactType } from "./artifacts/artifactTypes.js";
import {
  resolveExecutionMode,
  type ExecutionMode,
} from "./executionMode/executionMode.js";
import { selectArtifactType } from "./artifacts/artifactSelector.js";
import { resolveResponsePlan } from "./responseContracts/resolveResponsePlan.js";
import {
  createMemory,
  deleteMemory,
  deleteAllMemories,
  exportAllMemories,
  getMemory,
  listMemories,
  listProjectNames,
  searchMemoriesApi,
  updateMemory,
  validateMemoryPayload,
} from "./memory/memoryStore.js";
import {
  createContextItem,
  deleteContextItem,
  getContextItem,
  listContextItems,
  updateContextItem,
} from "./contextBridge/contextStore.js";
import {
  contextScreenshotExists,
  saveContextScreenshot,
  screenshotAbsolutePath,
} from "./contextBridge/screenshotStore.js";
import { importUrlContent } from "./contextBridge/urlImporter.js";
import type { CreateContextItemInput } from "./contextBridge/types.js";
import { getImageVisionConfig } from "./config/vision.js";
import { runVisionAnswer } from "./agents/runVisionAnswer.js";
import {
  appendAuditEvent,
  clearAuditLog,
  exportAuditLog,
  isClientAuditEvent,
  listAuditEvents,
} from "./audit/auditLog.js";
import {
  runCouncilFull,
  stopRun,
  validateApiKeys,
} from "./orchestrator/runCouncil.js";
import type { OutcomeStatus } from "./decisionQuality/types.js";
import type { ProgressEvent, RunCouncilRequest } from "./types/index.js";
import { estimateCredits, getCreditCostTable } from "./usage/creditRules.js";
import {
  addLocalCredits,
  appendUsageEvent,
  exportUsageEvents,
  getUsageSummary,
  listUsageEvents,
  resetLocalCredits,
  setLocalCredits,
} from "./usage/usageStore.js";
import { checkCreditsAvailable, logCreditEstimate } from "./usage/usageGuards.js";
import { InsufficientCreditsError } from "./usage/types.js";
import {
  createBenchmarkRun,
  estimateBenchmarkRun,
} from "./benchmarks/createBenchmark.js";
import {
  deleteBenchmarkRun,
  getBenchmarkRun,
  listBenchmarkRuns,
  updateBenchmarkRun,
} from "./benchmarks/benchmarkStore.js";
import { BENCHMARK_PROMPTS } from "../constants/benchmarkPrompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  const missing = validateApiKeys();
  res.json({ ok: missing.length === 0, missingKeys: missing });
});

app.get("/api/workflows", (_req, res) => {
  res.json({
    workflows: [
      { value: "auto", label: "Auto Router", purpose: "Automatically select the best workflow" },
      ...WORKFLOW_OPTIONS,
    ],
  });
});

app.get("/api/history", async (_req, res) => {
  const runs = await listRunHistory();
  res.json({ runs });
});

app.get("/api/history/:runId", async (req, res) => {
  const entry = await getRunHistory(req.params.runId);
  if (!entry) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(entry);
});

app.delete("/api/history/:runId", async (req, res) => {
  const deleted = await deleteRunHistory(req.params.runId);
  if (deleted) {
    await appendAuditEvent({
      eventType: "history_deleted",
      runId: req.params.runId,
    });
  }
  res.json({ deleted });
});

app.delete("/api/history/all", async (_req, res) => {
  const deleted = await deleteAllRunHistory();
  await appendAuditEvent({
    eventType: "all_history_deleted",
    metadata: `${deleted} runs deleted`,
  });
  res.json({ deleted });
});

app.post("/api/export/history", async (_req, res) => {
  const runs = await exportAllRunHistory();
  await appendAuditEvent({
    eventType: "export_history",
    metadata: `${runs.length} runs exported`,
  });
  res.json({ exportedAt: new Date().toISOString(), runs });
});

app.patch("/api/history/:runId/artifact-trace", async (req, res) => {
  const { builderModeAccepted } = req.body as { builderModeAccepted?: boolean };
  if (typeof builderModeAccepted !== "boolean") {
    res.status(400).json({ error: "builderModeAccepted (boolean) is required" });
    return;
  }
  const updated = await patchRunArtifactTrace(req.params.runId, { builderModeAccepted });
  if (!updated) {
    res.status(404).json({ error: "Run not found or has no execution trace" });
    return;
  }
  res.json({ ok: true, executionTrace: updated.executionTrace });
});

app.post("/api/artifacts/section", async (req, res) => {
  const {
    userPrompt,
    artifactType,
    sectionLabel,
    sectionContent,
    fullAnswer,
    action,
    editInstruction,
    variantType,
    tokenMode,
  } = req.body as {
    userPrompt?: string;
    artifactType?: ArtifactType;
    sectionLabel?: string;
    sectionContent?: string;
    fullAnswer?: string;
    action?: "regenerate" | "edit";
    editInstruction?: string;
    variantType?: import("./artifacts/regenerateArtifactSection.js").SectionVariantType;
    tokenMode?: import("./config/tokenModes.js").TokenMode;
  };

  if (
    !userPrompt?.trim() ||
    !artifactType ||
    !sectionLabel?.trim() ||
    !sectionContent?.trim() ||
    !fullAnswer?.trim() ||
    (action !== "regenerate" && action !== "edit")
  ) {
    res.status(400).json({ error: "Missing required fields for section update" });
    return;
  }

  const missing = validateApiKeys();
  if (missing.length > 0) {
    res.status(503).json({
      error: `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
    });
    return;
  }

  try {
    const content = await regenerateArtifactSection({
      userPrompt: userPrompt.trim(),
      artifactType,
      sectionLabel: sectionLabel.trim(),
      sectionContent: sectionContent.trim(),
      fullAnswer: fullAnswer.trim(),
      action,
      editInstruction: editInstruction?.trim(),
      variantType,
      tokenMode,
    });
    res.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/artifacts/transform", async (req, res) => {
  const { artifact, transformType, userPrompt, sourceSectionIds, tokenMode, sourceRunId } =
    req.body as {
      artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
      transformType?: import("./artifacts/artifactTransforms.js").ArtifactTransformType;
      userPrompt?: string;
      sourceSectionIds?: string[];
      tokenMode?: import("./config/tokenModes.js").TokenMode;
      sourceRunId?: string;
    };

  if (!artifact?.id || !transformType || !userPrompt?.trim()) {
    res.status(400).json({ error: "artifact, transformType, and userPrompt are required" });
    return;
  }

  const { isMockTransformMode } = await import("./artifacts/mockArtifactTransforms.js");
  if (!isMockTransformMode(req)) {
    const missing = validateApiKeys();
    if (missing.length > 0) {
      res.status(503).json({
        error: `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
      });
      return;
    }
  }

  try {
    const { transformArtifact } = await import("./artifacts/artifactTransforms.js");
    const result = await transformArtifact({
      artifact,
      transformType,
      userPrompt: userPrompt.trim(),
      sourceSectionIds,
      tokenMode,
      sourceRunId,
      mockHeaders: req.headers as Record<string, string | string[] | undefined>,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/:artifactId/versions", async (req, res) => {
  try {
    const { listArtifactVersionsHydrated } = await import("./artifacts/artifactVersionStore.js");
    const versions = await listArtifactVersionsHydrated(req.params.artifactId);
    res.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/artifacts/:artifactId/versions", async (req, res) => {
  const body = req.body as import("./artifacts/artifactVersionStore.js").PersistedArtifactSectionVersion;
  if (!body?.id || !body.sectionId || body.artifactId !== req.params.artifactId) {
    res.status(400).json({ error: "Invalid version payload" });
    return;
  }
  try {
    const { appendArtifactVersion } = await import("./artifacts/artifactVersionStore.js");
    const versions = await appendArtifactVersion(body);
    res.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.patch("/api/artifacts/:artifactId/versions/:versionId/restore", async (req, res) => {
  try {
    const { restoreArtifactSectionVersion } = await import("./artifacts/artifactVersionStore.js");
    const fallback = req.body as {
      label?: string;
      kind?: import("./artifacts/artifactTypes.js").ArtifactSection["kind"];
    };
    const restoreFallback =
      fallback?.label && fallback?.kind
        ? { label: fallback.label, kind: fallback.kind }
        : fallback?.label
          ? { label: fallback.label, kind: "text" as const }
          : undefined;
    const result = await restoreArtifactSectionVersion(
      req.params.artifactId,
      req.params.versionId,
      restoreFallback,
    );
    if (!result) {
      res.status(404).json({ error: "Version not found or snapshot unavailable" });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/artifacts/:artifactId/share", async (req, res) => {
  const { title, type, runId, visibility, artifact } = req.body as {
    title?: string;
    type?: import("./artifacts/artifactTypes.js").ArtifactType;
    runId?: string;
    visibility?: "private_link" | "public";
    artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
  };
  if (!title?.trim() || !type) {
    res.status(400).json({ error: "title and type are required" });
    return;
  }
  try {
    const { createArtifactShare } = await import("./artifacts/artifactShareStore.js");
    const record = await createArtifactShare({
      artifactId: req.params.artifactId,
      title: title.trim(),
      type,
      runId,
      visibility,
      artifact,
    });
    res.json({ share: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/:artifactId/share", async (req, res) => {
  try {
    const { findShareByArtifactId } = await import("./artifacts/artifactShareStore.js");
    const share = await findShareByArtifactId(req.params.artifactId);
    if (!share) {
      res.status(404).json({ error: "No active share link for this artifact" });
      return;
    }
    res.json({ share });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/:artifactId/content", async (req, res) => {
  const runId = typeof req.query.runId === "string" ? req.query.runId : undefined;
  try {
    const { resolveArtifactById } = await import("./artifacts/artifactResolver.js");
    const artifact = await resolveArtifactById(req.params.artifactId, runId);
    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }
    res.json({ artifact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/share/:shareId", async (req, res) => {
  try {
    const { getArtifactSharePayload } = await import("./artifacts/artifactShareStore.js");
    const payload = await getArtifactSharePayload(req.params.shareId);
    if (!payload) {
      res.status(404).json({ error: "Share link not found or disabled" });
      return;
    }
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.patch("/api/artifacts/share/:shareId", async (req, res) => {
  const { enabled, visibility } = req.body as {
    enabled?: boolean;
    visibility?: "private_link" | "public";
  };
  if (enabled === undefined && visibility === undefined) {
    res.status(400).json({ error: "enabled or visibility required" });
    return;
  }
  try {
    const {
      setArtifactShareEnabled,
      setArtifactShareVisibility,
      getArtifactShare,
    } = await import("./artifacts/artifactShareStore.js");
    let share = await getArtifactShare(req.params.shareId);
    if (!share) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }
    if (typeof enabled === "boolean") {
      share = (await setArtifactShareEnabled(req.params.shareId, enabled)) ?? share;
    }
    if (visibility) {
      share = (await setArtifactShareVisibility(req.params.shareId, visibility)) ?? share;
    }
    res.json({ share });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/images/config", async (req, res) => {
  try {
    const { getImageProviderStatus, providerLabel } = await import("./images/imageProvider.js");
    const { visionQaCreditAddon } = await import("./images/imageVisionQa.js");
    const status = getImageProviderStatus(req.headers as Record<string, string | string[] | undefined>);
    res.json({
      enabled: status.enabled,
      configured: status.configured,
      provider: status.provider,
      activeProvider: status.activeProvider,
      model: status.model,
      providerLabel: providerLabel(status.activeProvider),
      creditsPerImage: Number(process.env.IMAGE_GENERATION_CREDITS ?? "3") || 3,
      visionQaCredits: visionQaCreditAddon(),
      mockAvailable: true,
      supportsTextToImage: status.supportsTextToImage,
      supportsImageToImage: status.supportsImageToImage,
      supportsEdit: status.supportsEdit,
      reason: status.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/images/brief", async (req, res) => {
  const body = req.body as {
    userPrompt?: string;
    visualType?: import("./images/visualNeedDetector.js").VisualNeed["type"];
    artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
    brandTone?: string;
    targetAudience?: string;
    userOwnsBrand?: boolean;
  };
  try {
    const { detectVisualNeeds } = await import("./images/visualNeedDetector.js");
    const { buildImageBrief } = await import("./images/imageBriefBuilder.js");
    const { guardImagePrompt } = await import("./images/imageIpGuard.js");
    const needs = detectVisualNeeds({
      prompt: body.userPrompt,
      artifactType: body.artifact?.type,
      artifactTitle: body.artifact?.title,
      sections: body.artifact?.sections,
    });
    const visualNeed =
      needs.find((n) => n.type === body.visualType) ?? needs[0] ?? null;
    if (!visualNeed) {
      res.status(400).json({ error: "No visual need detected for this artifact" });
      return;
    }
    let brief = buildImageBrief({
      userPrompt: body.userPrompt,
      artifact: body.artifact,
      visualNeed,
      brandTone: body.brandTone,
      targetAudience: body.targetAudience,
      userOwnsBrand: body.userOwnsBrand,
    });
    const ipGuard = guardImagePrompt(brief.prompt, { userOwnsBrand: body.userOwnsBrand });
    if (ipGuard.rewrittenPrompt) brief = { ...brief, prompt: ipGuard.rewrittenPrompt };
    res.json({ needs, visualNeed, brief, ipGuard });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/images/generate", async (req, res) => {
  const body = req.body as {
    userPrompt?: string;
    visualType?: import("./images/visualNeedDetector.js").VisualNeed["type"];
    artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
    brandTone?: string;
    targetAudience?: string;
    userOwnsBrand?: boolean;
    count?: number;
    briefOverride?: import("./images/imageBriefBuilder.js").ImageBrief;
    runVisionQa?: boolean;
    explicitAction?: boolean;
  };
  if (!body.explicitAction) {
    res.status(400).json({ error: "Image generation requires explicit user action" });
    return;
  }
  try {
    const { generateStudioImage } = await import("./images/imageGenerationService.js");
    const { readImageProviderConfig } = await import("./images/imageProvider.js");
    const { visionQaCreditAddon } = await import("./images/imageVisionQa.js");
    const { checkCreditsAvailable } = await import("./usage/usageGuards.js");
    const { deductCredits } = await import("./usage/usageStore.js");
    const config = readImageProviderConfig();
    const count = Math.max(1, Math.min(body.count ?? 1, 4));
    const visionAddon = body.runVisionQa ? visionQaCreditAddon() : 0;
    const requiredCredits = config.creditsPerImage * count + visionAddon;
    const creditCheck = await checkCreditsAvailable(requiredCredits);
    if (!creditCheck.ok) {
      res.status(402).json({
        code: "INSUFFICIENT_CREDITS",
        error: "Not enough credits for image generation.",
        requiredCredits,
        currentCredits: creditCheck.currentCredits,
      });
      return;
    }
    const result = await generateStudioImage({
      ...body,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    await deductCredits({
      credits: result.creditsUsed,
      workflowId: "image-studio",
      metadata: `IIVO Image Studio — ${result.visualNeed.type}`,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/images/pack", async (req, res) => {
  const body = req.body as {
    packType?: import("./images/imagePackService.js").GenerateImagePackInput["packType"];
    count?: number;
    aspectRatio?: string;
    styleConsistency?: boolean;
    sharedBrief?: import("./images/imageBriefBuilder.js").ImageBrief;
    variations?: Array<{
      angle?: string;
      background?: string;
      lighting?: string;
      composition?: string;
      useCase?: string;
      note?: string;
    }>;
    userPrompt?: string;
    artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
    userOwnsBrand?: boolean;
    runVisionQa?: boolean;
    explicitAction?: boolean;
  };
  if (!body.explicitAction) {
    res.status(400).json({ error: "Image pack generation requires explicit user action" });
    return;
  }
  if (!body.packType) {
    res.status(400).json({ error: "packType required" });
    return;
  }
  try {
    const { generateImagePack } = await import("./images/imagePackService.js");
    const { readImageProviderConfig } = await import("./images/imageProvider.js");
    const { visionQaCreditAddon } = await import("./images/imageVisionQa.js");
    const { checkCreditsAvailable } = await import("./usage/usageGuards.js");
    const { deductCredits } = await import("./usage/usageStore.js");
    const config = readImageProviderConfig();
    const count = Math.max(2, Math.min(body.count ?? 2, 4));
    const visionAddon = body.runVisionQa ? visionQaCreditAddon() : 0;
    const requiredCredits = config.creditsPerImage * count + visionAddon;
    const creditCheck = await checkCreditsAvailable(requiredCredits);
    if (!creditCheck.ok) {
      res.status(402).json({
        code: "INSUFFICIENT_CREDITS",
        error: "Not enough credits for image pack generation.",
        requiredCredits,
        currentCredits: creditCheck.currentCredits,
      });
      return;
    }
    const result = await generateImagePack({
      ...body,
      packType: body.packType,
      count,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    await deductCredits({
      credits: result.creditsUsed,
      workflowId: "image-studio",
      metadata: `IIVO Image Studio — pack ${body.packType}`,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/images/variant", async (req, res) => {
  const { sourceImageId, prompt, explicitAction } = req.body as {
    sourceImageId?: string;
    prompt?: string;
    explicitAction?: boolean;
  };
  if (!sourceImageId) {
    res.status(400).json({ error: "sourceImageId required" });
    return;
  }
  if (!explicitAction) {
    res.status(400).json({ error: "Variant generation requires explicit user action" });
    return;
  }
  try {
    const { createImageVariant } = await import("./images/imageGenerationService.js");
    const { readImageProviderConfig } = await import("./images/imageProvider.js");
    const { checkCreditsAvailable } = await import("./usage/usageGuards.js");
    const { deductCredits } = await import("./usage/usageStore.js");
    const config = readImageProviderConfig();
    const creditCheck = await checkCreditsAvailable(config.creditsPerImage);
    if (!creditCheck.ok) {
      res.status(402).json({
        code: "INSUFFICIENT_CREDITS",
        error: "Not enough credits for image variant.",
        requiredCredits: config.creditsPerImage,
        currentCredits: creditCheck.currentCredits,
      });
      return;
    }
    const result = await createImageVariant({
      sourceImageId,
      prompt,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    await deductCredits({
      credits: result.creditsUsed,
      workflowId: "image-studio",
      metadata: "IIVO Image Studio — variant",
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/images/attach-to-artifact", async (req, res) => {
  const { targetArtifact, imageId, sectionId, label } = req.body as {
    targetArtifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
    imageId?: string;
    sectionId?: string;
    label?: string;
  };
  if (!targetArtifact || !imageId) {
    res.status(400).json({ error: "targetArtifact and imageId required" });
    return;
  }
  try {
    const { attachImageToArtifact } = await import("./images/imageAttach.js");
    const artifact = await attachImageToArtifact({ targetArtifact, imageId, sectionId, label });
    res.json({ artifact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/images/:imageId/file", async (req, res) => {
  try {
    const { readStoredImageBuffer, getStoredImage } = await import("./images/imageStore.js");
    const record = await getStoredImage(req.params.imageId);
    const buffer = await readStoredImageBuffer(req.params.imageId);
    if (!record || !buffer) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.setHeader("Content-Type", record.mimeType);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/:artifactId/relationships", async (req, res) => {
  try {
    const { listRelationships } = await import("./artifacts/artifactRelationshipStore.js");
    const relationships = await listRelationships(req.params.artifactId);
    res.json({ relationships });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/children/:childId", async (req, res) => {
  try {
    const { getChildArtifact } = await import("./artifacts/artifactRelationshipStore.js");
    const artifact = await getChildArtifact(req.params.childId);
    if (!artifact) {
      res.status(404).json({ error: "Child artifact not found" });
      return;
    }
    res.json({ artifact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/artifacts/:artifactId/saved", async (req, res) => {
  try {
    const { getSavedArtifact } = await import("./artifacts/artifactSaveStore.js");
    const saved = await getSavedArtifact(req.params.artifactId);
    res.json({ saved: Boolean(saved), record: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/artifacts/:artifactId/save", async (req, res) => {
  const { title, type, sourceRunId, tags, artifact } = req.body as {
    title?: string;
    type?: import("./artifacts/artifactTypes.js").ArtifactType;
    sourceRunId?: string;
    tags?: string[];
    artifact?: import("./artifacts/artifactTypes.js").IivoArtifact;
  };
  if (!title || !type) {
    res.status(400).json({ error: "title and type are required" });
    return;
  }
  try {
    const { saveArtifactRecord } = await import("./artifacts/artifactSaveStore.js");
    const record = await saveArtifactRecord({
      artifactId: req.params.artifactId,
      title,
      type,
      savedAt: new Date().toISOString(),
      sourceRunId,
      tags,
      artifact,
    });
    res.json({ ok: true, record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.patch("/api/history/:runId/outcome", async (req, res) => {
  const {
    status,
    notes,
    resultMetric,
    actionTaken,
    expectedOutcome,
    actualOutcome,
    lessonsLearned,
    nextTimeRecommendation,
  } = req.body as {
    status?: string;
    notes?: string;
    resultMetric?: string;
    actionTaken?: string;
    expectedOutcome?: string;
    actualOutcome?: string;
    lessonsLearned?: string;
    nextTimeRecommendation?: string;
  };
  if (!status) {
    res.status(400).json({ error: "status is required" });
    return;
  }
  const updated = await updateRunOutcome(req.params.runId, {
    status: status as OutcomeStatus,
    notes,
    resultMetric,
    actionTaken,
    expectedOutcome,
    actualOutcome: actualOutcome ?? notes,
    lessonsLearned,
    nextTimeRecommendation,
  });
  if (!updated) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  try {
    const { updateDecisionRecordByRunId } = await import("./decisions/decisionStore.js");
    const record = await updateDecisionRecordByRunId(req.params.runId, {
      actionTaken,
      expectedOutcome,
      actualOutcome: actualOutcome ?? notes,
      outcomeStatus: status as OutcomeStatus,
      resultMetric,
      lessonsLearned,
      nextTimeRecommendation,
    });
    if (record) {
      await appendAuditEvent({
        eventType: actionTaken?.trim() ? "action_tracked" : "outcome_updated",
        runId: updated.runId,
        metadata: `status=${status}`,
      });
    }
  } catch {
    /* decision record sync must not break outcome update */
  }

  try {
    const projectName =
      updated.businessContext?.name?.trim() ||
      (updated.preset === "ai-front-desk-sales-test" ? "AI Front Desk" : "Project");

    const existing = (await listMemories()).find(
      (m) => m.type === "outcome" && m.relatedRunId === updated.runId,
    );

    const outcomeNotes = actualOutcome ?? notes;

    if (existing && existing.type === "outcome") {
      await updateMemory(existing.id, {
        outcomeStatus: status as OutcomeStatus,
        notes: outcomeNotes,
        resultMetric,
        projectName: existing.projectName || projectName,
      } as Partial<import("./memory/types.js").OutcomeMemory>);
    } else if (status !== "not_started" || actionTaken?.trim()) {
      await createMemory({
        type: "outcome",
        projectName,
        relatedRunId: updated.runId,
        outcomeStatus: status as OutcomeStatus,
        notes: outcomeNotes,
        resultMetric,
      });
    }
  } catch {
    /* outcome memory save must not break outcome update */
  }

  await appendAuditEvent({
    eventType: "outcome_saved",
    runId: updated.runId,
    metadata: `status=${status}`,
  });

  res.json(updated);
});

app.get("/api/memory", async (_req, res) => {
  const memories = await listMemories();
  res.json({
    memories,
    projectNames: listProjectNames(memories),
  });
});

app.post("/api/memory", async (req, res) => {
  const payload = validateMemoryPayload(req.body as Record<string, unknown>);
  if (!payload) {
    res.status(400).json({ error: "Invalid memory payload" });
    return;
  }
  const memory = await createMemory(payload);
  await appendAuditEvent({
    eventType: "memory_created",
    memoryId: memory.id,
    metadata: memory.type,
  });
  res.status(201).json(memory);
});

app.patch("/api/memory/:id", async (req, res) => {
  const existing = await getMemory(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  const patch = req.body as Record<string, unknown>;
  delete patch.id;
  delete patch.type;
  delete patch.createdAt;
  const updated = await updateMemory(req.params.id, patch);
  await appendAuditEvent({
    eventType: "memory_updated",
    memoryId: req.params.id,
  });
  res.json(updated);
});

app.delete("/api/memory/:id", async (req, res) => {
  const deleted = await deleteMemory(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Memory not found" });
    return;
  }
  await appendAuditEvent({
    eventType: "memory_deleted",
    memoryId: req.params.id,
  });
  res.json({ deleted: true });
});

app.delete("/api/memory/all", async (_req, res) => {
  const deleted = await deleteAllMemories();
  await appendAuditEvent({
    eventType: "all_memory_deleted",
    metadata: `${deleted} memories deleted`,
  });
  res.json({ deleted });
});

app.post("/api/export/memory", async (_req, res) => {
  const store = await exportAllMemories();
  await appendAuditEvent({
    eventType: "export_memory",
    metadata: `${store.memories.length} memories exported`,
  });
  res.json({ exportedAt: new Date().toISOString(), ...store });
});

app.post("/api/memory/search", async (req, res) => {
  const { query, type, projectName, limit } = req.body as {
    query?: string;
    type?: string;
    projectName?: string;
    limit?: number;
  };
  const memories = await searchMemoriesApi({
    query,
    type: type as import("./memory/types.js").MemoryType | "all" | undefined,
    projectName,
    limit,
  });
  res.json({ memories });
});

app.get("/api/context", async (_req, res) => {
  const items = await listContextItems();
  res.json({ items });
});

app.post("/api/context", async (req, res) => {
  const body = req.body as CreateContextItemInput;
  if (!body?.title?.trim() || !body?.contentText?.trim() || !body?.type) {
    res.status(400).json({ error: "title, type, and contentText are required" });
    return;
  }
  const item = await createContextItem(body);
  await appendAuditEvent({
    eventType: "context_item_created",
    metadata: `${item.type}:${item.id}`,
  });
  res.status(201).json(item);
});

app.get("/api/context/:id", async (req, res) => {
  const item = await getContextItem(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  res.json(item);
});

app.patch("/api/context/:id", async (req, res) => {
  const existing = await getContextItem(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  const updated = await updateContextItem(req.params.id, req.body);
  res.json(updated);
});

app.delete("/api/context/:id", async (req, res) => {
  const deleted = await deleteContextItem(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  await appendAuditEvent({
    eventType: "context_item_deleted",
    metadata: req.params.id,
  });
  res.json({ deleted: true });
});

app.post("/api/context/:id/screenshot", async (req, res) => {
  const item = await getContextItem(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  const { imageDataUrl } = req.body as { imageDataUrl?: string };
  if (!imageDataUrl?.trim()) {
    res.status(400).json({ error: "imageDataUrl is required" });
    return;
  }
  try {
    const saved = await saveContextScreenshot(item.id, imageDataUrl);
    const updated = await updateContextItem(item.id, {
      screenshotPath: saved.screenshotPath,
      imageMimeType: saved.imageMimeType,
      imageSizeBytes: saved.imageSizeBytes,
    });
    res.status(201).json(updated);
  } catch (err) {
    res.status(422).json({
      error: err instanceof Error ? err.message : "Screenshot upload failed",
    });
  }
});

app.get("/api/context/:id/screenshot", async (req, res) => {
  const item = await getContextItem(req.params.id);
  if (!item?.screenshotPath) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }
  const exists = await contextScreenshotExists(item.id);
  if (!exists) {
    res.status(404).json({ error: "Screenshot file not found" });
    return;
  }
  try {
    const absolutePath = screenshotAbsolutePath(item.screenshotPath);
    res.type(item.imageMimeType ?? "image/png");
    res.sendFile(absolutePath);
  } catch {
    res.status(404).json({ error: "Screenshot not found" });
  }
});

app.get("/api/config/vision", (_req, res) => {
  res.json(getImageVisionConfig());
});

app.post("/api/context/:id/analyze-screenshot", async (req, res) => {
  const item = await getContextItem(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  if (item.type !== "screenshot") {
    res.status(400).json({ error: "Context item is not a screenshot" });
    return;
  }

  const visionConfig = getImageVisionConfig();
  if (!visionConfig.configured) {
    res.status(503).json({
      error: visionConfig.reason ?? "Visual analysis is not configured.",
      vision: visionConfig,
    });
    return;
  }

  const { prompt } = req.body as { prompt?: string };
  const analysisPrompt =
    prompt?.trim() ||
    "Analyze this screenshot. Tell me what stands out visually, what matters, risks or issues, and what I should do next.";

  try {
    const result = await runVisionAnswer({
      prompt: analysisPrompt,
      contextItem: item,
    });
    res.json({
      answer: result.output,
      visionAnalysis: result.visionTrace,
      provider: result.cost?.provider,
      model: result.cost?.model,
      usage: result.cost,
    });
  } catch (err) {
    res.status(422).json({
      error: err instanceof Error ? err.message : "Screenshot analysis failed",
    });
  }
});

app.post("/api/context/import-url", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  try {
    const imported = await importUrlContent(url);
    res.json(imported);
  } catch (err) {
    res.status(422).json({
      error: err instanceof Error ? err.message : "URL import failed",
    });
  }
});

app.post("/api/context/:id/save-memory", async (req, res) => {
  const item = await getContextItem(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Context item not found" });
    return;
  }
  const memory = await createMemory({
    type: "evidence",
    title: item.title,
    content: item.contentText,
    sourceUrl: item.sourceUrl,
    sourceType: item.type === "url" ? "url" : "manual",
    projectName: item.project,
    relatedRunId: item.relatedRunId,
  });
  await updateContextItem(item.id, { savedToMemory: true });
  await appendAuditEvent({
    eventType: "memory_created",
    memoryId: memory.id,
    metadata: `from_context:${item.id}`,
  });
  res.status(201).json({ memory, contextItemId: item.id });
});

app.get("/api/audit", async (_req, res) => {
  const entries = await listAuditEvents();
  res.json({ entries });
});

app.delete("/api/audit", async (_req, res) => {
  const deleted = await clearAuditLog();
  res.json({ deleted });
});

app.post("/api/export/audit", async (_req, res) => {
  const log = await exportAuditLog();
  await appendAuditEvent({
    eventType: "export_audit_log",
    metadata: `${log.entries.length} entries exported`,
  });
  res.json({ exportedAt: new Date().toISOString(), ...log });
});

app.post("/api/audit/log", async (req, res) => {
  const { eventType, metadata, runId, memoryId } = req.body as {
    eventType?: string;
    metadata?: string;
    runId?: string;
    memoryId?: string;
  };
  if (!eventType || !isClientAuditEvent(eventType)) {
    res.status(400).json({ error: "Invalid or disallowed audit event type" });
    return;
  }
  const entry = await appendAuditEvent({ eventType, metadata, runId, memoryId });
  res.status(201).json(entry);
});

app.get("/api/decisions", async (_req, res) => {
  const { listDecisionRecords, getDecisionLearningStats } = await import(
    "./decisions/decisionStore.js"
  );
  const [records, stats] = await Promise.all([
    listDecisionRecords(),
    getDecisionLearningStats(),
  ]);
  res.json({ records, stats });
});

app.get("/api/decisions/stats", async (_req, res) => {
  const { getDecisionLearningStats } = await import("./decisions/decisionStore.js");
  const stats = await getDecisionLearningStats();
  res.json(stats);
});

app.get("/api/decisions/by-run/:runId", async (req, res) => {
  const { getDecisionRecordByRunId } = await import("./decisions/decisionStore.js");
  const record = await getDecisionRecordByRunId(req.params.runId);
  if (!record) {
    res.status(404).json({ error: "Decision record not found" });
    return;
  }
  res.json(record);
});

app.patch("/api/decisions/:id", async (req, res) => {
  const { updateDecisionRecordExecution } = await import("./decisions/decisionStore.js");
  const {
    actionTaken,
    expectedOutcome,
    actualOutcome,
    outcomeStatus,
    resultMetric,
    lessonsLearned,
    nextTimeRecommendation,
  } = req.body as import("./decisions/decisionStore.js").DecisionRecordExecutionPatch;

  const updated = await updateDecisionRecordExecution(req.params.id, {
    actionTaken,
    expectedOutcome,
    actualOutcome,
    outcomeStatus,
    resultMetric,
    lessonsLearned,
    nextTimeRecommendation,
  });
  if (!updated) {
    res.status(404).json({ error: "Decision record not found" });
    return;
  }

  await appendAuditEvent({
    eventType: actionTaken?.trim() ? "action_tracked" : "decision_record_updated",
    runId: updated.runId,
    metadata: updated.outcomeStatus,
  });

  res.json(updated);
});

app.get("/api/usage", async (_req, res) => {
  const { state, recentUsage } = await getUsageSummary(25);
  res.json({
    planId: state.planId,
    currentCredits: state.currentCredits,
    monthlyCredits: state.monthlyCredits,
    usedCreditsThisMonth: state.usedCreditsThisMonth,
    resetDate: state.resetDate,
    recentUsage,
    costTable: getCreditCostTable(),
  });
});

app.get("/api/usage/events", async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const events = await listUsageEvents(limit);
  res.json({ events });
});

app.post("/api/execution-mode/preview", (req, res) => {
  const {
    prompt,
    executionMode = "auto",
    wantsVision = false,
    inBuilderWorkspace = false,
    confirmationAccepted,
  } = req.body as {
    prompt?: string;
    executionMode?: ExecutionMode;
    wantsVision?: boolean;
    inBuilderWorkspace?: boolean;
    confirmationAccepted?: boolean;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const responsePlan = resolveResponsePlan(prompt);
  const artifactSelection = selectArtifactType({
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
  });

  const decision = resolveExecutionMode({
    userSelectedMode: executionMode,
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    artifactSelection: {
      type: artifactSelection.type,
      renderMode: artifactSelection.renderMode,
    },
    prompt,
    wantsVision: Boolean(wantsVision),
    wantsResearch: responsePlan.lane.lane === "research",
    confirmationAccepted,
    inBuilderWorkspace: Boolean(inBuilderWorkspace),
  });

  res.json(decision);
});

app.post("/api/usage/estimate", async (req, res) => {
  const { workflowId, tokenMode, benchmarkEnabled, route, prompt, visionScreenshotAnalysis } =
    req.body as {
      workflowId?: string;
      tokenMode?: unknown;
      benchmarkEnabled?: boolean;
      route?: string;
      prompt?: string;
      visionScreenshotAnalysis?: boolean;
    };
  const estimate = estimateCredits({
    workflowId,
    route,
    tokenMode,
    benchmarkEnabled,
    prompt,
    visionScreenshotAnalysis: Boolean(visionScreenshotAnalysis),
  });
  const state = await getUsageSummary(1);
  await logCreditEstimate(estimate);
  res.json({
    ...estimate,
    currentCredits: state.state.currentCredits,
    remainingAfterRun: state.state.currentCredits - estimate.estimatedCredits,
  });
});

app.post("/api/usage/reset-local", async (_req, res) => {
  const state = await resetLocalCredits();
  await appendAuditEvent({
    eventType: "credits_reset",
    metadata: `Reset to ${state.currentCredits} credits`,
  });
  res.json(state);
});

app.post("/api/usage/add-local-credits", async (req, res) => {
  const { credits } = req.body as { credits?: number };
  const amount = Number(credits);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "credits must be a positive number" });
    return;
  }
  const state = await addLocalCredits(amount);
  await appendAuditEvent({
    eventType: "credits_added",
    metadata: `Added ${Math.floor(amount)} credits`,
  });
  res.json(state);
});

/** Local/dev QA utility — set exact credit balance. Not available in production. */
app.post("/api/usage/set-local-credits", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not available in production" });
    return;
  }
  const { credits } = req.body as { credits?: number };
  const amount = Number(credits);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: "credits must be a non-negative number" });
    return;
  }
  const state = await setLocalCredits(amount);
  res.json(state);
});

app.post("/api/export/usage", async (_req, res) => {
  const events = await exportUsageEvents();
  await appendAuditEvent({
    eventType: "usage_exported",
    metadata: `${events.events.length} usage events exported`,
  });
  res.json({ exportedAt: new Date().toISOString(), ...events });
});

function insufficientCreditsPayload(err: InsufficientCreditsError) {
  return {
    error: err.message,
    code: err.code,
    requiredCredits: err.requiredCredits,
    currentCredits: err.currentCredits,
  };
}

async function preflightCreditsCheck(input: {
  workflow?: string;
  tokenMode?: unknown;
  benchmark?: boolean;
  prompt?: string;
}): Promise<InsufficientCreditsError | null> {
  if (!input.workflow || input.workflow === "auto") return null;
  const estimate = estimateCredits({
    workflowId: input.workflow,
    tokenMode: input.tokenMode,
    benchmarkEnabled: Boolean(input.benchmark),
    prompt: input.prompt,
  });
  const check = await checkCreditsAvailable(estimate.estimatedCredits);
  if (!check.ok) {
    await appendUsageEvent({
      eventType: "run_blocked_insufficient_credits",
      workflowId: estimate.workflowId,
      tokenMode: estimate.tokenMode,
      credits: estimate.estimatedCredits,
      balanceAfter: check.currentCredits,
      metadata: `Preflight blocked: need ${estimate.estimatedCredits}, have ${check.currentCredits}`,
    });
    return new InsufficientCreditsError(estimate.estimatedCredits, check.currentCredits);
  }
  return null;
}

app.post("/api/run-council/stop", (req, res) => {
  const { runId } = req.body as { runId?: string };
  if (!runId) {
    res.status(400).json({ error: "runId is required" });
    return;
  }
  res.json({ stopped: stopRun(runId) });
});

app.post("/api/run-council", async (req, res) => {
  const {
    prompt,
    preset,
    tokenMode,
    workflow,
    executionMode,
    executionModeConfirmationAccepted,
    executionModeConfirmationShown,
    inBuilderWorkspace,
    benchmark,
    decisionObjective,
    businessContext,
    memoryMode,
    selectedMemoryIds,
    conversationContext,
    externalContext,
  } = req.body as RunCouncilRequest;

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const missing = validateApiKeys();
  if (missing.length > 0) {
    res.status(503).json({
      error: `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
    });
    return;
  }

  const creditBlock = await preflightCreditsCheck({
    workflow,
    tokenMode,
    benchmark,
    prompt,
  });
  if (creditBlock) {
    res.status(402).json(insufficientCreditsPayload(creditBlock));
    return;
  }

  const stream = req.query.stream === "1" || req.query.stream === "true";

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await runCouncilFull({
        prompt,
        preset: preset ?? "none",
        tokenMode,
        workflowInput: workflow ?? "auto",
        executionMode: executionMode ?? "auto",
        executionModeConfirmationAccepted,
        executionModeConfirmationShown,
        inBuilderWorkspace: Boolean(inBuilderWorkspace),
        benchmark: Boolean(benchmark),
        decisionObjective,
        businessContext,
        memoryMode,
        selectedMemoryIds,
        conversationContext,
        externalContext,
        onProgress: sendEvent,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        sendEvent({
          type: "run-complete",
          runId: "unknown",
          result: {
            runId: "unknown",
            status: "error",
            outputs: emptyOutputs(),
            errors: [{ agent: "strategy", message: err.message }],
          },
        });
      } else {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendEvent({
          type: "run-complete",
          runId: "unknown",
          result: {
            runId: "unknown",
            status: "error",
            outputs: emptyOutputs(),
            errors: [{ agent: "strategy", message }],
          },
        });
      }
    } finally {
      res.end();
    }
    return;
  }

  try {
    const result = await runCouncilFull({
      prompt,
      preset: preset ?? "none",
      tokenMode,
      workflowInput: workflow ?? "auto",
      executionMode: executionMode ?? "auto",
      executionModeConfirmationAccepted,
      executionModeConfirmationShown,
      inBuilderWorkspace: Boolean(inBuilderWorkspace),
      benchmark: Boolean(benchmark),
      decisionObjective,
      businessContext,
      memoryMode,
      selectedMemoryIds,
      conversationContext,
      externalContext,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json(insufficientCreditsPayload(err));
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get("/api/benchmarks", async (_req, res) => {
  const runs = await listBenchmarkRuns();
  res.json({ runs });
});

app.get("/api/benchmarks/prompts", (_req, res) => {
  res.json({ prompts: BENCHMARK_PROMPTS });
});

app.get("/api/benchmarks/:id", async (req, res) => {
  const record = await getBenchmarkRun(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Benchmark not found" });
    return;
  }
  res.json(record);
});

app.post("/api/benchmarks/estimate", async (req, res) => {
  const { prompt, workflowId, tokenMode, benchmarkMode } = req.body as {
    prompt?: string;
    workflowId?: string;
    tokenMode?: unknown;
    benchmarkMode?: string;
  };
  const estimate = estimateBenchmarkRun({
    prompt,
    workflowId,
    tokenMode,
    benchmarkMode: benchmarkMode as import("./benchmarks/types.js").BenchmarkMode | undefined,
  });
  const state = await getUsageSummary(1);
  res.json({
    ...estimate,
    currentCredits: state.state.currentCredits,
    remainingAfterRun: state.state.currentCredits - estimate.totalCredits,
  });
});

app.post("/api/benchmarks/run", async (req, res) => {
  const missing = validateApiKeys();
  if (missing.length > 0) {
    res.status(503).json({
      error: `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`,
    });
    return;
  }

  const body = req.body as import("./benchmarks/types.js").CreateBenchmarkInput;
  try {
    const record = await createBenchmarkRun(body);
    res.json(record);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json(insufficientCreditsPayload(err));
      return;
    }
    const message = err instanceof Error ? err.message : "Benchmark failed";
    res.status(500).json({ error: message });
  }
});

app.delete("/api/benchmarks/:id", async (req, res) => {
  const deleted = await deleteBenchmarkRun(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Benchmark not found" });
    return;
  }
  await appendAuditEvent({
    eventType: "benchmark_deleted",
    metadata: req.params.id,
  });
  res.json({ deleted: true });
});

app.post("/api/benchmarks/:id/save-memory", async (req, res) => {
  const record = await getBenchmarkRun(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Benchmark not found" });
    return;
  }
  const payload = validateMemoryPayload({
    type: "evidence",
    title: `Benchmark: ${record.prompt.slice(0, 80)}`,
    content: [
      `# Benchmark (${record.winner})`,
      record.summary,
      "",
      "## Baseline",
      record.baselineAnswer,
      "",
      "## IIVO",
      record.iivoAnswer,
    ].join("\n"),
    projectName: "Benchmark Lab",
    sourceType: "benchmark-lab",
  });
  if (!payload) {
    res.status(400).json({ error: "Invalid memory payload" });
    return;
  }
  const memory = await createMemory(payload);
  await updateBenchmarkRun(record.id, { notes: "Saved to memory" });
  await appendAuditEvent({
    eventType: "benchmark_saved_to_memory",
    memoryId: memory.id,
    metadata: record.id,
  });
  res.json({ memory });
});

function emptyOutputs() {
  return {
    strategy: "",
    critic: "",
    research: "",
    salesWriter: "",
    finalJudge: "",
  };
}

const clientDist = path.resolve(__dirname, "../client");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) res.status(404).json({ error: "Not found" });
    });
  });
}

app.listen(PORT, () => {
  console.log(`IIVO server listening on http://localhost:${PORT}`);
  logApiKeyStatus();
  logImageVisionStatus();
  logConfiguredModels();
  logConfiguredTokenModes();
  void appendAuditEvent({ eventType: "app_started" });
  const missing = validateApiKeys();
  if (missing.length > 0) {
    console.warn(
      `Warning: Missing API keys: ${missing.join(", ")}. Add them to .env before running.`,
    );
  }
});

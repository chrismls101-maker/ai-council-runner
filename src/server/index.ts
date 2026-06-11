import { logApiKeyStatus, logImageVisionStatus } from "./loadEnv.js";
import { logConfiguredModels } from "./config/models.js";
import { logGlassModelStatus } from "./config/glassModels.js";
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
  updateRunOutcome,
} from "./history/runHistory.js";
import {
  resolveExecutionMode,
  type ExecutionMode,
} from "./executionMode/executionMode.js";
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
import { getGlassModelsDiagnostics } from "./config/glassModels.js";
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
  GlassAskServiceError,
  GlassAskValidationError,
  handleGlassAsk,
  insufficientCreditsPayload as glassAskInsufficientCreditsPayload,
  runGlassDirectAskStream,
  validateGlassDirectApiKey,
} from "./glass/glassAskHandler.js";
import type { GlassAskRequestBody } from "./glass/glassAskTypes.js";
import {
  GlassAskPayloadTooLargeError,
  validateGlassAskPayloadSize,
} from "./glass/glassAskPayload.js";
import { loadGlassUpdateManifest } from "./glass/glassUpdateManifest.js";
import {
  handleGlassElectronUpdateFeed,
  handleGlassUpdateDownload,
  withGlassUpdateProxyUrls,
} from "./glass/glassUpdateFeed.js";
import { translateLiveCaption } from "./glass/glassTranslate.js";
import {
  clearGlassUserProfile,
  getGlassUserProfile,
  saveGlassUserProfile,
} from "./userProfile/userProfileStore.js";
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
import {
  getOpenAiKey,
  MAX_AUDIO_BYTES,
  transcribeAudioBuffer,
} from "./transcription/transcribeAudio.js";
import { glassApiAuthMiddleware } from "./middleware/glassApiAuth.js";
import {
  isLandingGateEnabled,
  verifyLandingPassword,
} from "./landingGate.js";
import rateLimit from "express-rate-limit";
import { auth } from "./auth/auth.js";
import { toNodeHandler } from "better-auth/node";
import { issueGlassConnectToken, verifyGlassConnectToken } from "./auth/glassConnect.js";

// ─── Rate limiters ───────────────────────────────────────────────────────────
// Council runs are expensive (multi-agent AI). 5 runs / 15 min per IP for open beta.
const councilLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many council runs. Please wait before running another." },
});

// Glass overlay asks are fast but still AI — 40 / 15 min.
const glassLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this device." },
});

// General API — 120 / 15 min. Health + landing-gate always exempt.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
  skip: (req) => {
    const p = req.originalUrl.split("?")[0] ?? "";
    return p === "/api/health" || p.startsWith("/api/landing-gate");
  },
});

// Destructive bulk-delete / credit-mutation endpoints — 10 / 15 min, auth required.
const destructiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many destructive operations." },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim();

const app = express();
app.set("trust proxy", 1);

// ─── Security headers (helmet-equivalent, no extra dep) ──────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // modern browsers ignore; rely on CSP
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production" && !allowedOrigin) {
  console.warn(
    "[IIVO] WARNING: ALLOWED_ORIGIN is not set in production. " +
    "Set it to https://iivo.ai to restrict cross-origin access.",
  );
}
app.use(
  allowedOrigin
    ? cors({ origin: allowedOrigin, credentials: false })
    : cors(),
);

// ─── Auth (better-auth) — must come before express.json() global middleware ───
// toNodeHandler adapts better-auth's fetch-based handler to Node.js req/res.
// Mount before express.json() so better-auth handles its own body parsing.
app.all(/^\/api\/auth/, toNodeHandler(auth));

// Glass connect token — issue (user must be authenticated via better-auth session cookie)
app.post("/api/auth/glass-connect/issue", express.json(), async (req, res) => {
  try {
    // Build a Headers object from Express req.headers for better-auth
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const token = issueGlassConnectToken({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      sessionToken: session.session.token,
    });
    res.json({ connectToken: token, expiresIn: 300 });
  } catch (err) {
    console.error("[auth] glass-connect/issue error", err);
    res.status(500).json({ error: "Failed to issue connect token" });
  }
});

// Glass connect token — verify (called by Glass app)
app.get("/api/auth/glass-connect/verify/:token", (req, res) => {
  const entry = verifyGlassConnectToken(req.params.token ?? "");
  if (!entry) {
    res.status(404).json({ error: "Invalid or expired connect token" });
    return;
  }
  res.json({
    sessionToken: entry.sessionToken,
    userId: entry.userId,
    email: entry.email,
    name: entry.name,
  });
});

/** Visual ask may include optimized JPEG data URLs — parse before the global 2mb limit. */
app.post("/api/glass/ask", glassApiAuthMiddleware, glassLimiter, express.json({ limit: "6mb" }), async (req, res) => {
  const body = req.body as GlassAskRequestBody;
  try {
    validateGlassAskPayloadSize(body);
    const result = await handleGlassAsk(body);
    res.json(result);
  } catch (err) {
    if (err instanceof GlassAskValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof GlassAskPayloadTooLargeError) {
      res.status(413).json({ error: err.message });
      return;
    }
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json(glassAskInsufficientCreditsPayload(err));
      return;
    }
    if (err instanceof GlassAskServiceError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Glass ask failed";
    res.status(500).json({ error: message });
  }
});

/**
 * SSE streaming variant of /api/glass/ask.
 * Emits `data: {"token":"..."}` lines as tokens arrive, then a final
 * `data: {"done":true, ...GlassAskResponseBody}` line, then closes.
 * Visual asks and any request with latestScreenshot fall back to the
 * non-streaming route (full JSON response wrapped in a done event).
 */
app.post("/api/glass/ask/stream", glassApiAuthMiddleware, glassLimiter, express.json({ limit: "6mb" }), async (req, res) => {
  const body = req.body as GlassAskRequestBody;

  // Set SSE headers immediately so the client can start reading.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Helper: write a typed SSE event and flush.
  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Wire up client-disconnect abort.
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    const missing = validateGlassDirectApiKey();
    if (missing.length > 0) {
      send({ error: `Missing API keys: ${missing.join(", ")}. Add them to your .env file.`, status: 503 });
      res.end();
      return;
    }

    const hasScreenshot = Boolean(
      body.latestScreenshot?.imageDataUrl ||
        body.latestScreenshot?.imageBase64 ||
        body.latestScreenshot?.contextId ||
        body.lensContext?.screenshot,
    );

    if (hasScreenshot || body.visualIntent) {
      // Visual asks don't stream — run non-streaming and wrap as a single done event.
      const result = await handleGlassAsk(body, ac.signal);
      send({ done: true, ...result });
      res.end();
      return;
    }

    const result = await runGlassDirectAskStream(
      body,
      (token) => send({ token }),
      ac.signal,
    );
    send({ done: true, ...result });
    res.end();
  } catch (err) {
    if (ac.signal.aborted) {
      res.end();
      return;
    }
    const message = err instanceof Error ? err.message : "Glass ask stream failed";
    const status = err instanceof GlassAskServiceError ? err.status : 500;
    send({ error: message, status });
    res.end();
  }
});

app.post("/api/glass/translate", glassApiAuthMiddleware, glassLimiter, express.json({ limit: "64kb" }), async (req, res) => {
  try {
    const result = await translateLiveCaption(req.body ?? {});
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    res.status(500).json({ error: message });
  }
});

app.use("/api", apiLimiter);

app.use(express.json({ limit: "2mb" }));

app.get("/api/landing-gate/status", (_req, res) => {
  res.json({ enabled: isLandingGateEnabled() });
});

app.post("/api/landing-gate/unlock", (req, res) => {
  if (!isLandingGateEnabled()) {
    res.json({ ok: true });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!verifyLandingPassword(password)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  const missing = validateApiKeys();
  const vision = getImageVisionConfig();
  const glassModels = getGlassModelsDiagnostics();
  res.json({
    ok: missing.length === 0,
    missingKeys: missing,
    stt: {
      configured: !!getOpenAiKey(),
      enabled: !!getOpenAiKey(),
      endpoint: "/api/transcribe-audio",
      reason: getOpenAiKey()
        ? undefined
        : "OpenAI API key not configured on server (OPENAI_API_KEY).",
    },
    vision: {
      enabled: vision.enabled,
      configured: vision.configured,
      model: vision.model,
      reason: vision.reason,
    },
    glassModels: {
      defaultModel: glassModels.defaultModel,
      fallbackChain: glassModels.fallbackChain,
      text: glassModels.text,
      vision: glassModels.vision,
      diagnostic: glassModels.diagnostic,
      semantic: glassModels.semantic,
    },
  });
});

app.get("/api/user-profile", async (_req, res) => {
  const profile = await getGlassUserProfile();
  res.json({ profile });
});

app.put("/api/user-profile", async (req, res) => {
  const profile = await saveGlassUserProfile(req.body ?? {});
  res.json({ profile });
});

app.delete("/api/user-profile", async (_req, res) => {
  await clearGlassUserProfile();
  res.json({ ok: true });
});

app.get("/api/glass/update", (req, res) => {
  const manifest = loadGlassUpdateManifest();
  if (manifest.ok === false) {
    res.json(manifest);
    return;
  }
  const { ok: _ok, ...payload } = manifest;
  res.json({ ...withGlassUpdateProxyUrls(req, payload), ok: true });
});

app.get("/api/glass/update/electron/latest-mac.yml", (req, res) => {
  void handleGlassElectronUpdateFeed(req, res);
});

app.get("/api/glass/update/download/:filename", (req, res) => {
  void handleGlassUpdateDownload(req, res);
});

app.post("/api/transcribe-audio", glassApiAuthMiddleware, express.json({ limit: "8mb" }), async (req, res) => {
  const { audioBase64, mimeType, model, source } = req.body as {
    audioBase64?: string;
    mimeType?: string;
    model?: string;
    source?: string;
  };
  if (!audioBase64?.trim()) {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }
  if (!mimeType?.trim()) {
    res.status(400).json({ error: "mimeType is required" });
    return;
  }
  if (!getOpenAiKey()) {
    res.status(503).json({
      error: "OPENAI_API_KEY is not configured on the IIVO server.",
      provider: "openai",
    });
    return;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(audioBase64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid audioBase64 payload" });
    return;
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    res.status(413).json({
      error: `Audio exceeds maximum size (${MAX_AUDIO_BYTES} bytes).`,
    });
    return;
  }
  try {
    const result = await transcribeAudioBuffer(buffer, mimeType.trim(), model?.trim());
    res.json({
      ...result,
      source: source ?? "unknown",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    const status = /not configured/i.test(message)
      ? 503
      : /Unsupported audio|empty|maximum size/i.test(message)
        ? 422
        : 502;
    res.status(status).json({ error: message, provider: "openai" });
  }
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

app.delete("/api/history/all", glassApiAuthMiddleware, destructiveLimiter, async (_req, res) => {
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

app.delete("/api/memory/all", glassApiAuthMiddleware, destructiveLimiter, async (_req, res) => {
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

app.delete("/api/audit", glassApiAuthMiddleware, destructiveLimiter, async (_req, res) => {
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
    confirmationAccepted,
  } = req.body as {
    prompt?: string;
    executionMode?: ExecutionMode;
    wantsVision?: boolean;
    confirmationAccepted?: boolean;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const responsePlan = resolveResponsePlan(prompt);

  const decision = resolveExecutionMode({
    userSelectedMode: executionMode,
    taskIntent: responsePlan.intent,
    responseContract: responsePlan.contract,
    prompt,
    wantsVision: Boolean(wantsVision),
    wantsResearch: responsePlan.lane.lane === "research",
    confirmationAccepted,
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

app.post("/api/usage/reset-local", glassApiAuthMiddleware, destructiveLimiter, async (_req, res) => {
  const state = await resetLocalCredits();
  await appendAuditEvent({
    eventType: "credits_reset",
    metadata: `Reset to ${state.currentCredits} credits`,
  });
  res.json(state);
});

app.post("/api/usage/add-local-credits", glassApiAuthMiddleware, destructiveLimiter, async (req, res) => {
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

app.post("/api/run-council", councilLimiter, async (req, res) => {
  const {
    prompt,
    preset,
    tokenMode,
    workflow,
    executionMode,
    executionModeConfirmationAccepted,
    executionModeConfirmationShown,
    benchmark,
    decisionObjective,
    businessContext,
    userProfile: userProfileInput,
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
        benchmark: Boolean(benchmark),
        decisionObjective,
        businessContext,
        userProfile: userProfileInput,
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
      benchmark: Boolean(benchmark),
      decisionObjective,
      businessContext,
      userProfile: userProfileInput,
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
  app.use(
    express.static(clientDist, {
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
        }
      },
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) res.status(404).json({ error: "Not found" });
    });
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IIVO server listening on http://0.0.0.0:${PORT}`);
  logApiKeyStatus();
  logImageVisionStatus();
  logConfiguredModels();
  logGlassModelStatus();
  logConfiguredTokenModes();
  void appendAuditEvent({ eventType: "app_started" });
  const missing = validateApiKeys();
  if (missing.length > 0) {
    console.warn(
      `Warning: Missing API keys: ${missing.join(", ")}. Add them to .env before running.`,
    );
  }
});

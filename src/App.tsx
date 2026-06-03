import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import ChatComposer, {
  type ChatComposerHandle,
  type ContextBridgeMenuAction,
} from "./components/ChatComposer";
import ConversationView from "./components/ConversationView";
import BuilderCanvas from "./components/builder/BuilderCanvas";
import ArtifactEditModal from "./components/artifacts/ArtifactEditModal";
import {
  persistBuilderModeAccepted,
  requestArtifactSectionUpdate,
  requestArtifactTransform,
} from "./utils/artifactApi";
import type { BuilderWorkspaceTab, SectionVariantType } from "./types/builderWorkspace";
import type { ArtifactVersionState } from "./types/artifactVersions";
import type { RelatedChild } from "./components/builder/RelatedArtifactsPanel";
import type { VersionPersistenceMode } from "./utils/artifactApi";
import {
  loadMergedVersionState,
  persistSectionVersion,
  restoreSectionVersion,
} from "./utils/artifactVersioning";
import { buildBuilderContextItems } from "./utils/builderContext";
import { cacheChildArtifact, loadCachedChildArtifact } from "./utils/artifactChildCache";
import {
  fetchArtifactRelationships,
  fetchChildArtifact,
  saveLocalRelationship,
  transformTypeLabel,
} from "./utils/artifactRelationships";
import { updateArtifactSection } from "./utils/artifactMutations";
import { sectionPlainText } from "./utils/artifactClipboard";
import type { ArtifactSection } from "./types/artifacts";
import LandingView from "./components/landing";
import Sidebar from "./components/Sidebar";
import WorkspaceHeader from "./components/WorkspaceHeader";
import { formatEstimateLabel } from "./components/UsageIndicator";
import CreditConfirmModal from "./components/CreditConfirmModal";
import CouncilModeConfirm from "./components/CouncilModeConfirm";
import BuilderModeConfirm from "./components/builder/BuilderModeConfirm";
import {
  loadExecutionMode,
  saveExecutionMode,
} from "./utils/executionModeStorage";
import { previewExecutionMode } from "./utils/executionModePreview";
import type { ExecutionMode } from "./types/executionMode";
import SaveMemoryModal from "./components/SaveMemoryModal";
import {
  type HistoryFilter,
  type SidebarSection,
  MAIN_PANEL_SECTIONS,
  SIDE_PANEL_SECTIONS,
} from "./utils/decisionHistory";
import {
  hasBusinessProfileContent,
  loadSessionBusinessContext,
  saveSessionBusinessContext,
  shouldRememberBusinessContext,
} from "./utils/composerContext";
import {
  loadSelectedMemoryIds,
  saveSelectedMemoryIds,
} from "./utils/memoryContext";
import {
  loadAppSettings,
  resolveMemoryMode,
  saveAppSettings,
} from "./utils/appSettings";
import {
  clearSelectedPreset,
  loadSelectedPreset,
  normalizePresetId,
  saveSelectedPreset,
  type SelectedPresetId,
} from "./utils/workspacePreset";
import type { AppSettings } from "./types/settings";
import DecisionLearningPanel from "./components/DecisionLearningPanel";
import BenchmarkLabPanel from "./components/BenchmarkLabPanel";
import SettingsPanel from "./components/SettingsPanel";
import TrustPrivacyPanel from "./components/TrustPrivacyPanel";
import OnboardingModal from "./components/OnboardingModal";
import PasteContextModal, { type PasteContextFormValues } from "./components/PasteContextModal";
import ImportUrlModal from "./components/ImportUrlModal";
import ContextLibraryPanel from "./components/ContextLibraryPanel";
import {
  INSUFFICIENT_CREDITS_MESSAGE,
  PROVIDER_FAILURE_MESSAGE,
} from "./constants/publicMessages";
import { isOnboardingComplete } from "./utils/onboarding";
import {
  MAX_ATTACHED_CONTEXT_ITEMS,
  buildAskIivoPrompt,
  buildAskIivoScreenshotPrompt,
  attachedFromSavedItem,
  ephemeralAttached,
  shouldUseVisionDirectAnswer,
  type AttachedContextItem,
  type ContextItem,
} from "./types/contextBridge";
import {
  createContextItem,
  fetchVisionConfig,
  toExternalContextPayload,
} from "./utils/contextBridgeApi";
import { useLensHandoff } from "./utils/useLensHandoff";
import { computeAttachmentTruncationHints } from "./utils/contextBridgeClient";
import type { RoutingTestCase } from "./constants/routingTestMatrix";
import type { DecisionLearningStats, DecisionRecord } from "./types/decisionRecord";
import { buildSuggestedMemories, type SuggestedMemoryItem } from "./utils/suggestedMemory";
import {
  buildPromptWithAttachments,
  filesToAttachments,
  isFileDragEvent,
  revokeAttachmentUrls,
} from "./utils/composerAttachments";
import {
  buildConversationTurnSnapshot,
  clearConversationThreadSession,
  loadConversationThreadFromSession,
  saveConversationThreadToSession,
} from "./utils/conversationTurn";
import { buildConversationContextForApi } from "./utils/conversationContext";
import {
  isChatScrollNearBottom,
  scrollChatContainerToBottom,
} from "./utils/chatScroll";
import type { ComposerAttachment } from "./types/attachments";
import type { CreditEstimateResponse, UsageSummaryResponse } from "./types/usage";
import {
  estimateRunCredits,
  fetchUsageSummary,
  shouldConfirmCredits,
  shouldWarnCredits,
} from "./utils/usageApi";
import {
  AGENT_ORDER,
  EMPTY_BUSINESS_CONTEXT,
  type AgentCost,
  type AgentId,
  type AgentMeta,
  type AgentOutputs,
  type AgentStatus,
  type BusinessContext,
  type CouncilRunResult,
  type CouncilExecutionTrace,
  type DecisionOutcome,
  type DecisionQuality,
  type ProgressEvent,
  type RouterDecision,
  type ResearchAgentMeta,
  type RunCostSummary,
  type RunHistorySummary,
  type IncludedMemorySummary,
  type Memory,
  type MemoryMode,
  type SaveMemoryDraft,
  type TokenMode,
  type WorkflowOption,
  type ConversationTurn,
  type IivoArtifact,
} from "./types";

function emptyOutputs(): AgentOutputs {
  return {
    strategy: "",
    critic: "",
    research: "",
    salesWriter: "",
    finalJudge: "",
  };
}

function initAgentMeta(): Record<AgentId, AgentMeta> {
  return Object.fromEntries(
    AGENT_ORDER.map((id) => [id, { status: "pending" as AgentStatus }]),
  ) as Record<AgentId, AgentMeta>;
}

function applyResultToState(
  result: CouncilRunResult,
  setters: {
    setOutputs: (v: AgentOutputs) => void;
    setErrors: (v: CouncilRunResult["errors"]) => void;
    setRunStatus: (v: string) => void;
    setAgentMeta: (v: Record<AgentId, AgentMeta>) => void;
    setAgentCosts: (v: Partial<Record<AgentId, AgentCost>>) => void;
    setCostSummary: (v: RunCostSummary | null) => void;
    setAgentLabels: (v: Record<AgentId, string> | undefined) => void;
    setWorkflowName: (v: string | null) => void;
    setRouterDecision: (v: RouterDecision | null) => void;
    setBenchmarkAnswer: (v: string | null) => void;
    setBenchmarkCost: (v: AgentCost | null) => void;
    setResearchSources: (v: string[] | undefined) => void;
    setResearchAgentMeta: (v: ResearchAgentMeta | undefined) => void;
    setExecutionTrace: (v: CouncilExecutionTrace | null) => void;
    setDecisionObjective: (v: string | null) => void;
    setObjectiveInferred: (v: boolean) => void;
    setDecisionQuality: (v: DecisionQuality | null) => void;
    setOutcome: (v: DecisionOutcome | undefined) => void;
    setDecisionRecord: (v: DecisionRecord | null) => void;
    setIncludedMemories: (v: IncludedMemorySummary[]) => void;
    setActiveMemoryMode: (v: MemoryMode | undefined) => void;
    setArtifact: (v: IivoArtifact | null) => void;
  },
) {
  setters.setOutputs(result.outputs);
  setters.setErrors(result.errors);
  setters.setRunStatus(result.status);
  if (result.agentMeta) setters.setAgentMeta(result.agentMeta);
  if (result.agentCosts) setters.setAgentCosts(result.agentCosts);
  if (result.costSummary) setters.setCostSummary(result.costSummary);
  setters.setAgentLabels(result.agentLabels);
  setters.setWorkflowName(result.workflowName ?? null);
  if (result.routerDecision) setters.setRouterDecision(result.routerDecision);
  if (result.benchmarkAnswer) setters.setBenchmarkAnswer(result.benchmarkAnswer);
  if (result.benchmarkCost) setters.setBenchmarkCost(result.benchmarkCost);
  if (result.researchSources) setters.setResearchSources(result.researchSources);
  if (result.researchAgentMeta) setters.setResearchAgentMeta(result.researchAgentMeta);
  setters.setExecutionTrace(result.executionTrace ?? null);
  setters.setDecisionObjective(result.decisionObjective ?? null);
  setters.setObjectiveInferred(Boolean(result.objectiveInferred));
  setters.setDecisionQuality(result.decisionQuality ?? null);
  setters.setOutcome(result.outcome);
  setters.setDecisionRecord(result.decisionRecord ?? null);
  setters.setIncludedMemories(result.includedMemories ?? []);
  setters.setActiveMemoryMode(result.memoryMode);
  setters.setArtifact(result.artifact ?? null);
}

async function fetchDecisionRecordForRun(runId: string): Promise<DecisionRecord | null> {
  try {
    const res = await fetch(`/api/decisions/by-run/${runId}`);
    if (!res.ok) return null;
    return (await res.json()) as DecisionRecord;
  } catch {
    return null;
  }
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [preset, setPreset] = useState<SelectedPresetId>(() => loadSelectedPreset());
  const [tokenMode, setTokenMode] = useState<TokenMode>("small");
  const [workflow, setWorkflow] = useState("auto");
  const [selectedExecutionMode, setSelectedExecutionMode] = useState<ExecutionMode>(() =>
    loadExecutionMode(),
  );
  const [councilConfirmOpen, setCouncilConfirmOpen] = useState(false);
  const [builderPreRunConfirmOpen, setBuilderPreRunConfirmOpen] = useState(false);
  const [benchmark, setBenchmark] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<AgentOutputs>(emptyOutputs);
  const [agentMeta, setAgentMeta] = useState<Record<AgentId, AgentMeta>>(initAgentMeta);
  const [agentLabels, setAgentLabels] = useState<Record<AgentId, string> | undefined>();
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [routerDecision, setRouterDecision] = useState<RouterDecision | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<CouncilRunResult["errors"]>([]);
  const [agentCosts, setAgentCosts] = useState<Partial<Record<AgentId, AgentCost>>>({});
  const [costSummary, setCostSummary] = useState<RunCostSummary | null>(null);
  const [benchmarkAnswer, setBenchmarkAnswer] = useState<string | null>(null);
  const [benchmarkCost, setBenchmarkCost] = useState<AgentCost | null>(null);
  const [researchSources, setResearchSources] = useState<string[] | undefined>();
  const [researchAgentMeta, setResearchAgentMeta] = useState<ResearchAgentMeta | undefined>();
  const [executionTrace, setExecutionTrace] = useState<CouncilExecutionTrace | null>(null);
  const [decisionObjective, setDecisionObjectiveInput] = useState("");
  const [storedDecisionObjective, setStoredDecisionObjective] = useState<string | null>(null);
  const [objectiveInferred, setObjectiveInferred] = useState(false);
  const [businessContext, setBusinessContext] = useState<BusinessContext>(EMPTY_BUSINESS_CONTEXT);
  const [rememberContext, setRememberContext] = useState(false);
  const [decisionQuality, setDecisionQuality] = useState<DecisionQuality | null>(null);
  const [outcome, setOutcome] = useState<DecisionOutcome | undefined>();
  const [decisionRecord, setDecisionRecord] = useState<DecisionRecord | null>(null);
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecord[]>([]);
  const [decisionStats, setDecisionStats] = useState<DecisionLearningStats | null>(null);
  const [memoryMode, setMemoryMode] = useState<MemoryMode>(() =>
    resolveMemoryMode(loadAppSettings()),
  );
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>(() =>
    loadSelectedMemoryIds(),
  );
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [includedMemories, setIncludedMemories] = useState<IncludedMemorySummary[]>([]);
  const [activeMemoryMode, setActiveMemoryMode] = useState<MemoryMode | undefined>();
  const [saveMemoryDraft, setSaveMemoryDraft] = useState<Partial<SaveMemoryDraft> | null>(
    null,
  );
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [submittedAttachments, setSubmittedAttachments] = useState<ComposerAttachment[]>([]);
  const [submittedAttachedContext, setSubmittedAttachedContext] = useState<AttachedContextItem[]>(
    [],
  );
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [workspaceDragActive, setWorkspaceDragActive] = useState(false);
  const workspaceDragCounter = useRef(0);
  const [benchmarkChecks, setBenchmarkChecks] = useState<Record<string, boolean>>({});
  const [benchmarkNotes, setBenchmarkNotes] = useState("");
  const [history, setHistory] = useState<RunHistorySummary[]>([]);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("console");
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [archivedRunId, setArchivedRunId] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [backendReachable, setBackendReachable] = useState(false);
  const [workspaceBootstrapped, setWorkspaceBootstrapped] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [lensHandoffError, setLensHandoffError] = useState<string | null>(null);
  const [visionConfigured, setVisionConfigured] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const executionRunFlagsRef = useRef<{
    confirmationShown?: boolean;
    confirmationAccepted?: boolean;
  }>({});
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const userPinnedToBottomRef = useRef(true);
  const skipTypewriterRef = useRef<(() => void) | null>(null);
  const [typewriterActive, setTypewriterActive] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>(() =>
    loadConversationThreadFromSession(),
  );
  const [activeArtifact, setActiveArtifact] = useState<IivoArtifact | null>(null);
  const [builderModeActive, setBuilderModeActive] = useState(false);
  const [builderCanvasDismissed, setBuilderCanvasDismissed] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [artifactSectionLoading, setArtifactSectionLoading] = useState<string | null>(null);
  const [editSection, setEditSection] = useState<ArtifactSection | null>(null);
  const [builderTab, setBuilderTab] = useState<BuilderWorkspaceTab>("compose");
  const [artifactVersionState, setArtifactVersionState] = useState<ArtifactVersionState | null>(
    null,
  );
  const [ignoredBuilderFixes, setIgnoredBuilderFixes] = useState<Set<string>>(() => new Set());
  const [transformLoading, setTransformLoading] = useState(false);
  const [, setTransformsCreated] = useState(0);
  const [builderRootArtifact, setBuilderRootArtifact] = useState<IivoArtifact | null>(null);
  const [builderFocusArtifact, setBuilderFocusArtifact] = useState<IivoArtifact | null>(null);
  const [relatedChildren, setRelatedChildren] = useState<RelatedChild[]>([]);
  const [lastTransformLabel, setLastTransformLabel] = useState<string | undefined>();
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);
  const [versionPersistenceMode, setVersionPersistenceMode] =
    useState<VersionPersistenceMode>("local");
  const [usageSummary, setUsageSummary] = useState<UsageSummaryResponse | null>(null);
  const [creditEstimateLabel, setCreditEstimateLabel] = useState<string | null>(null);
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  const [creditConfirmOpen, setCreditConfirmOpen] = useState(false);
  const [creditConfirmEstimate, setCreditConfirmEstimate] =
    useState<CreditEstimateResponse | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !isOnboardingComplete(),
  );
  const [attachedContext, setAttachedContext] = useState<AttachedContextItem[]>([]);
  const [pasteContextOpen, setPasteContextOpen] = useState(false);
  const [pasteContextMode, setPasteContextMode] = useState<"pasted_text" | "evidence">(
    "pasted_text",
  );
  const [importUrlOpen, setImportUrlOpen] = useState(false);

  const refreshUsage = useCallback(async () => {
    try {
      const next = await fetchUsageSummary();
      setUsageSummary(next);
    } catch {
      /* usage optional when backend offline */
    }
  }, []);

  useEffect(() => {
    return () => {
      revokeAttachmentUrls(attachments);
      revokeAttachmentUrls(submittedAttachments);
    };
    // Revoke blob URLs only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      if (isArchivedView || running) return;
      setAttachmentError(null);
      try {
        const next = await filesToAttachments(files, attachments.length);
        setAttachments((prev) => [...prev, ...next]);
      } catch (err) {
        setAttachmentError(err instanceof Error ? err.message : "Could not attach file.");
      }
    },
    [attachments.length, isArchivedView, running],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) revokeAttachmentUrls([removed]);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleWorkspaceDragEnter = useCallback(
    (e: DragEvent) => {
      if (isArchivedView || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      workspaceDragCounter.current += 1;
      setWorkspaceDragActive(true);
    },
    [isArchivedView, running],
  );

  const handleWorkspaceDragOver = useCallback(
    (e: DragEvent) => {
      if (isArchivedView || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [isArchivedView, running],
  );

  const handleWorkspaceDragLeave = useCallback((e: DragEvent) => {
    if (!isFileDragEvent(e.nativeEvent)) return;
    workspaceDragCounter.current -= 1;
    if (workspaceDragCounter.current <= 0) {
      workspaceDragCounter.current = 0;
      setWorkspaceDragActive(false);
    }
  }, []);

  const handleWorkspaceDrop = useCallback(
    async (e: DragEvent) => {
      if (isArchivedView || running || !isFileDragEvent(e.nativeEvent)) return;
      e.preventDefault();
      workspaceDragCounter.current = 0;
      setWorkspaceDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) await handleAddFiles(files);
    },
    [handleAddFiles, isArchivedView, running],
  );

  const handleSettingsChange = useCallback((next: AppSettings) => {
    setAppSettings(next);
    saveAppSettings(next);
    setMemoryMode(resolveMemoryMode(next));
  }, []);

  const refreshDecisionRecords = useCallback(() => {
    fetch("/api/decisions")
      .then((r) => r.json())
      .then((d: { records: DecisionRecord[]; stats: DecisionLearningStats }) => {
        setDecisionRecords(d.records ?? []);
        setDecisionStats(d.stats ?? null);
      })
      .catch(() => {});
  }, []);

  const refreshHistory = useCallback(() => {
    setHistoryRefreshing(true);
    return fetch("/api/history")
      .then((r) => r.json())
      .then((d: { runs: RunHistorySummary[] }) => {
        setHistory(d.runs ?? []);
        return d.runs ?? [];
      })
      .catch(() => {
        setHistory([]);
        return [] as RunHistorySummary[];
      })
      .finally(() => {
        setHistoryRefreshing(false);
      });
  }, []);

  const refreshMemories = useCallback(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((d: { memories: Memory[] }) => setAllMemories(d.memories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const healthRes = await fetch("/api/health");
        const data = (await healthRes.json()) as { ok: boolean; missingKeys: string[] };
        if (cancelled) return;

        setBackendReachable(true);
        if (!data.ok) {
          setApiWarning(
            `Missing API keys: ${data.missingKeys.join(", ")}. Add them to .env`,
          );
        }
      } catch {
        if (!cancelled) {
          setBackendReachable(false);
        setApiWarning("Cannot reach backend. Is the server running?");
        }
      }

      try {
        const wfRes = await fetch("/api/workflows");
        const wfData = (await wfRes.json()) as { workflows: WorkflowOption[] };
        if (!cancelled) setWorkflows(wfData.workflows ?? []);
      } catch {
        /* workflows optional for status */
      }

      try {
        const vision = await fetchVisionConfig();
        if (!cancelled) setVisionConfigured(vision.configured);
      } catch {
        if (!cancelled) setVisionConfigured(false);
      }

      await refreshHistory();
      if (!cancelled) setWorkspaceBootstrapped(true);
      refreshMemories();
      refreshDecisionRecords();
      void refreshUsage();
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshHistory, refreshMemories, refreshDecisionRecords, refreshUsage]);

  useEffect(() => {
    if (shouldRememberBusinessContext()) {
      const saved = loadSessionBusinessContext();
      if (saved) {
        setBusinessContext(saved);
        setRememberContext(true);
      }
    }
  }, []);

  useEffect(() => {
    userPinnedToBottomRef.current = true;
    const container = threadScrollRef.current;
    if (container) {
      scrollChatContainerToBottom(container, "smooth");
      return;
    }
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [submittedPrompt, conversationTurns.length]);

  useEffect(() => {
    if (!userPinnedToBottomRef.current) return;
    const container = threadScrollRef.current;
    if (container) {
      scrollChatContainerToBottom(container);
      return;
    }
    threadEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [running, outputs.finalJudge, agentMeta, typewriterActive]);

  const handleThreadScroll = useCallback(() => {
    const container = threadScrollRef.current;
    if (!container) return;
    userPinnedToBottomRef.current = isChatScrollNearBottom(container);
  }, []);

  const scrollThreadToBottom = useCallback(() => {
    if (!userPinnedToBottomRef.current) return;
    const container = threadScrollRef.current;
    if (container) {
      scrollChatContainerToBottom(container);
      return;
    }
    threadEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  useEffect(() => {
    if (isArchivedView) return;
    const result = saveConversationThreadToSession(conversationTurns);
    if (result.warning && !result.saved) {
      setApiWarning(result.warning);
    } else if (result.warning) {
      setCopyFeedback(result.warning);
    }
  }, [conversationTurns, isArchivedView]);

  const showCopyFeedback = (msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handlePresetChange = (value: string) => {
    if (isArchivedView) return;
    const next = normalizePresetId(value);
    setPreset(next);
    saveSelectedPreset(next);
    if (value === "ai-front-desk-sales-test") {
      setWorkflow("sales-attack");
      setTokenMode("small");
    }
  };

  const handleClearSelectedPreset = () => {
    if (isArchivedView) return;
    clearSelectedPreset();
    setPreset("none");
    showCopyFeedback("Preset cleared — neutral mode");
  };

  const resetRunState = () => {
    setOutputs(emptyOutputs());
    setAgentMeta(initAgentMeta());
    setRunStatus(null);
    setErrors([]);
    setAgentCosts({});
    setCostSummary(null);
    setRunId(null);
    setAgentLabels(undefined);
    setWorkflowName(null);
    setRouterDecision(null);
    setBenchmarkAnswer(null);
    setBenchmarkCost(null);
    setResearchSources(undefined);
    setResearchAgentMeta(undefined);
    setExecutionTrace(null);
    setStoredDecisionObjective(null);
    setObjectiveInferred(false);
    setDecisionQuality(null);
    setOutcome(undefined);
    setDecisionRecord(null);
    setIncludedMemories([]);
    setActiveMemoryMode(undefined);
    setIgnoredSuggestions([]);
    setBenchmarkChecks({});
    setBenchmarkNotes("");
    setActiveArtifact(null);
    setBuilderModeActive(false);
    setBuilderCanvasDismissed(false);
    setBuilderLoading(false);
  };

  const appendActiveTurnToThread = useCallback(() => {
    if (
      !submittedPrompt &&
      submittedAttachments.length === 0 &&
      submittedAttachedContext.length === 0
    ) {
      return;
    }
    setConversationTurns((prev) => [
      ...prev,
      buildConversationTurnSnapshot({
        userPrompt: submittedPrompt,
        submittedAttachments,
        submittedContext: submittedAttachedContext,
        runId,
        outputs,
        agentMeta,
        agentLabels,
        agentCosts,
        costSummary,
        runStatus,
        workflowName,
        workflow,
        tokenMode,
        routerDecision,
        errors,
        researchSources,
        researchAgentMeta,
        benchmarkAnswer,
        benchmarkCost,
        benchmarkChecks,
        benchmarkNotes,
        executionTrace,
        decisionObjective: storedDecisionObjective,
        objectiveInferred,
        decisionQuality,
        outcome,
        decisionRecord,
        includedMemories,
        memoryMode: activeMemoryMode ?? memoryMode,
        artifact: activeArtifact ?? undefined,
      }),
    ]);
  }, [
    submittedPrompt,
    submittedAttachments,
    submittedAttachedContext,
    runId,
    outputs,
    agentMeta,
    agentLabels,
    agentCosts,
    costSummary,
    runStatus,
    workflowName,
    workflow,
    tokenMode,
    routerDecision,
    errors,
    researchSources,
    researchAgentMeta,
    benchmarkAnswer,
    benchmarkCost,
    benchmarkChecks,
    benchmarkNotes,
    executionTrace,
    storedDecisionObjective,
    objectiveInferred,
    decisionQuality,
    outcome,
    decisionRecord,
    includedMemories,
    activeMemoryMode,
    memoryMode,
    activeArtifact,
  ]);

  const clearConversationThread = useCallback(() => {
    setConversationTurns([]);
    clearConversationThreadSession();
  }, []);

  const activeAnswerText =
    outputs.finalJudge || outputs.strategy || "";

  const applyBuilderModeChoice = useCallback(
    async (accepted: boolean) => {
      setExecutionTrace((prev) => {
        if (!prev) return prev;
        const base =
          prev.artifact ??
          (activeArtifact
            ? {
                artifactType: activeArtifact.type,
                renderMode: activeArtifact.renderMode,
                builderModeSuggested: activeArtifact.renderMode === "canvas",
              }
            : undefined);
        if (!base) return prev;
        return {
          ...prev,
          artifact: { ...base, builderModeAccepted: accepted },
        };
      });
      const id = archivedRunId ?? runId;
      if (id) {
        try {
          await persistBuilderModeAccepted(id, accepted);
        } catch {
          /* best-effort trace persistence */
        }
      }
    },
    [activeArtifact, archivedRunId, runId],
  );

  const bumpBuilderTrace = useCallback(
    (patch: {
      opened?: boolean;
      activeTab?: BuilderWorkspaceTab;
      buildMapCompleteness?: number;
      qualityScore?: number;
      suggestedFixCount?: number;
      versionCount?: number;
      versionPersistence?: VersionPersistenceMode;
      transformsCreated?: number;
      saved?: boolean;
      shareActionUsed?: string;
    }) => {
      setExecutionTrace((prev) => {
        if (!prev?.artifact) return prev;
        return {
          ...prev,
          artifact: {
            ...prev.artifact,
            builder: {
              opened: patch.opened ?? prev.artifact.builder?.opened ?? builderModeActive,
              activeTab: patch.activeTab ?? prev.artifact.builder?.activeTab,
              buildMapCompleteness:
                patch.buildMapCompleteness ?? prev.artifact.builder?.buildMapCompleteness,
              qualityScore: patch.qualityScore ?? prev.artifact.builder?.qualityScore,
              suggestedFixCount:
                patch.suggestedFixCount ?? prev.artifact.builder?.suggestedFixCount,
              versionCount: patch.versionCount ?? prev.artifact.builder?.versionCount,
              versionPersistence:
                patch.versionPersistence ?? prev.artifact.builder?.versionPersistence,
              transformsCreated:
                patch.transformsCreated ?? prev.artifact.builder?.transformsCreated,
              saved: patch.saved ?? prev.artifact.builder?.saved,
              shareActionUsed:
                patch.shareActionUsed ?? prev.artifact.builder?.shareActionUsed,
            },
          },
        };
      });
    },
    [builderModeActive],
  );

  const syncBuilderArtifacts = useCallback((root: IivoArtifact) => {
    setBuilderRootArtifact(root);
    setBuilderFocusArtifact(root);
    void fetchArtifactRelationships(root.id).then(async (rels) => {
      const children: RelatedChild[] = [];
      for (const rel of rels) {
        const cached = loadCachedChildArtifact(rel.childArtifactId);
        const fetched = cached ?? (await fetchChildArtifact(rel.childArtifactId));
        if (fetched) cacheChildArtifact(fetched);
        children.push({ relationship: rel, artifact: fetched ?? undefined });
      }
      setRelatedChildren(children);
    });
  }, []);

  useEffect(() => {
    if (builderModeActive && activeArtifact && !builderRootArtifact) {
      syncBuilderArtifacts(activeArtifact);
    }
  }, [builderModeActive, activeArtifact, builderRootArtifact, syncBuilderArtifacts]);

  useEffect(() => {
    const focus = builderFocusArtifact;
    if (!focus || !builderModeActive) {
      if (!builderModeActive) setArtifactVersionState(null);
      return;
    }
    let cancelled = false;
    void loadMergedVersionState(focus.id, focus.sections).then(({ state, mode }) => {
      if (cancelled) return;
      setArtifactVersionState(state);
      setVersionPersistenceMode(mode);
      bumpBuilderTrace({ versionCount: Object.values(state.sectionVersions).flat().length, versionPersistence: mode });
    });
    return () => {
      cancelled = true;
    };
  }, [builderFocusArtifact?.id, builderModeActive]);

  const handleOpenInBuilder = useCallback(() => {
    if (!activeArtifact || activeArtifact.type === "plain_answer") return;
    syncBuilderArtifacts(activeArtifact);
    setBuilderModeActive(true);
    setBuilderCanvasDismissed(false);
    setBuilderTab("compose");
    bumpBuilderTrace({ opened: true, activeTab: "compose" });
  }, [activeArtifact, bumpBuilderTrace, syncBuilderArtifacts]);

  const handleRegenerateSection = useCallback(
    async (
      section: ArtifactSection,
      options?: { variantType?: SectionVariantType; instruction?: string },
    ) => {
      const focus = builderFocusArtifact ?? activeArtifact;
      if (!focus || !submittedPrompt) return;
      setArtifactSectionLoading(section.id);
      try {
        const { content } = await requestArtifactSectionUpdate({
          userPrompt: submittedPrompt,
          artifactType: focus.type,
          sectionLabel: section.label,
          sectionContent: sectionPlainText(section),
          fullAnswer: activeAnswerText,
          action: "regenerate",
          variantType: options?.variantType,
          editInstruction: options?.instruction,
          tokenMode,
        });
        const oldSection = focus.sections.find((s) => s.id === section.id);
        if (oldSection && artifactVersionState) {
          const { state, mode } = await persistSectionVersion(
            artifactVersionState,
            oldSection,
            options?.variantType ? "variant" : "regenerate",
            { instruction: options?.instruction, variantType: options?.variantType },
          );
          setArtifactVersionState(state);
          setVersionPersistenceMode(mode);
          bumpBuilderTrace({
            versionCount: Object.values(state.sectionVersions).flat().length,
            versionPersistence: mode,
          });
        }
        const updated = updateArtifactSection(focus, section.id, content);
        setBuilderFocusArtifact(updated);
        if (activeArtifact?.id === focus.id) setActiveArtifact(updated);
        if (builderRootArtifact?.id === focus.id) setBuilderRootArtifact(updated);
        showCopyFeedback(`${section.label} regenerated`);
      } catch (err) {
        showCopyFeedback(err instanceof Error ? err.message : "Regenerate failed");
      } finally {
        setArtifactSectionLoading(null);
      }
    },
    [
      activeArtifact,
      builderFocusArtifact,
      builderRootArtifact,
      artifactVersionState,
      submittedPrompt,
      activeAnswerText,
      tokenMode,
      bumpBuilderTrace,
    ],
  );

  const handleEditSectionSave = useCallback(
    async (instruction: string, editedContent: string) => {
      const focus = builderFocusArtifact ?? activeArtifact;
      if (!focus || !submittedPrompt || !editSection) return;
      setArtifactSectionLoading(editSection.id);
      try {
        const { content } = await requestArtifactSectionUpdate({
          userPrompt: submittedPrompt,
          artifactType: focus.type,
          sectionLabel: editSection.label,
          sectionContent: editedContent,
          fullAnswer: activeAnswerText,
          action: "edit",
          editInstruction: instruction || "Apply the user's edits.",
          tokenMode,
        });
        const oldSection = focus.sections.find((s) => s.id === editSection.id);
        if (oldSection && artifactVersionState) {
          const { state, mode } = await persistSectionVersion(artifactVersionState, oldSection, "edit", {
            instruction,
          });
          setArtifactVersionState(state);
          setVersionPersistenceMode(mode);
          bumpBuilderTrace({
            versionCount: Object.values(state.sectionVersions).flat().length,
            versionPersistence: mode,
          });
        }
        const updated = updateArtifactSection(focus, editSection.id, content);
        setBuilderFocusArtifact(updated);
        if (activeArtifact?.id === focus.id) setActiveArtifact(updated);
        if (builderRootArtifact?.id === focus.id) setBuilderRootArtifact(updated);
        setEditSection(null);
        showCopyFeedback(`${editSection.label} updated`);
      } catch (err) {
        showCopyFeedback(err instanceof Error ? err.message : "Edit failed");
      } finally {
        setArtifactSectionLoading(null);
      }
    },
    [
      activeArtifact,
      builderFocusArtifact,
      builderRootArtifact,
      artifactVersionState,
      submittedPrompt,
      editSection,
      activeAnswerText,
      tokenMode,
      bumpBuilderTrace,
    ],
  );

  const handleRestoreVersion = useCallback(
    (versionId: string) => {
      const focus = builderFocusArtifact ?? activeArtifact;
      if (!focus || !artifactVersionState) return;
      const result = restoreSectionVersion(focus, artifactVersionState, versionId);
      if (!result) return;
      setBuilderFocusArtifact(result.artifact);
      if (activeArtifact?.id === focus.id) setActiveArtifact(result.artifact);
      if (builderRootArtifact?.id === focus.id) setBuilderRootArtifact(result.artifact);
      showCopyFeedback("Version restored");
    },
    [activeArtifact, builderFocusArtifact, builderRootArtifact, artifactVersionState],
  );

  const openChildArtifact = useCallback(async (childId: string, inBuilder: boolean) => {
    const cached = loadCachedChildArtifact(childId);
    const child = cached ?? (await fetchChildArtifact(childId));
    if (!child) {
      showCopyFeedback("Child artifact not found");
      return;
    }
    cacheChildArtifact(child);
    if (inBuilder) {
      setBuilderFocusArtifact(child);
      setBuilderTab("compose");
    } else {
      setBuilderFocusArtifact(child);
    }
  }, []);

  const handleArtifactTransform = useCallback(
    async (transformType: import("./types/builderWorkspace").ArtifactTransformType) => {
      const root = builderRootArtifact ?? activeArtifact;
      if (!root || !submittedPrompt) return;
      setTransformLoading(true);
      try {
        const { artifact: child, relationship } = await requestArtifactTransform({
          artifact: root,
          transformType,
          userPrompt: submittedPrompt,
          tokenMode,
          sourceRunId: archivedRunId ?? runId ?? undefined,
        });
        cacheChildArtifact(child);
        saveLocalRelationship(relationship);
        setRelatedChildren((prev) => [
          ...prev.filter((c) => c.relationship.childArtifactId !== child.id),
          { relationship, artifact: child },
        ]);
        setLastTransformLabel(child.title || transformTypeLabel(transformType));
        setTransformsCreated((n) => {
          const next = n + 1;
          bumpBuilderTrace({ transformsCreated: next });
          return next;
        });
        setBuilderTab("execute");
        showCopyFeedback("Transform created — original artifact unchanged");
      } catch (err) {
        showCopyFeedback(err instanceof Error ? err.message : "Transform failed");
      } finally {
        setTransformLoading(false);
      }
    },
    [
      activeArtifact,
      builderRootArtifact,
      submittedPrompt,
      tokenMode,
      bumpBuilderTrace,
      archivedRunId,
      runId,
    ],
  );

  const handleKeepOriginal = useCallback(() => {
    if (builderRootArtifact) setBuilderFocusArtifact(builderRootArtifact);
  }, [builderRootArtifact]);

  const builderContextItems = useMemo(
    () =>
      buildBuilderContextItems(
        submittedAttachedContext,
        executionTrace,
        includedMemories?.map((m) => ({ id: m.id, title: m.title })),
      ),
    [submittedAttachedContext, executionTrace, includedMemories],
  );

  const builderTraceSummary = useMemo(() => {
    const parts: string[] = [];
    if (executionTrace?.responseContract) {
      parts.push(`Contract: ${executionTrace.responseContract.responseContract}`);
    }
    if (executionTrace?.executionMode) {
      parts.push(`Mode: ${executionTrace.executionMode.effectiveExecutionMode}`);
    }
    return parts.join(" · ") || undefined;
  }, [executionTrace]);

  const handleNewDecision = () => {
    if (running) return;
    revokeAttachmentUrls(attachments);
    revokeAttachmentUrls(submittedAttachments);
    setAttachments([]);
    setSubmittedAttachments([]);
    setSubmittedAttachedContext([]);
    setAttachmentError(null);
    setIsArchivedView(false);
    setArchivedRunId(null);
    setSubmittedPrompt(null);
    setPrompt("");
    resetRunState();
    clearConversationThread();
    setWorkflow("auto");
    setSidebarSection("console");
    setSidePanelOpen(false);
  };

  const handleSectionChange = useCallback((section: SidebarSection) => {
    setSidebarSection(section);
    if (MAIN_PANEL_SECTIONS.includes(section) || section === "console") {
      setSidePanelOpen(false);
    } else if (SIDE_PANEL_SECTIONS.includes(section)) {
      setSidePanelOpen(true);
    }
  }, []);

  const handleRunRoutingTest = (test: RoutingTestCase) => {
    if (running) return;
    revokeAttachmentUrls(attachments);
    revokeAttachmentUrls(submittedAttachments);
    setAttachments([]);
    setSubmittedAttachments([]);
    setSubmittedAttachedContext([]);
    setAttachmentError(null);
    setIsArchivedView(false);
    setArchivedRunId(null);
    setSubmittedPrompt(null);
    resetRunState();
    clearConversationThread();
    setWorkflow("auto");
    if (test.preset === "ai-front-desk-sales-test") {
      handlePresetChange("ai-front-desk-sales-test");
    } else {
      handlePresetChange("none");
    }
    setPrompt(test.prompt);
    setSidebarSection("console");
    setSidePanelOpen(false);
    showCopyFeedback(`Test ${test.id}: prompt loaded — press Send with Auto Router`);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const loadHistoryRun = async (id: string, archived = true) => {
    clearConversationThread();
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return;
    const entry = (await res.json()) as CouncilRunResult & {
      prompt: string;
      preset: string;
    };
    setPrompt(entry.prompt ?? "");
    setSubmittedPrompt(entry.prompt ?? "");
    if (entry.preset) setPreset(normalizePresetId(entry.preset));
    applyResultToState(entry, {
      setOutputs,
      setErrors,
      setRunStatus,
      setAgentMeta,
      setAgentCosts,
      setCostSummary,
      setAgentLabels,
      setWorkflowName,
      setRouterDecision,
      setBenchmarkAnswer,
      setBenchmarkCost,
      setResearchSources,
      setResearchAgentMeta,
      setExecutionTrace,
      setDecisionObjective: setStoredDecisionObjective,
      setObjectiveInferred,
      setDecisionQuality,
      setOutcome,
      setDecisionRecord,
      setIncludedMemories,
      setActiveMemoryMode,
      setArtifact: setActiveArtifact,
    });
    setBuilderModeActive(false);
    setBuilderCanvasDismissed(false);
    const record = await fetchDecisionRecordForRun(entry.runId);
    setDecisionRecord(record);
    setRunId(entry.runId);
    if (entry.workflowId) setWorkflow(entry.workflowId);
    if (entry.tokenMode) setTokenMode(entry.tokenMode);
    setBenchmark(Boolean(entry.benchmarkEnabled));
    if (entry.businessContext) setBusinessContext(entry.businessContext);
    if (entry.decisionObjective) setDecisionObjectiveInput(entry.decisionObjective);
    if (archived) {
      setIsArchivedView(true);
      setArchivedRunId(entry.runId);
    }
    setSidebarSection("console");
    setSidePanelOpen(false);
  };

  const handleRerunFromArchive = () => {
    setIsArchivedView(false);
    setArchivedRunId(null);
    setSubmittedPrompt(null);
    resetRunState();
    clearConversationThread();
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const handleRerunFromSidebar = async (id: string) => {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return;
    const entry = (await res.json()) as CouncilRunResult & {
      prompt: string;
      preset: string;
    };
    resetRunState();
    clearConversationThread();
    setPrompt(entry.prompt ?? "");
    setSubmittedPrompt(null);
    if (entry.preset) setPreset(normalizePresetId(entry.preset));
    if (entry.workflowId) setWorkflow(entry.workflowId);
    if (entry.tokenMode) setTokenMode(entry.tokenMode);
    setBenchmark(Boolean(entry.benchmarkEnabled));
    setIsArchivedView(false);
    setArchivedRunId(null);
    setSidebarSection("console");
    setSidePanelOpen(false);
  };

  const copyFinalPlanForRun = async (id: string) => {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return;
    const entry = (await res.json()) as CouncilRunResult;
    const plan = entry.outputs?.finalJudge;
    if (plan) {
      await navigator.clipboard.writeText(plan);
      showCopyFeedback("Final plan copied");
    }
  };

  const deleteHistoryRun = async (id: string) => {
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (archivedRunId === id) {
      setIsArchivedView(false);
      setArchivedRunId(null);
      setSubmittedPrompt(null);
      resetRunState();
      clearConversationThread();
      setPrompt("");
    }
    refreshHistory();
  };

  const handleStop = async () => {
    if (running) {
    abortRef.current?.abort();
    if (runId) {
      try {
        await fetch("/api/run-council/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });
      } catch {
        /* ignore */
      }
    }
      return;
    }
    skipTypewriterRef.current?.();
  };

  const composerRef = useRef<ChatComposerHandle>(null);

  const visionScreenshotAnalysis = useMemo(
    () =>
      visionConfigured &&
      shouldUseVisionDirectAnswer(prompt.trim(), attachedContext),
    [visionConfigured, prompt, attachedContext],
  );

  useEffect(() => {
    if (!backendReachable) return;
    const timer = window.setTimeout(() => {
      void estimateRunCredits({
        workflowId: workflow,
        tokenMode,
        benchmarkEnabled: benchmark,
        prompt: prompt.trim() || undefined,
        route: visionScreenshotAnalysis ? "direct_answer" : undefined,
        visionScreenshotAnalysis,
      })
        .then((estimate) => {
          setCreditEstimateLabel(
            formatEstimateLabel(estimate.estimatedCredits, estimate.workflowId),
          );
        })
        .catch(() => setCreditEstimateLabel(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [backendReachable, workflow, tokenMode, benchmark, prompt, visionScreenshotAnalysis]);

  const executeRun = useCallback(async () => {
    if (
      (!prompt.trim() && attachments.length === 0 && attachedContext.length === 0) ||
      running ||
      isArchivedView
    ) {
      return;
    }
    const userText =
      prompt.trim() ||
      (attachedContext.length > 0
        ? "Analyze the attached context and respond helpfully."
        : "");
    const userPrompt = buildPromptWithAttachments(userText, attachments);
    const attachmentSnapshot = attachments.map((item) => ({ ...item }));
    const contextSnapshot = attachedContext.map((item) => ({ ...item }));
    const conversationContext = buildConversationContextForApi(
      conversationTurns,
      submittedPrompt,
      outputs,
    );

    appendActiveTurnToThread();
    revokeAttachmentUrls(submittedAttachments);
    setCreditWarning(null);
    setSubmittedAttachments(attachmentSnapshot);
    setSubmittedAttachedContext(contextSnapshot);
    setSubmittedPrompt(userText || null);
    setPrompt("");
    setAttachments([]);
    setAttachedContext([]);
    setAttachmentError(null);
    requestAnimationFrame(() => composerRef.current?.focus());
    setRunning(true);
    resetRunState();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/run-council?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          preset,
          tokenMode,
          workflow,
          executionMode: selectedExecutionMode,
          executionModeConfirmationAccepted:
            executionRunFlagsRef.current.confirmationAccepted,
          executionModeConfirmationShown: executionRunFlagsRef.current.confirmationShown,
          inBuilderWorkspace: builderModeActive,
          benchmark,
          decisionObjective: decisionObjective.trim() || undefined,
          businessContext: hasBusinessProfileContent(businessContext)
            ? businessContext
            : undefined,
          memoryMode,
          selectedMemoryIds:
            memoryMode === "manual" ? selectedMemoryIds : undefined,
          conversationContext,
          externalContext: toExternalContextPayload(attachedContext),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        if (response.status === 402) {
          throw new Error(err.error ?? INSUFFICIENT_CREDITS_MESSAGE);
        }
        throw new Error(
          err.error?.toLowerCase().includes("provider") ||
            err.error?.toLowerCase().includes("api")
            ? PROVIDER_FAILURE_MESSAGE
            : (err.error ?? `HTTP ${response.status}`),
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as ProgressEvent;
          if (event.runId && event.runId !== "unknown") setRunId(event.runId);

          if (event.type === "router-complete" && event.routerDecision) {
            setRouterDecision(event.routerDecision);
          }
          if (event.type === "benchmark-complete") {
            if (event.benchmarkAnswer) setBenchmarkAnswer(event.benchmarkAnswer);
            if (event.benchmarkCost) setBenchmarkCost(event.benchmarkCost);
          }
          if (event.type === "agent-start" && event.agent) {
            setAgentMeta((prev) => ({
              ...prev,
              [event.agent!]: {
                ...prev[event.agent!],
                status: "running",
                startedAt: event.startedAt,
                displayName: event.displayName ?? prev[event.agent!]?.displayName,
              },
            }));
          }
          if (event.type === "agent-complete" && event.agent) {
            setOutputs((prev) => ({ ...prev, [event.agent!]: event.output ?? "" }));
            setAgentMeta((prev) => ({
              ...prev,
              [event.agent!]: {
                status: "complete",
                startedAt: event.startedAt,
                completedAt: event.completedAt,
                durationMs: event.durationMs,
                displayName: event.displayName ?? prev[event.agent!]?.displayName,
              },
            }));
            if (event.cost) {
              setAgentCosts((prev) => ({ ...prev, [event.agent!]: event.cost! }));
            }
            if (event.researchSources?.length) {
              setResearchSources(event.researchSources);
            }
            if (event.researchAgentMeta) {
              setResearchAgentMeta(event.researchAgentMeta);
            }
          }
          if (event.type === "agent-error" && event.agent) {
            setAgentMeta((prev) => ({
              ...prev,
              [event.agent!]: {
                status: "error",
                startedAt: event.startedAt,
                completedAt: event.completedAt,
                durationMs: event.durationMs,
                error: event.error,
                displayName: event.displayName ?? prev[event.agent!]?.displayName,
              },
            }));
          }
          if (event.type === "run-complete" && event.result) {
            applyResultToState(event.result, {
              setOutputs,
              setErrors,
              setRunStatus,
              setAgentMeta,
              setAgentCosts,
              setCostSummary,
              setAgentLabels,
              setWorkflowName,
              setRouterDecision,
              setBenchmarkAnswer,
              setBenchmarkCost,
              setResearchSources,
              setResearchAgentMeta,
              setExecutionTrace,
              setDecisionObjective: setStoredDecisionObjective,
              setObjectiveInferred,
              setDecisionQuality,
              setOutcome,
              setDecisionRecord,
              setIncludedMemories,
              setActiveMemoryMode,
              setArtifact: setActiveArtifact,
            });
            if (event.result.artifact?.renderMode === "canvas") {
              setBuilderCanvasDismissed(false);
              setBuilderModeActive(false);
            }
            if (event.result.workflowId) setWorkflow(event.result.workflowId);
            refreshHistory();
            refreshDecisionRecords();
            void refreshUsage();
            setIgnoredSuggestions([]);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setRunStatus("partial");
      } else {
        const message = err instanceof Error ? err.message : "Unknown error";
        const friendly =
          message.includes("Not enough credits") || message.includes("Insufficient")
            ? INSUFFICIENT_CREDITS_MESSAGE
            : /provider|api|request failed|HTTP/i.test(message)
              ? PROVIDER_FAILURE_MESSAGE
              : message;
        setErrors([{ agent: "strategy", message: friendly }]);
        setRunStatus("error");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [
    prompt,
    preset,
    tokenMode,
    workflow,
    benchmark,
    decisionObjective,
    businessContext,
    memoryMode,
    selectedMemoryIds,
    conversationTurns,
    appendActiveTurnToThread,
    attachments,
    running,
    isArchivedView,
    refreshHistory,
    refreshDecisionRecords,
    refreshUsage,
    attachedContext,
    selectedExecutionMode,
    builderModeActive,
  ]);

  const handleExecutionModeChange = useCallback((mode: ExecutionMode) => {
    setSelectedExecutionMode(mode);
    saveExecutionMode(mode);
  }, []);

  const runAfterExecutionGate = useCallback(async () => {
    try {
      const estimate = await estimateRunCredits({
        workflowId: workflow,
        tokenMode,
        benchmarkEnabled: benchmark,
        prompt: prompt.trim() || undefined,
        route: visionScreenshotAnalysis ? "direct_answer" : undefined,
        visionScreenshotAnalysis,
      });
      const currentCredits =
        usageSummary?.currentCredits ?? estimate.currentCredits ?? 0;

      if (currentCredits < estimate.estimatedCredits) {
        setCreditWarning(INSUFFICIENT_CREDITS_MESSAGE);
        return;
      }

      if (
        shouldConfirmCredits({
          estimatedCredits: estimate.estimatedCredits,
          currentCredits,
          tokenMode,
          benchmarkEnabled: benchmark,
          workflowId: estimate.workflowId,
        })
      ) {
        setCreditConfirmEstimate(estimate);
        setCreditConfirmOpen(true);
        return;
      }

      if (
        shouldWarnCredits({
          estimatedCredits: estimate.estimatedCredits,
          currentCredits,
        })
      ) {
        setCreditWarning(
          `This run will use ${estimate.estimatedCredits} credits. You have ${currentCredits} remaining.`,
        );
      } else {
        setCreditWarning(null);
      }
    } catch {
      setCreditWarning(null);
    }

    await executeRun();
    executionRunFlagsRef.current = {};
  }, [
    prompt,
    workflow,
    tokenMode,
    benchmark,
    usageSummary?.currentCredits,
    executeRun,
    visionScreenshotAnalysis,
  ]);

  const handleRun = useCallback(async () => {
    if (
      (!prompt.trim() && attachments.length === 0 && attachedContext.length === 0) ||
      running ||
      isArchivedView
    ) {
      return;
    }

    const needsExecutionPreview =
      selectedExecutionMode === "auto" ||
      (selectedExecutionMode === "builder" && !builderModeActive);

    if (needsExecutionPreview && prompt.trim()) {
      try {
        const preview = await previewExecutionMode(prompt.trim(), selectedExecutionMode, {
          wantsVision: visionScreenshotAnalysis,
          inBuilderWorkspace: builderModeActive,
        });
        if (preview.requiresConfirmation && preview.confirmationKind) {
          if (preview.confirmationKind === "council") {
            setCouncilConfirmOpen(true);
            return;
          }
          if (preview.confirmationKind === "builder") {
            setBuilderPreRunConfirmOpen(true);
            return;
          }
        }
      } catch {
        /* preview unavailable — proceed with server-side gate */
      }
    }

    executionRunFlagsRef.current = {};
    await runAfterExecutionGate();
  }, [
    prompt,
    attachments.length,
    running,
    isArchivedView,
    selectedExecutionMode,
    builderModeActive,
    visionScreenshotAnalysis,
    runAfterExecutionGate,
  ]);

  const confirmCreditRun = useCallback(async () => {
    setCreditConfirmOpen(false);
    setCreditConfirmEstimate(null);
    await executeRun();
    executionRunFlagsRef.current = {};
  }, [executeRun]);

  const handleCouncilKeepQuick = useCallback(() => {
    setCouncilConfirmOpen(false);
    executionRunFlagsRef.current = {
      confirmationShown: true,
      confirmationAccepted: false,
    };
    void runAfterExecutionGate();
  }, [runAfterExecutionGate]);

  const handleCouncilUseCouncil = useCallback(() => {
    setCouncilConfirmOpen(false);
    executionRunFlagsRef.current = {
      confirmationShown: true,
      confirmationAccepted: true,
    };
    void runAfterExecutionGate();
  }, [runAfterExecutionGate]);

  const handleBuilderPreRunOpen = useCallback(() => {
    setBuilderPreRunConfirmOpen(false);
    setBuilderModeActive(true);
    executionRunFlagsRef.current = {
      confirmationShown: true,
      confirmationAccepted: true,
    };
    void runAfterExecutionGate();
  }, [runAfterExecutionGate]);

  const handleBuilderPreRunKeepChat = useCallback(() => {
    setBuilderPreRunConfirmOpen(false);
    executionRunFlagsRef.current = {
      confirmationShown: true,
      confirmationAccepted: false,
    };
    void runAfterExecutionGate();
  }, [runAfterExecutionGate]);

  const saveOutcome = useCallback(
    async (nextOutcome: DecisionOutcome) => {
      const id = archivedRunId ?? runId;
      if (!id) return;
      const res = await fetch(`/api/history/${id}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextOutcome),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as CouncilRunResult;
      setOutcome(updated.outcome);
      const record = await fetchDecisionRecordForRun(id);
      setDecisionRecord(record);
      refreshHistory();
      refreshDecisionRecords();
    },
    [archivedRunId, runId, refreshHistory, refreshDecisionRecords],
  );

  const startDecisionReview = useCallback(
    (record: DecisionRecord | null, promptText?: string, finalAnswer?: string) => {
      const source = record ?? decisionRecord;
      const reviewPrompt = [
        "Review this past decision using the logged outcome. Was the decision good? What was missing? What should I repeat, revise, or abandon next time?",
        "",
        source?.decisionTitle ? `Decision: ${source.decisionTitle}` : "",
        source?.recommendedDecision
          ? `Recommended decision: ${source.recommendedDecision}`
          : "",
        source?.reason ? `Reason: ${source.reason}` : "",
        promptText || source?.originalPrompt
          ? `Original prompt:\n${promptText ?? source?.originalPrompt}`
          : "",
        finalAnswer ? `Prior final answer:\n${finalAnswer.slice(0, 2000)}` : "",
        source?.actionTaken ? `Action taken: ${source.actionTaken}` : "",
        source?.expectedOutcome ? `Expected outcome: ${source.expectedOutcome}` : "",
        source?.actualOutcome ? `Actual outcome: ${source.actualOutcome}` : "",
        source?.resultMetric ? `Metric/result: ${source.resultMetric}` : "",
        source?.lessonsLearned ? `Lessons learned: ${source.lessonsLearned}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const hasOutcomeData = Boolean(
        source?.actionTaken?.trim() ||
          source?.actualOutcome?.trim() ||
          source?.lessonsLearned?.trim() ||
          (source?.outcomeStatus && source.outcomeStatus !== "not_started"),
      );

      void fetch("/api/audit/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "decision_review_started",
          runId: source?.runId,
          metadata: source?.decisionTitle?.slice(0, 120),
        }),
      }).catch(() => {});

      setIsArchivedView(false);
      setArchivedRunId(null);
      setSubmittedPrompt(null);
      resetRunState();
      clearConversationThread();
      setPrompt(reviewPrompt);
      setWorkflow(hasOutcomeData ? "product-decision" : "auto");
      setSidebarSection("console");
      setSidePanelOpen(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [decisionRecord, clearConversationThread],
  );

  const handleReviewDecision = useCallback(() => {
    if (!submittedPrompt && !decisionRecord) return;
    startDecisionReview(
      decisionRecord,
      submittedPrompt ?? undefined,
      outputs.finalJudge || undefined,
    );
  }, [submittedPrompt, decisionRecord, outputs.finalJudge, startDecisionReview]);

  const suggestedMemories: SuggestedMemoryItem[] =
    appSettings.suggestedMemory &&
    !running &&
    runStatus === "complete" &&
    (routerDecision?.selectedWorkflow ?? workflow) !== "direct_answer" &&
    workflowName !== "Direct Answer"
      ? buildSuggestedMemories({
          workflowId: routerDecision?.selectedWorkflow ?? workflow,
          preset,
          finalAnswer: outputs.finalJudge || outputs.strategy,
          decisionQuality,
          researchSources,
          researchMode: researchAgentMeta?.mode,
          projectName: businessContext.name || undefined,
        }).filter((item) => !ignoredSuggestions.includes(item.id))
      : [];

  const openSaveMemory = useCallback((draft: Partial<SaveMemoryDraft>) => {
    if (!appSettings.useMemoryInResponses) {
      showCopyFeedback("Memory is off in Settings");
      return;
    }
    setSaveMemoryDraft({
      projectName:
        businessContext.name ||
        (preset === "ai-front-desk-sales-test" ? "AI Front Desk" : ""),
      relatedRunId: archivedRunId ?? runId ?? "",
      ...draft,
    });
  }, [businessContext.name, preset, archivedRunId, runId, appSettings.useMemoryInResponses]);

  const handleSaveMemoryFromModal = useCallback(
    async (draft: SaveMemoryDraft) => {
      const tags = draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let payload: Record<string, unknown>;
      switch (draft.type) {
        case "project_fact":
          payload = {
            type: "project_fact",
            projectName: draft.projectName.trim(),
            title: draft.title.trim(),
            content: draft.content.trim(),
            tags,
          };
          break;
        case "decision":
          payload = {
            type: "decision",
            projectName: draft.projectName.trim(),
            decision: (draft.decision || draft.title).trim(),
            reason: (draft.reason || draft.content).trim(),
            confidence: draft.confidence ?? "medium",
            status: draft.decisionStatus ?? "active",
            relatedRunId: draft.relatedRunId.trim() || undefined,
          };
          break;
        case "evidence":
          payload = {
            type: "evidence",
            title: draft.title.trim(),
            content: draft.content.trim(),
            sourceUrl: draft.sourceUrl.trim() || undefined,
            sourceType: "manual",
            relatedRunId: draft.relatedRunId.trim() || undefined,
            projectName: draft.projectName.trim() || undefined,
          };
          break;
        case "preference":
          payload = {
            type: "preference",
            title: draft.title.trim(),
            content: draft.content.trim(),
            scope: draft.projectName.trim() ? "project" : "global",
            projectName: draft.projectName.trim() || undefined,
          };
          break;
        default:
          return;
      }

      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaveMemoryDraft(null);
      refreshMemories();
      showCopyFeedback("Saved to Memory Vault");
    },
    [refreshMemories],
  );

  const handleSaveSuggestedMemory = useCallback(
    async (item: SuggestedMemoryItem) => {
      openSaveMemory(item.draft);
    },
    [openSaveMemory],
  );

  const isSettingsView = sidebarSection === "settings";
  const isTrustView = sidebarSection === "trust";
  const isDecisionLearningView = sidebarSection === "decision-learning";
  const isBenchmarkLabView = sidebarSection === "benchmark-lab";
  const isContextLibraryView = sidebarSection === "context-library";
  const isPanelView =
    isSettingsView ||
    isTrustView ||
    isDecisionLearningView ||
    isBenchmarkLabView ||
    isContextLibraryView;

  const openUsageSettings = useCallback(() => {
    handleSectionChange("settings");
  }, [handleSectionChange]);

  const isLandingState =
    conversationTurns.length === 0 &&
    !submittedPrompt &&
    !running &&
    !isArchivedView &&
    !isPanelView;

  const addAttachedContext = useCallback((item: AttachedContextItem) => {
    setAttachedContext((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      if (prev.length >= MAX_ATTACHED_CONTEXT_ITEMS) {
        showCopyFeedback(`Maximum ${MAX_ATTACHED_CONTEXT_ITEMS} context items attached`);
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const removeAttachedContext = useCallback((id: string) => {
    setAttachedContext((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useLensHandoff({
    enabled: workspaceBootstrapped,
    onboardingOpen: showOnboarding,
    visionConfigured,
    onAttach: addAttachedContext,
    onSetPrompt: setPrompt,
    onFeedback: (msg) => {
      setLensHandoffError(null);
      showCopyFeedback(msg);
    },
    onError: setLensHandoffError,
  });

  const attachedContextForComposer = useMemo(
    () => computeAttachmentTruncationHints(attachedContext),
    [attachedContext],
  );

  const formToAttached = useCallback(
    (form: PasteContextFormValues, type = form.type): AttachedContextItem =>
      ephemeralAttached({
        type,
        title: form.title.trim(),
        sourceUrl: form.sourceUrl.trim() || undefined,
        contentText: form.contentText.trim(),
      }),
    [],
  );

  const handleContextBridgeAction = useCallback(
    (action: ContextBridgeMenuAction) => {
      if (action === "paste-context") {
        setPasteContextMode("pasted_text");
        setPasteContextOpen(true);
        return;
      }
      if (action === "import-url") {
        setImportUrlOpen(true);
        return;
      }
      if (action === "save-evidence") {
        setPasteContextMode("evidence");
        setPasteContextOpen(true);
        return;
      }
      if (action === "ask-iivo") {
        if (attachedContext.length > 0) {
          const sourceUrl = attachedContext.find((i) => i.sourceUrl)?.sourceUrl;
          setPrompt(buildAskIivoPrompt(sourceUrl));
          requestAnimationFrame(() => composerRef.current?.focus());
        } else {
          setPasteContextMode("pasted_text");
          setPasteContextOpen(true);
        }
      }
    },
    [attachedContext],
  );

  const handlePasteAddToPrompt = useCallback(
    (form: PasteContextFormValues) => {
      addAttachedContext(formToAttached(form));
      showCopyFeedback("Context attached to prompt");
    },
    [addAttachedContext, formToAttached],
  );

  const handlePasteSaveEvidence = useCallback(async (form: PasteContextFormValues) => {
    const saved = await createContextItem({
      type: form.type === "evidence" ? "evidence" : "pasted_text",
      title: form.title.trim(),
      sourceUrl: form.sourceUrl.trim() || undefined,
      contentText: form.contentText.trim(),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      project: form.project.trim() || undefined,
    });
    addAttachedContext({
      ...formToAttached(form, saved.type),
      savedId: saved.id,
      id: saved.id,
      ephemeral: false,
    });
    showCopyFeedback("Saved as evidence");
  }, [addAttachedContext, formToAttached]);

  const handlePasteSaveAndAsk = useCallback(
    async (form: PasteContextFormValues) => {
      await handlePasteSaveEvidence(form);
      setPrompt(buildAskIivoPrompt(form.sourceUrl.trim() || undefined));
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [handlePasteSaveEvidence],
  );

  const handleUrlImported = useCallback(
    (item: { title: string; sourceUrl: string; contentText: string }) => {
      addAttachedContext(
        ephemeralAttached({
          type: "url",
          title: item.title,
          sourceUrl: item.sourceUrl,
          contentText: item.contentText,
        }),
      );
      showCopyFeedback("URL imported and attached");
    },
    [addAttachedContext],
  );

  const handleUrlImportedAndAsk = useCallback(
    async (item: {
      title: string;
      sourceUrl: string;
      contentText: string;
      extractedAt?: string;
    }) => {
      const saved = await createContextItem({
        type: "url",
        title: item.title,
        sourceUrl: item.sourceUrl,
        contentText: item.contentText,
        importedAt: item.extractedAt,
      });
      addAttachedContext({
        id: saved.id,
        savedId: saved.id,
        ephemeral: false,
        type: "url",
        title: saved.title,
        sourceUrl: saved.sourceUrl,
        contentText: saved.contentText,
      });
      setPrompt(buildAskIivoPrompt(item.sourceUrl));
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [addAttachedContext],
  );

  const handleAnalyzeScreenshot = useCallback(
    (item: ContextItem) => {
      addAttachedContext(attachedFromSavedItem(item));
      setPrompt(buildAskIivoScreenshotPrompt(item, { visionConfigured }));
      handleSectionChange("console");
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [addAttachedContext, visionConfigured, handleSectionChange],
  );

  const composerProps = {
    prompt,
    onPromptChange: setPrompt,
    onSubmit: handleRun,
    onStop: handleStop,
    running: running || typewriterActive,
    disabled: isArchivedView,
    preset,
    onPresetChange: handlePresetChange,
    workflow,
    onWorkflowChange: setWorkflow,
    workflows,
    executionMode: selectedExecutionMode,
    onExecutionModeChange: handleExecutionModeChange,
    tokenMode,
    onTokenModeChange: setTokenMode,
    benchmark,
    onBenchmarkChange: setBenchmark,
    decisionObjective,
    onDecisionObjectiveChange: setDecisionObjectiveInput,
    businessContext,
    onBusinessContextChange: (ctx: BusinessContext) => {
      setBusinessContext(ctx);
      if (rememberContext) saveSessionBusinessContext(ctx, true);
    },
    rememberContext,
    onRememberContextChange: (v: boolean) => {
      setRememberContext(v);
      if (v) saveSessionBusinessContext(businessContext, true);
      else saveSessionBusinessContext(businessContext, false);
    },
    attachments,
    onRemoveAttachment: handleRemoveAttachment,
    onAddFiles: handleAddFiles,
    attachmentError,
    globalDragActive: workspaceDragActive,
    creditEstimateLabel,
    attachedContext: attachedContextForComposer,
    onRemoveAttachedContext: removeAttachedContext,
    onPreviewAttachedContext: (item: AttachedContextItem) => {
      showCopyFeedback(item.title);
    },
    onContextBridgeAction: handleContextBridgeAction,
    visionConfigured,
  };

  useEffect(() => {
    if (isLandingState) {
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [isLandingState]);

  const workspaceStatus: "loading" | "ready" | "degraded" | "offline" | "syncing" =
    !workspaceBootstrapped
      ? "loading"
      : !backendReachable
        ? "offline"
        : historyRefreshing
          ? "syncing"
          : apiWarning
            ? "degraded"
            : "ready";

  const lensHandoffErrorBanner = lensHandoffError ? (
    <div
      className={`banner warning lens-handoff-error-banner${isLandingState && !isPanelView ? " landing-banner" : " thread-banner"}`}
      data-testid="lens-handoff-error"
      role="alert"
    >
      <span>{lensHandoffError}</span>
            <button
        type="button"
        className="banner-dismiss"
        data-testid="lens-handoff-error-dismiss"
        onClick={() => setLensHandoffError(null)}
      >
        Dismiss
            </button>
          </div>
  ) : null;

              return (
    <div className="app">
      <Sidebar
        section={sidebarSection}
        onSectionChange={handleSectionChange}
        sidePanelOpen={sidePanelOpen}
        onSidePanelToggle={() => setSidePanelOpen((open) => !open)}
        history={history}
        selectedRunId={archivedRunId ?? runId}
        filter={historyFilter}
        onFilterChange={setHistoryFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewDecision={handleNewDecision}
        onOpenRun={(id) => loadHistoryRun(id, true)}
        onCopyFinalPlan={copyFinalPlanForRun}
        onDeleteRun={deleteHistoryRun}
        onRerun={handleRerunFromSidebar}
      />

      <div
        className={`workspace chat-workspace${isLandingState ? " landing-mode" : " conversation-mode"}${workspaceDragActive ? " workspace-drag-active" : ""}`}
        onDragEnter={handleWorkspaceDragEnter}
        onDragOver={handleWorkspaceDragOver}
        onDragLeave={handleWorkspaceDragLeave}
        onDrop={handleWorkspaceDrop}
      >
        {!isPanelView && (
          <WorkspaceHeader
            status={workspaceStatus}
            usage={usageSummary}
            onUsageClick={openUsageSettings}
          />
        )}
        {lensHandoffErrorBanner}
        {workspaceDragActive && !isArchivedView && !isPanelView && (
          <div className="workspace-drop-overlay" aria-hidden="true">
            <div className="workspace-drop-overlay-inner">
              <span className="workspace-drop-icon">⬆</span>
              <strong>Drop files to attach</strong>
              <span className="muted">Images, documents, and text files</span>
                  </div>
                    </div>
        )}
        {isPanelView ? (
          <div className="panel-workspace-scroll">
            {apiWarning && <div className="banner warning thread-banner">{apiWarning}</div>}
            {creditWarning && (
              <div className="banner credit-warning thread-banner" role="status">
                {creditWarning}
                    </div>
            )}
            {copyFeedback && <div className="banner success thread-banner">{copyFeedback}</div>}
            {isSettingsView && (
              <SettingsPanel
                settings={appSettings}
                onSettingsChange={handleSettingsChange}
                selectedMemoryIds={selectedMemoryIds}
                onSelectedMemoryIdsChange={(ids) => {
                  setSelectedMemoryIds(ids);
                  saveSelectedMemoryIds(ids);
                }}
                allMemories={allMemories}
                onOpenMemoryVault={() => handleSectionChange("memory")}
                onRefreshMemories={refreshMemories}
                onRefreshHistory={refreshHistory}
                onFeedback={showCopyFeedback}
                onRunRoutingTest={handleRunRoutingTest}
                onUsageChange={setUsageSummary}
                onResetOnboarding={() => setShowOnboarding(true)}
                onClearSelectedPreset={handleClearSelectedPreset}
                selectedPresetId={preset}
              />
            )}
            {isTrustView && (
              <TrustPrivacyPanel onOpenSettings={() => handleSectionChange("settings")} />
            )}
            {isDecisionLearningView && (
              <DecisionLearningPanel
                records={decisionRecords}
                stats={decisionStats}
                onOpenRun={(id) => loadHistoryRun(id, true)}
                onReview={(record) => startDecisionReview(record)}
              />
            )}
            {isBenchmarkLabView && (
              <BenchmarkLabPanel onFeedback={showCopyFeedback} />
            )}
            {isContextLibraryView && (
              <ContextLibraryPanel
                onAttach={(item) => {
                  addAttachedContext(item);
                  handleSectionChange("console");
                  requestAnimationFrame(() => composerRef.current?.focus());
                }}
                onAnalyzeScreenshot={handleAnalyzeScreenshot}
                visionConfigured={visionConfigured}
                onFeedback={showCopyFeedback}
              />
                    )}
                  </div>
        ) : isLandingState ? (
          <div className="workspace-landing-shell">
            {apiWarning && <div className="banner warning landing-banner">{apiWarning}</div>}
            {creditWarning && (
              <div className="banner credit-warning landing-banner" role="status">
                {creditWarning}
                </div>
            )}
            {copyFeedback && <div className="banner success landing-banner">{copyFeedback}</div>}
            <LandingView>
              <ChatComposer ref={composerRef} {...composerProps} layout="landing" />
            </LandingView>
          </div>
        ) : builderModeActive && activeArtifact && builderFocusArtifact && builderRootArtifact ? (
          <BuilderCanvas
            artifact={builderFocusArtifact}
            rootArtifact={builderRootArtifact}
            runId={archivedRunId ?? runId}
            loading={builderLoading}
            activeTab={builderTab}
            onTabChange={(tab) => {
              setBuilderTab(tab);
              bumpBuilderTrace({ activeTab: tab, opened: true });
            }}
            onBackToChat={() => {
              setBuilderModeActive(false);
              setBuilderLoading(false);
              setBuilderFocusArtifact(builderRootArtifact);
              bumpBuilderTrace({ opened: false });
            }}
            onFeedback={showCopyFeedback}
            onRegenerateSection={handleRegenerateSection}
            onEditSection={(section: ArtifactSection) => setEditSection(section)}
            onTransform={handleArtifactTransform}
            onRestoreVersion={handleRestoreVersion}
            onCompareVersion={(id) => setCompareVersionId(id)}
            compareVersionId={compareVersionId}
            onCloseCompare={() => setCompareVersionId(null)}
            relatedChildren={relatedChildren}
            lastTransformLabel={lastTransformLabel}
            onOpenChild={(id) => void openChildArtifact(id, false)}
            onOpenChildInBuilder={(id) => void openChildArtifact(id, true)}
            onKeepOriginal={handleKeepOriginal}
            loadingSectionId={artifactSectionLoading}
            transformLoading={transformLoading}
            contextItems={builderContextItems}
            versionState={artifactVersionState?.sectionVersions ?? {}}
            ignoredFixes={ignoredBuilderFixes}
            onIgnoreFix={(id) =>
              setIgnoredBuilderFixes((prev) => new Set([...prev, id]))
            }
            traceSummary={builderTraceSummary}
            onSavedChange={(saved) => bumpBuilderTrace({ saved })}
            onShareAction={(action) => bumpBuilderTrace({ shareActionUsed: action })}
            onBuilderTraceUpdate={(patch) =>
              bumpBuilderTrace({
                opened: true,
                versionPersistence: versionPersistenceMode,
                ...patch,
              })
            }
          />
        ) : (
          <>
            <div className="chat-thread-scroll" ref={threadScrollRef} onScroll={handleThreadScroll}>
              {apiWarning && <div className="banner warning thread-banner">{apiWarning}</div>}
              {copyFeedback && <div className="banner success thread-banner">{copyFeedback}</div>}

              <ConversationView
                completedTurns={isArchivedView ? [] : conversationTurns}
                submittedPrompt={submittedPrompt}
                submittedAttachments={submittedAttachments}
                submittedAttachedContext={submittedAttachedContext}
                running={running}
                isArchivedView={isArchivedView}
                onCopyFinalPlan={() =>
                  outputs.finalJudge &&
                  navigator.clipboard
                    .writeText(outputs.finalJudge)
                    .then(() => showCopyFeedback("Final plan copied"))
                }
                onRerun={handleRerunFromArchive}
                outputs={outputs}
                agentMeta={agentMeta}
                agentLabels={agentLabels}
                agentCosts={agentCosts}
                costSummary={costSummary}
                runStatus={runStatus}
                workflowName={workflowName}
                workflow={workflow}
                tokenMode={tokenMode}
                workflows={workflows}
                routerDecision={routerDecision}
                routerPending={running && workflow === "auto" && !routerDecision}
                errors={errors}
                researchSources={researchSources}
                researchAgentMeta={researchAgentMeta}
                benchmarkAnswer={benchmarkAnswer}
                benchmarkCost={benchmarkCost}
                benchmarkChecks={benchmarkChecks}
                benchmarkNotes={benchmarkNotes}
                onBenchmarkCheck={(label, checked) =>
                  setBenchmarkChecks((prev) => ({ ...prev, [label]: checked }))
                }
                onBenchmarkNotes={setBenchmarkNotes}
                executionTrace={executionTrace}
                decisionObjective={storedDecisionObjective}
                objectiveInferred={objectiveInferred}
                decisionQuality={decisionQuality}
                outcome={outcome}
                decisionRecord={decisionRecord}
                runId={archivedRunId ?? runId}
                onSaveOutcome={saveOutcome}
                onReviewDecision={handleReviewDecision}
                includedMemories={includedMemories}
                memoryMode={activeMemoryMode ?? memoryMode}
                memoryEnabled={appSettings.useMemoryInResponses}
                onOpenSaveMemory={
                  appSettings.useMemoryInResponses ? openSaveMemory : undefined
                }
                suggestedMemories={suggestedMemories}
                onSaveSuggestedMemory={handleSaveSuggestedMemory}
                onIgnoreSuggestedMemory={(id) =>
                  setIgnoredSuggestions((prev) => [...prev, id])
                }
                typewriterAnimate={!isArchivedView}
                typewriterResetKey={archivedRunId ?? runId ?? submittedPrompt ?? "run"}
                onTypewriterActiveChange={setTypewriterActive}
                onTypewriterProgress={scrollThreadToBottom}
                onRegisterTypewriterSkip={(skip) => {
                  skipTypewriterRef.current = skip;
                }}
                artifact={activeArtifact}
                builderModeActive={builderModeActive}
                builderCanvasDismissed={builderCanvasDismissed}
                onBuilderModeContinue={() => {
                  void applyBuilderModeChoice(true);
                  if (activeArtifact) syncBuilderArtifacts(activeArtifact);
                  setBuilderLoading(true);
                  setBuilderModeActive(true);
                  setBuilderCanvasDismissed(false);
                  setBuilderTab("compose");
                  bumpBuilderTrace({ opened: true, activeTab: "compose" });
                  window.setTimeout(() => setBuilderLoading(false), 800);
                }}
                onBuilderModeKeepInChat={() => {
                  void applyBuilderModeChoice(false);
                  setBuilderCanvasDismissed(true);
                }}
                onCopyFeedback={showCopyFeedback}
                onRegenerateSection={handleRegenerateSection}
                onEditSection={(section: ArtifactSection) => setEditSection(section)}
                loadingSectionId={artifactSectionLoading}
                onOpenInBuilder={
                  activeArtifact && activeArtifact.type !== "plain_answer"
                    ? handleOpenInBuilder
                    : undefined
                }
              />
              <div ref={threadEndRef} />
            </div>

            {!isArchivedView && (
              <ChatComposer ref={composerRef} {...composerProps} layout="pinned" />
            )}
          </>
        )}
            </div>

      {saveMemoryDraft && (
        <SaveMemoryModal
          initialDraft={saveMemoryDraft}
          onClose={() => setSaveMemoryDraft(null)}
          onSave={handleSaveMemoryFromModal}
        />
      )}

      <CouncilModeConfirm
        open={councilConfirmOpen}
        onKeepQuick={handleCouncilKeepQuick}
        onUseCouncil={handleCouncilUseCouncil}
      />

      <BuilderModeConfirm
        open={builderPreRunConfirmOpen}
        onContinue={handleBuilderPreRunOpen}
        onKeepInChat={handleBuilderPreRunKeepChat}
      />

      <CreditConfirmModal
        open={creditConfirmOpen}
        estimate={creditConfirmEstimate}
        currentCredits={usageSummary?.currentCredits ?? creditConfirmEstimate?.currentCredits ?? 0}
        onConfirm={() => void confirmCreditRun()}
        onCancel={() => {
          setCreditConfirmOpen(false);
          setCreditConfirmEstimate(null);
        }}
      />

      {showOnboarding && (
        <OnboardingModal
          onComplete={() => setShowOnboarding(false)}
          onOpenSettings={() => handleSectionChange("settings")}
        />
      )}

      <PasteContextModal
        open={pasteContextOpen}
        initialType={pasteContextMode}
        onClose={() => setPasteContextOpen(false)}
        onAddToPrompt={handlePasteAddToPrompt}
        onSaveEvidence={handlePasteSaveEvidence}
        onSaveAndAsk={handlePasteSaveAndAsk}
      />

      <ImportUrlModal
        open={importUrlOpen}
        onClose={() => setImportUrlOpen(false)}
        onImported={handleUrlImported}
        onImportedAndAsk={handleUrlImportedAndAsk}
      />

      <ArtifactEditModal
        open={editSection != null}
        sectionLabel={editSection?.label ?? ""}
        initialContent={editSection ? sectionPlainText(editSection) : ""}
        loading={artifactSectionLoading === editSection?.id}
        onClose={() => setEditSection(null)}
        onSave={(instruction, editedContent) =>
          void handleEditSectionSave(instruction, editedContent)
        }
      />
    </div>
  );
}

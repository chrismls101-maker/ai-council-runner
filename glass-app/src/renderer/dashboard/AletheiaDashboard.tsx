import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, MicOff, Eye, History, LayoutGrid, Server, Shield, Sparkles, Zap } from "lucide-react";
import type { GlassCapabilityRow } from "../../shared/glassCapabilities.ts";
import type { GlassState, MessageRow, SessionRowWithMeta } from "../../shared/ipc.ts";
import { formatRelativeTime } from "../../shared/relativeTime.ts";
import type { PermissionDomainRow } from "../../shared/aletheiaPermissionControlPlane.ts";
import type { ObservationSignalRow as ObservationSignalRowData } from "../../shared/aletheiaObservationSignals.ts";
import { observationSignalStatusLabel } from "../../shared/aletheiaObservationSignals.ts";
import { activationPhaseLabel } from "../../shared/aletheiaActivationPolicy.ts";
import {
  operatingModeLabel,
  resolveAletheiaPersonaBehavior,
} from "../../shared/aletheiaPersonaBehavior.ts";
import { MemoryNotesPanel } from "./memoryNotes/MemoryNotesPanel.tsx";
import "./memoryNotes/memoryNotes.css";
import type { AletheiaAttentionRecoverySnapshot } from "../../shared/aletheiaAttentionRecovery.ts";
import type { AletheiaRelationshipThreadSnapshot } from "../../shared/aletheiaRelationshipThread.ts";
import { relationshipEventKindLabel } from "../../shared/aletheiaRelationshipThread.ts";
import type { AletheiaDisplayAwarenessSnapshot } from "../../shared/aletheiaDisplayAwareness.ts";
import type { ConnectedDisplaySnapshot } from "../../shared/displayInfo.ts";
import type { AletheiaTrustActivitySnapshot } from "../../shared/aletheiaTrustLedger.ts";
import { kindLabel, stageLabel } from "../../shared/aletheiaTrustLedger.ts";
import type { SecurityHiveSnapshot } from "../../shared/aletheiaSecurityHive.ts";
import { agentLabel, threatCategoryLabel } from "../../shared/aletheiaSecurityHive.ts";
import {
  DEPLOYED_EXECUTION_HEADER_LABEL,
  isFounderAccount,
  type AletheiaDeployedExecutionSnapshot,
} from "../../shared/aletheiaFounderCommandTier.ts";
import { resolveAletheiaSurface } from "../../shared/aletheiaSurfaceDoctrine.ts";
import { pendingAletheiaAdviceCards } from "../../shared/aletheiaPendingAdvice.ts";
import type { AletheiaAdviceCard } from "../../shared/aletheiaPendingAdvice.ts";
import { formatActionConfirmationCard } from "../../shared/aletheiaActionConfirmation.ts";
import type { SidecarServiceRow } from "../../shared/aletheiaSidecarManager.ts";
import type { DependencyRow } from "../../shared/aletheiaDependencyManifest.ts";
import { useGlassState } from "../useGlassState.ts";
import { dispatchAletheiaCommand } from "../../shared/aletheiaAuthority.ts";
import {
  computerOperatorLiveProgressLocation,
  isComputerOperatorActivePhase,
  isComputerOperatorLiveUiSurface,
} from "../../shared/aletheiaComputerOperatorPresence.ts";
import { ensureAletheiaDispatchRegistered } from "../aletheia/registerAletheiaDispatch.ts";
import { useGlassCompanion } from "../companion/GlassCompanionProvider.tsx";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { armAletheiaDashboardOverlayPointer } from "../glassTextInteraction.ts";
import "./AletheiaDashboard.css";

type AletheiaDashboardProps = {
  visible?: boolean;
  onClose?: () => void;
};

type AletheiaDashboardNav =
  | "overview"
  | "command"
  | "presence"
  | "observation"
  | "trust"
  | "sessions"
  | "systems"
  | "computer";

const PRIVACY_DEFAULT_MS = 10 * 60 * 1000;

export function AletheiaDashboard({ visible = true, onClose }: AletheiaDashboardProps): JSX.Element {
  const glassState = useGlassState();
  const companion = useGlassCompanion();
  const [activeNav, setActiveNav] = useState<AletheiaDashboardNav>("overview");

  useEffect(() => {
    ensureAletheiaDispatchRegistered();
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("glass-body--workspace-active");
    armAletheiaDashboardOverlayPointer();
    return () => {
      document.body.classList.remove("glass-body--workspace-active");
    };
  }, [visible]);

  useEffect(() => {
    const onNav = (event: Event): void => {
      const nav = (event as CustomEvent<string>).detail;
      const allowed: AletheiaDashboardNav[] = [
        "overview",
        "command",
        "presence",
        "observation",
        "trust",
        "sessions",
        "systems",
        "computer",
      ];
      if (allowed.includes(nav as AletheiaDashboardNav)) {
        setActiveNav(nav as AletheiaDashboardNav);
      }
    };
    window.addEventListener("aletheia-dashboard-nav", onNav);
    return () => window.removeEventListener("aletheia-dashboard-nav", onNav);
  }, []);

  const companionActive = glassState.companionModeActive === true;
  const privacyActive = glassState.companionPrivacy?.active === true;
  const statusLabel = companion.active ? companion.statusLabel : "Aletheia · Off";

  const serverDegraded = useMemo(() => {
    const runtimeReason = glassState.iivoServerDegradedReason?.trim();
    const server = glassState.setupCapabilities?.find((row) => row.id === "server");
    const setupOffline = server?.severity === "error";
    if (!runtimeReason && !setupOffline) return null;
    return (
      runtimeReason ??
      server?.detail ??
      "IIVO server offline — live translate, server STT, memory vault, and AI notes are unavailable."
    );
  }, [glassState.iivoServerDegradedReason, glassState.setupCapabilities]);

  const handleClose = useCallback((): void => {
    if (onClose) {
      onClose();
      return;
    }
    window.glass.closeAletheiaDashboard();
  }, [onClose]);

  const handleActivate = useCallback((): void => {
    if (!companionActive) {
      dispatchAletheiaCommand("toggle-companion-mode");
    }
  }, [companionActive]);

  const handleDeactivate = useCallback((): void => {
    if (!companionActive) return;
    if (glassState.agentRun?.status === "running") {
      dispatchAletheiaCommand("stop-everything");
      return;
    }
    dispatchAletheiaCommand("toggle-companion-mode");
  }, [companionActive, glassState.agentRun?.status]);

  const handlePrivacyStart = useCallback((): void => {
    dispatchAletheiaCommand("companion-privacy-start", { durationMs: PRIVACY_DEFAULT_MS });
  }, []);

  const handlePrivacyEnd = useCallback((): void => {
    dispatchAletheiaCommand("companion-privacy-end");
  }, []);

  const handleOpenGlassSetup = useCallback((): void => {
    dispatchAletheiaCommand("open-glass-setup");
  }, []);

  const handleOpenGlassMemory = useCallback((): void => {
    dispatchAletheiaCommand("open-glass-memory");
  }, []);

  const handleDismissPermissionAlert = useCallback((): void => {
    dispatchAletheiaCommand("dismiss-aletheia-permission-alert");
  }, []);

  const handleDismissSidecarAlert = useCallback((): void => {
    dispatchAletheiaCommand("dismiss-aletheia-sidecar-alert");
  }, []);

  const handleDismissSecurityContainment = useCallback((): void => {
    dispatchAletheiaCommand("dismiss-aletheia-security-containment");
  }, []);

  const handleInvokeDeployedExecution = useCallback((): void => {
    dispatchAletheiaCommand("invoke-aletheia-deployed-execution");
  }, []);

  const handleDeactivateDeployedExecution = useCallback((): void => {
    dispatchAletheiaCommand("deactivate-aletheia-deployed-execution");
  }, []);

  const handleRunBootstrap = useCallback((): void => {
    dispatchAletheiaCommand("run-aletheia-bootstrap");
  }, []);

  const permissionPlane = glassState.aletheiaPermissionPlane;
  const permissionAlert = glassState.aletheiaPermissionAlert;
  const sidecarPlane = glassState.aletheiaSidecarPlane;
  const sidecarAlert = glassState.aletheiaSidecarAlert;
  const dependencyManifest = glassState.aletheiaDependencyManifest;
  const observationPlane = glassState.aletheiaObservationPlane;
  const activation = glassState.aletheiaActivation;
  const ambientSynthesis = glassState.aletheiaAmbientSynthesis;
  const pendingAdvice = glassState.aletheiaPendingAdvice;
  const actionPipeline = glassState.aletheiaActionPipeline;
  const boundedLoop = glassState.aletheiaBoundedLoop;
  const agentActivity = glassState.aletheiaAgentActivity;
  const delegatedPresence = glassState.aletheiaDelegatedPresence;
  const delegatedLoop = glassState.aletheiaDelegatedLoop;
  const computerOperator = glassState.aletheiaComputerOperator;
  const researchConversation = glassState.aletheiaResearchConversation;
  const aletheiaNotes = glassState.aletheiaNotes;
  const attentionRecovery = glassState.aletheiaAttentionRecovery;
  const relationshipThread = glassState.aletheiaRelationshipThread;
  const displayAwareness = glassState.aletheiaDisplayAwareness;
  const trustActivity = glassState.aletheiaTrustActivity;
  const securityHive = glassState.aletheiaSecurityHive;
  const deployedExecution = glassState.aletheiaDeployedExecution;
  const founderAccount = isFounderAccount(glassState.iivoAccountLink);
  const personaBehavior = useMemo(
    () =>
      glassState.aletheiaPersonaBehavior
      ?? resolveAletheiaPersonaBehavior({
        persona: glassState.persona,
        accountLink: glassState.iivoAccountLink,
        glassDevMode: glassState.glassDevMode,
        deployedExecutionActive: deployedExecution?.active === true,
      }),
    [
      glassState.aletheiaPersonaBehavior,
      glassState.persona,
      glassState.iivoAccountLink,
      glassState.glassDevMode,
      deployedExecution?.active,
    ],
  );

  const handleApproveAdvice = useCallback((adviceId: string): void => {
    dispatchAletheiaCommand("approve-aletheia-advice", { adviceId });
  }, []);

  const handleDismissAdvice = useCallback((adviceId: string): void => {
    dispatchAletheiaCommand("dismiss-aletheia-advice", { adviceId });
  }, []);

  const handleConfirmAction = useCallback((intentId: string): void => {
    dispatchAletheiaCommand("confirm-aletheia-action", { intentId });
  }, []);

  const handleRejectAction = useCallback((intentId: string): void => {
    dispatchAletheiaCommand("reject-aletheia-action", { intentId });
  }, []);

  const handleModifyAction = useCallback((intentId: string, modifier: string): void => {
    dispatchAletheiaCommand("modify-aletheia-action", { intentId, modifier });
  }, []);

  const handleContinueLoop = useCallback((): void => {
    dispatchAletheiaCommand("continue-aletheia-loop");
  }, []);

  const handleCancelLoop = useCallback((): void => {
    dispatchAletheiaCommand("cancel-aletheia-loop");
  }, []);

  const handleGrantComputerSession = useCallback((loopId: string, goal?: string): void => {
    dispatchAletheiaCommand("grant-aletheia-computer-session", {
      loopId,
      ...(goal?.trim() ? { goal: goal.trim() } : {}),
    });
  }, []);

  const handleCancelComputerOperator = useCallback((): void => {
    dispatchAletheiaCommand("cancel-aletheia-computer-operator");
  }, []);

  const handlePrepareComputerOperator = useCallback((goal?: string): void => {
    dispatchAletheiaCommand("prepare-aletheia-computer-operator", {
      ...(goal?.trim() ? { goal: goal.trim() } : {}),
      surface: "dashboard",
    });
  }, []);

  const handleRevokeComputerGrant = useCallback((grantId: string): void => {
    dispatchAletheiaCommand("revoke-aletheia-computer-persistent-grant", { grantId });
  }, []);

  const handleResearchFollowUp = useCallback((action: import("../../shared/aletheiaResearchConversation.ts").ResearchFollowUpAction): void => {
    dispatchAletheiaCommand("aletheia-research-follow-up", { action });
  }, []);

  const handleAddNote = useCallback((body: string): void => {
    dispatchAletheiaCommand("add-aletheia-note", { body, category: "general" });
  }, []);

  const handleUpdateNote = useCallback((noteId: string, body: string): void => {
    dispatchAletheiaCommand("update-aletheia-note", { noteId, body });
  }, []);

  const handleDeleteNote = useCallback((noteId: string): void => {
    dispatchAletheiaCommand("delete-aletheia-note", { noteId });
  }, []);

  const navItems: Array<{
    id: AletheiaDashboardNav;
    label: string;
    tooltip: string;
    icon: JSX.Element;
  }> = [
    {
      id: "overview",
      label: "Overview",
      tooltip: "Status & command",
      icon: <LayoutGrid size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "command",
      label: "Command",
      tooltip: "Actions & pipelines",
      icon: <Zap size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "presence",
      label: "Presence",
      tooltip: "Voice & persona",
      icon: <Sparkles size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "observation",
      label: "Observation",
      tooltip: "Signals & synthesis",
      icon: <Eye size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "trust",
      label: "Trust",
      tooltip: "Permissions & security",
      icon: <Shield size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "sessions",
      label: "Sessions",
      tooltip: "History & memory",
      icon: <History size={20} strokeWidth={2} aria-hidden="true" />,
    },
    {
      id: "systems",
      label: "Systems",
      tooltip: "Services & dependencies",
      icon: <Server size={20} strokeWidth={2} aria-hidden="true" />,
    },
  ];

  const activeNavLabel =
    activeNav === "computer"
      ? "Computer"
      : navItems.find((item) => item.id === activeNav)?.label ?? "Overview";

  const renderAlerts = (): JSX.Element => (
    <>
      {serverDegraded ? (
        <div className="aletheia-dashboard__degraded" data-testid="aletheia-dashboard-server-degraded">
          <p className="aletheia-dashboard__degraded-label">Server offline</p>
          <p className="aletheia-dashboard__degraded-detail">{serverDegraded}</p>
        </div>
      ) : null}

      {permissionAlert ? (
        <div className="aletheia-dashboard__degraded" data-testid="aletheia-dashboard-permission-alert">
          <p className="aletheia-dashboard__degraded-label">Permission changed</p>
          <p className="aletheia-dashboard__degraded-detail">{permissionAlert.message}</p>
          <button
            type="button"
            className="aletheia-dashboard__secondary-btn"
            data-testid="aletheia-dashboard-permission-alert-dismiss"
            onClick={handleDismissPermissionAlert}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {permissionPlane?.degraded && !permissionAlert ? (
        <div
          className="aletheia-dashboard__degraded aletheia-dashboard__degraded--warn"
          data-testid="aletheia-dashboard-permission-degraded"
        >
          <p className="aletheia-dashboard__degraded-label">
            Operating mode · {permissionPlane.authorityTier.replace(/_/g, " ")}
          </p>
          <p className="aletheia-dashboard__degraded-detail">
            {permissionPlane.degradedSummary ?? "Some capabilities are limited."}
          </p>
        </div>
      ) : null}

      {dependencyManifest && !dependencyManifest.bootstrapComplete ? (
        <div
          className="aletheia-dashboard__degraded aletheia-dashboard__degraded--warn"
          data-testid="aletheia-dashboard-bootstrap-incomplete"
        >
          <p className="aletheia-dashboard__degraded-label">Bootstrap incomplete</p>
          <p className="aletheia-dashboard__degraded-detail">{dependencyManifest.aletheiaNarration}</p>
          <button
            type="button"
            className="aletheia-dashboard__secondary-btn"
            data-testid="aletheia-dashboard-run-bootstrap"
            onClick={handleRunBootstrap}
          >
            Re-check dependencies
          </button>
        </div>
      ) : null}

      {sidecarAlert ? (
        <div className="aletheia-dashboard__degraded" data-testid="aletheia-dashboard-sidecar-alert">
          <p className="aletheia-dashboard__degraded-label">Service changed</p>
          <p className="aletheia-dashboard__degraded-detail">{sidecarAlert.message}</p>
          <button
            type="button"
            className="aletheia-dashboard__secondary-btn"
            data-testid="aletheia-dashboard-sidecar-alert-dismiss"
            onClick={handleDismissSidecarAlert}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {sidecarPlane?.degraded && !sidecarAlert && sidecarPlane.degradedSummary ? (
        <div
          className="aletheia-dashboard__degraded aletheia-dashboard__degraded--warn"
          data-testid="aletheia-dashboard-sidecar-degraded"
        >
          <p className="aletheia-dashboard__degraded-label">Local services</p>
          <p className="aletheia-dashboard__degraded-detail">{sidecarPlane.degradedSummary}</p>
        </div>
      ) : null}
    </>
  );

  const renderNavContent = (): JSX.Element => {
    if (activeNav === "overview") {
      return (
        <div className="aletheia-dashboard__overview">
          <section
            className="aletheia-dashboard__overview-hero"
            data-testid="aletheia-dashboard-hero"
          >
            <div className="aletheia-dashboard__overview-orb" aria-hidden="true">
              <span
                className={`aletheia-dashboard__overview-orb-core${companionActive ? " aletheia-dashboard__overview-orb-core--live" : ""}${companion.speaking ? " aletheia-dashboard__overview-orb-core--speaking" : ""}`}
              />
              <span className="aletheia-dashboard__overview-orb-ring" />
            </div>
            <div className="aletheia-dashboard__overview-hero-body">
              <p className="aletheia-dashboard__overview-kicker">Aletheia · truth engine</p>
              <h2 className="aletheia-dashboard__overview-title">{statusLabel}</h2>
              <p className="aletheia-dashboard__overview-context">
                {glassState.activeApp
                  ? `Watching ${glassState.activeApp}`
                  : "Presence idle — activate to begin"}
                {companionActive ? ` · ${operatingModeLabel(personaBehavior.operatingMode)}` : ""}
              </p>
            </div>
            <div className="aletheia-dashboard__overview-hero-actions">
              {!companionActive ? (
                <button
                  type="button"
                  className="aletheia-dashboard__activate"
                  data-testid="aletheia-dashboard-activate"
                  onClick={handleActivate}
                >
                  <Mic size={14} strokeWidth={2} aria-hidden="true" />
                  Activate
                </button>
              ) : (
                <button
                  type="button"
                  className="aletheia-dashboard__deactivate"
                  data-testid="aletheia-dashboard-deactivate"
                  onClick={handleDeactivate}
                >
                  <MicOff size={14} strokeWidth={2} aria-hidden="true" />
                  Deactivate
                </button>
              )}
            </div>
          </section>

          <div className="aletheia-dashboard__bento">
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--notes">
              <MemoryNotesPanel
                companionActive={companionActive}
                notes={aletheiaNotes?.notes ?? []}
                featured
                onAdd={handleAddNote}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--presence">
              <PresencePanel
                companionActive={companionActive}
                privacyActive={privacyActive}
                speaking={companion.speaking}
                activeApp={glassState.activeApp}
                hasPresence={Boolean(glassState.companionPresence)}
                warmupPhase={glassState.companionWarmupPhase ?? "none"}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--observation">
              <ObservationPanel
                observationPlane={observationPlane}
                activation={activation}
                ambientSynthesis={ambientSynthesis}
                companionActive={companionActive}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--voice">
              <VoiceSessionPanel
                visible={visible}
                companionActive={companionActive}
                liveTranscript={companion.liveTranscript}
                lastPrompt={glassState.companionMemory?.lastPrompt}
                frontApp={glassState.companionMemory?.frontApp ?? glassState.activeApp}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--advice">
              <PendingAdvicePanel
                companionActive={companionActive}
                pendingAdvice={pendingAdvice}
                onApprove={handleApproveAdvice}
                onDismiss={handleDismissAdvice}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--confirm">
              <ActionConfirmationPanel
                companionActive={companionActive}
                actionPipeline={actionPipeline}
                onConfirm={handleConfirmAction}
                onReject={handleRejectAction}
                onModify={handleModifyAction}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--permissions">
              <PermissionsPanel
                permissionPlane={permissionPlane}
                capabilities={glassState.setupCapabilities ?? []}
                consentState={glassState.consentState}
                systemAudioStatus={glassState.systemAudioStatus}
                onOpenSetup={handleOpenGlassSetup}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--services">
              <ServicesPanel sidecarPlane={sidecarPlane} />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--trust">
              <TrustActivityPanel
                companionActive={companionActive}
                trustActivity={trustActivity}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--security">
              <SecurityHivePanel
                securityHive={securityHive}
                onDismissContainment={handleDismissSecurityContainment}
              />
            </div>
            <div className="aletheia-dashboard__bento-cell aletheia-dashboard__bento-cell--persona">
              <PersonaBehaviorPanel
                companionActive={companionActive}
                personaBehavior={personaBehavior}
                persona={glassState.persona}
              />
            </div>
          </div>
        </div>
      );
    }

    if (activeNav === "command") {
      return (
        <div className="aletheia-dashboard__grid">
          {founderAccount ? (
            <FounderCommandTierPanel
              companionActive={companionActive}
              deployedExecution={deployedExecution}
              onInvoke={handleInvokeDeployedExecution}
              onDeactivate={handleDeactivateDeployedExecution}
            />
          ) : null}
          <PendingAdvicePanel
            companionActive={companionActive}
            pendingAdvice={pendingAdvice}
            onApprove={handleApproveAdvice}
            onDismiss={handleDismissAdvice}
          />
          <ActionConfirmationPanel
            companionActive={companionActive}
            actionPipeline={actionPipeline}
            onConfirm={handleConfirmAction}
            onReject={handleRejectAction}
            onModify={handleModifyAction}
          />
          <BoundedLoopPanel companionActive={companionActive} boundedLoop={boundedLoop} />
          <AgentActivityPanel
            companionActive={companionActive}
            agentActivity={agentActivity}
          />
          <DelegatedPresencePanel
            companionActive={companionActive}
            delegatedPresence={delegatedPresence}
          />
          <LoopNarrativePanel
            companionActive={companionActive}
            delegatedLoop={delegatedLoop}
            onContinue={handleContinueLoop}
            onCancel={handleCancelLoop}
          />
        </div>
      );
    }

    if (activeNav === "presence") {
      return (
        <div className="aletheia-dashboard__grid">
          <PersonaBehaviorPanel
            companionActive={companionActive}
            personaBehavior={personaBehavior}
            persona={glassState.persona}
          />
          <DisplayAwarenessPanel
            companionActive={companionActive}
            awareness={displayAwareness}
            connectedDisplays={glassState.connectedDisplays}
          />
          <RelationshipThreadPanel
            companionActive={companionActive}
            thread={relationshipThread}
          />
          <PrivacyPanel
            companionActive={companionActive}
            privacy={glassState.companionPrivacy}
            onStart={handlePrivacyStart}
            onEnd={handlePrivacyEnd}
          />
          <VoiceSessionPanel
            visible={visible}
            companionActive={companionActive}
            liveTranscript={companion.liveTranscript}
            lastPrompt={glassState.companionMemory?.lastPrompt}
            frontApp={glassState.companionMemory?.frontApp ?? glassState.activeApp}
          />
        </div>
      );
    }

    if (activeNav === "observation") {
      return (
        <div className="aletheia-dashboard__grid">
          <ObservationPanel
            observationPlane={observationPlane}
            activation={activation}
            ambientSynthesis={ambientSynthesis}
            companionActive={companionActive}
          />
          <AttentionRecoveryPanel
            companionActive={companionActive}
            recovery={attentionRecovery}
          />
          <ResearchConversationPanel
            companionActive={companionActive}
            researchConversation={researchConversation}
            onFollowUp={handleResearchFollowUp}
          />
        </div>
      );
    }

    if (activeNav === "trust") {
      return (
        <div className="aletheia-dashboard__grid">
          <PermissionsPanel
            permissionPlane={permissionPlane}
            capabilities={glassState.setupCapabilities ?? []}
            consentState={glassState.consentState}
            systemAudioStatus={glassState.systemAudioStatus}
            onOpenSetup={handleOpenGlassSetup}
          />
          <TrustActivityPanel
            companionActive={companionActive}
            trustActivity={trustActivity}
          />
          <SecurityHivePanel
            securityHive={securityHive}
            onDismissContainment={handleDismissSecurityContainment}
          />
        </div>
      );
    }

    if (activeNav === "sessions") {
      return (
        <div className="aletheia-dashboard__grid">
          <VoiceSessionPanel
            visible={visible}
            companionActive={companionActive}
            liveTranscript={companion.liveTranscript}
            lastPrompt={glassState.companionMemory?.lastPrompt}
            frontApp={glassState.companionMemory?.frontApp ?? glassState.activeApp}
          />
          <MemoryPanel onOpenGlassMemory={handleOpenGlassMemory} />
        </div>
      );
    }

    if (activeNav === "computer") {
      return (
        <ComputerOperatorPanel
          companionActive={companionActive}
          computerOperator={computerOperator}
          persistentGrants={glassState.aletheiaComputerOperatorGrants ?? []}
          lastPrompt={glassState.companionMemory?.lastPrompt}
          onGrantSession={handleGrantComputerSession}
          onCancel={handleCancelComputerOperator}
          onPrepare={handlePrepareComputerOperator}
          onRevokeGrant={handleRevokeComputerGrant}
        />
      );
    }

    return (
      <div className="aletheia-dashboard__grid">
        <ServicesPanel sidecarPlane={sidecarPlane} />
        <DependenciesPanel
          manifest={dependencyManifest}
          onRunBootstrap={handleRunBootstrap}
          onOpenSetup={handleOpenGlassSetup}
        />
        <MemoryNotesPanel
          companionActive={companionActive}
          notes={aletheiaNotes?.notes ?? []}
          onAdd={handleAddNote}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
        />
      </div>
    );
  };

  return (
    <div
      className={`aletheia-dashboard-shell${visible ? "" : " aletheia-dashboard-shell--hidden"}`}
      data-testid="aletheia-dashboard-shell"
    >
      <div className="aletheia-dashboard" data-testid="aletheia-dashboard">
        <header className="aletheia-dashboard__titlebar" data-testid="aletheia-dashboard-titlebar">
          <Sparkles className="aletheia-dashboard__title-icon" size={16} strokeWidth={2} aria-hidden="true" />
          <span className="aletheia-dashboard__title">Aletheia</span>
          <span
            className={`aletheia-dashboard__status-pill${companionActive ? " aletheia-dashboard__status-pill--live" : ""}${privacyActive ? " aletheia-dashboard__status-pill--privacy" : ""}`}
            data-testid="aletheia-dashboard-status"
          >
            {privacyActive ? "Aletheia · Privacy" : statusLabel}
          </span>
          {deployedExecution?.active ? (
            <span
              className="aletheia-dashboard__status-pill aletheia-dashboard__status-pill--founder-tier"
              data-testid="aletheia-dashboard-deployed-execution-header"
            >
              {deployedExecution.headerLabel ?? DEPLOYED_EXECUTION_HEADER_LABEL}
            </span>
          ) : null}
          <div className="aletheia-dashboard__titlebar-actions">
            <GlassHoverTooltip label="Close Aletheia dashboard" placement="bottom">
              <button
                type="button"
                className="aletheia-dashboard__close"
                aria-label="Close Aletheia dashboard"
                onClick={handleClose}
              >
                ×
              </button>
            </GlassHoverTooltip>
          </div>
        </header>

        <div className="aletheia-dashboard__body">
          <nav className="aletheia-dashboard__nav" aria-label="Aletheia dashboard navigation">
            {navItems.map((item) => (
              <GlassHoverTooltip key={item.id} label={item.tooltip} placement="right">
                <button
                  type="button"
                  className={`aletheia-dashboard__nav-item${activeNav === item.id ? " aletheia-dashboard__nav-item--active" : ""}`}
                  aria-label={item.label}
                  aria-current={activeNav === item.id ? "page" : undefined}
                  data-testid={`aletheia-dashboard-nav-${item.id}`}
                  onClick={() => setActiveNav(item.id)}
                >
                  {item.icon}
                </button>
              </GlassHoverTooltip>
            ))}
          </nav>

          <main className="aletheia-dashboard__main">
            {activeNav !== "overview" ? (
              <p className="aletheia-dashboard__section-label">{activeNavLabel}</p>
            ) : null}
            {renderAlerts()}
            {renderNavContent()}
          </main>
        </div>
      </div>
    </div>
  );
}

function AttentionRecoveryPanel({
  companionActive,
  recovery,
}: {
  companionActive: boolean;
  recovery?: AletheiaAttentionRecoverySnapshot;
}): JSX.Element | null {
  if (!companionActive || !recovery) return null;

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-attention-recovery">
      <p className="aletheia-dashboard__panel-label">Catch-up</p>
      <p className="aletheia-dashboard__panel-copy">{recovery.spokenBrief}</p>
      <ul className="aletheia-dashboard__recovery-list" data-testid="aletheia-dashboard-attention-recovery-list">
        {recovery.highlights.map((line) => (
          <li key={line} className="aletheia-dashboard__recovery-row">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelationshipThreadPanel({
  companionActive,
  thread,
}: {
  companionActive: boolean;
  thread?: AletheiaRelationshipThreadSnapshot;
}): JSX.Element | null {
  if (!companionActive || !thread) return null;

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-relationship-thread">
      <p className="aletheia-dashboard__panel-label">Relationship thread</p>
      <p className="aletheia-dashboard__panel-copy">
        What Aletheia noticed while you moved between apps — she briefs you when you return to your work context.
      </p>
      {thread.awayApp ? (
        <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-relationship-away">
          Away in {thread.awayApp}
          {thread.focusApp ? ` · work anchor ${thread.focusApp}` : ""}
        </p>
      ) : thread.focusApp ? (
        <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-relationship-focus">
          Work anchor: {thread.focusApp}
        </p>
      ) : null}
      {thread.lastReturnBrief ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-relationship-last-brief">
          {thread.lastReturnBrief}
        </p>
      ) : null}
      {thread.events.length === 0 ? (
        <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-relationship-empty">
          No queued events yet — switch apps or run a failing command while companion is active.
        </p>
      ) : (
        <ul className="aletheia-dashboard__recovery-list" data-testid="aletheia-dashboard-relationship-events">
          {thread.events.slice(0, 8).map((event) => (
            <li key={event.id} className="aletheia-dashboard__recovery-row">
              <span className="aletheia-dashboard__notes-meta">{relationshipEventKindLabel(event.kind)}</span>
              {" "}
              {event.summary}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DisplayAwarenessPanel({
  companionActive,
  awareness,
  connectedDisplays,
}: {
  companionActive: boolean;
  awareness?: AletheiaDisplayAwarenessSnapshot;
  connectedDisplays: ConnectedDisplaySnapshot[];
}): JSX.Element | null {
  if (connectedDisplays.length <= 1) return null;

  const monitorSummary = connectedDisplays
    .map((d) => `${d.label}${d.cursorInside ? " (cursor)" : ""}`)
    .join(" · ");

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-display-awareness">
      <p className="aletheia-dashboard__panel-label">Displays</p>
      <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-display-count">
        {connectedDisplays.length} monitors connected
      </p>
      <p className="aletheia-dashboard__panel-copy">{monitorSummary}</p>
      {companionActive && awareness ? (
        <p className="aletheia-dashboard__panel-footnote">{awareness.contextBlock}</p>
      ) : (
        <p className="aletheia-dashboard__panel-footnote">
          Activate companion for full display-aware context during sessions.
        </p>
      )}
    </section>
  );
}

function PersonaBehaviorPanel({
  companionActive,
  personaBehavior,
  persona,
}: {
  companionActive: boolean;
  personaBehavior: ReturnType<typeof resolveAletheiaPersonaBehavior>;
  persona?: GlassState["persona"];
}): JSX.Element {
  const surface = resolveAletheiaSurface({
    companionModeActive: companionActive,
    aletheiaDashboardActive: true,
  });
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-persona-behavior">
      <p className="aletheia-dashboard__panel-label">Operating mode</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — she adapts tone and initiative to your persona
          {persona ? ` (${persona})` : ""}.
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-persona-mode">
            {operatingModeLabel(personaBehavior.operatingMode)}
            {personaBehavior.founderTierActive ? " · founder tier" : ""}
          </p>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-persona-tone">
            {personaBehavior.toneLabel}
          </p>
          <ul className="aletheia-dashboard__stat-list">
            <li>
              <span className="aletheia-dashboard__stat-key">Verbosity</span>
              <span className="aletheia-dashboard__stat-value">{personaBehavior.verbosity}</span>
            </li>
            <li>
              <span className="aletheia-dashboard__stat-key">Initiative</span>
              <span className="aletheia-dashboard__stat-value">{personaBehavior.initiativeLevel}</span>
            </li>
          </ul>
          {personaBehavior.founderTierActive ? (
            <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-founder-tier">
              Deployed Execution active — expanded authority scope acknowledged.
            </p>
          ) : null}
          <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-surface-doctrine">
            Calm presence on {surface.replace(/_/g, " ")} — same tone, pacing matched to this surface.
          </p>
        </>
      )}
    </section>
  );
}

function FounderCommandTierPanel({
  companionActive,
  deployedExecution,
  onInvoke,
  onDeactivate,
}: {
  companionActive: boolean;
  deployedExecution?: AletheiaDeployedExecutionSnapshot;
  onInvoke: () => void;
  onDeactivate: () => void;
}): JSX.Element {
  const active = deployedExecution?.active === true;
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-founder-command-tier">
      <p className="aletheia-dashboard__panel-label">Founder command tier</p>
      {active ? (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-deployed-execution-active">
            Deployed Execution active
          </p>
          <p className="aletheia-dashboard__panel-copy">
            Authority expanded for this session — actions proceed with founder-auto confirmation where allowed.
          </p>
          <button
            type="button"
            className="aletheia-dashboard__secondary-btn"
            data-testid="aletheia-dashboard-deactivate-deployed-execution"
            onClick={onDeactivate}
          >
            Return to standard mode
          </button>
        </>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-copy">
            Explicit founder authority — invoke Deployed Execution while Aletheia is active.
          </p>
          <button
            type="button"
            className="aletheia-dashboard__primary-btn"
            data-testid="aletheia-dashboard-invoke-deployed-execution"
            disabled={!companionActive}
            onClick={onInvoke}
          >
            Invoke Deployed Execution
          </button>
          {!companionActive ? (
            <p className="aletheia-dashboard__panel-footnote">
              Activate Aletheia first — Deployed Execution is a session mode, not a passive account flag.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function PresencePanel({
  companionActive,
  privacyActive,
  speaking,
  activeApp,
  hasPresence,
  warmupPhase,
}: {
  companionActive: boolean;
  privacyActive: boolean;
  speaking: boolean;
  activeApp?: string;
  hasPresence: boolean;
  warmupPhase: "none" | "warming" | "ready";
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-presence">
      <p className="aletheia-dashboard__panel-label">Presence</p>
      <ul className="aletheia-dashboard__stat-list">
        <li>
          <span className="aletheia-dashboard__stat-key">Session</span>
          <span className="aletheia-dashboard__stat-value">
            {companionActive ? "Active" : "Off"}
          </span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Warmup</span>
          <span className="aletheia-dashboard__stat-value">
            {warmupPhase === "warming" ? "Warming" : warmupPhase === "ready" ? "Ready" : "—"}
          </span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Speaking</span>
          <span className="aletheia-dashboard__stat-value">{speaking ? "Yes" : "No"}</span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Privacy</span>
          <span className="aletheia-dashboard__stat-value">{privacyActive ? "On" : "Off"}</span>
        </li>
        <li>
          <span className="aletheia-dashboard__stat-key">Spatial guidance</span>
          <span className="aletheia-dashboard__stat-value">
            {hasPresence ? "Visible" : companionActive ? "Idle" : "—"}
          </span>
        </li>
        {activeApp ? (
          <li>
            <span className="aletheia-dashboard__stat-key">Front app</span>
            <span className="aletheia-dashboard__stat-value">{activeApp}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DependenciesPanel({
  manifest,
  onRunBootstrap,
  onOpenSetup,
}: {
  manifest?: GlassState["aletheiaDependencyManifest"];
  onRunBootstrap: () => void;
  onOpenSetup: () => void;
}): JSX.Element {
  const missing = manifest?.dependencies.filter(
    (row) => row.status === "missing" || row.status === "error" || row.status === "optional_missing",
  );

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-dependencies">
      <p className="aletheia-dashboard__panel-label">Dependency manifest</p>
      {manifest ? (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-bootstrap-summary">
            {manifest.summary}
          </p>
          <ul className="aletheia-dashboard__stat-list" data-testid="aletheia-dashboard-dependency-manifest">
            {manifest.dependencies.map((row) => (
              <DependencyInstrumentRow key={row.id} row={row} />
            ))}
          </ul>
          {missing && missing.length > 0 ? (
            <p className="aletheia-dashboard__panel-footnote">
              {missing.length} item(s) need attention — install or configure in Glass Setup.
            </p>
          ) : null}
        </>
      ) : (
        <p className="aletheia-dashboard__panel-meta">Running bootstrap check…</p>
      )}
      <div className="aletheia-dashboard__panel-actions">
        <button
          type="button"
          className="aletheia-dashboard__link-btn"
          data-testid="aletheia-dashboard-bootstrap-recheck"
          onClick={onRunBootstrap}
        >
          Re-check all dependencies
        </button>
        <button
          type="button"
          className="aletheia-dashboard__link-btn"
          data-testid="aletheia-dashboard-bootstrap-setup"
          onClick={onOpenSetup}
        >
          Open Glass Setup →
        </button>
      </div>
    </section>
  );
}

function DependencyInstrumentRow({ row }: { row: DependencyRow }): JSX.Element {
  const ok = row.status === "ready" || row.status === "installing";
  const statusLabel =
    row.status === "ready"
      ? "Ready"
      : row.status === "optional_missing"
        ? "Optional"
        : row.status === "installing"
          ? "Installing"
          : row.status === "degraded"
            ? "Degraded"
            : row.status === "missing"
              ? "Missing"
              : row.status === "error"
                ? "Error"
                : "Unknown";
  return (
    <li className="aletheia-dashboard__permission-instrument" data-testid={`aletheia-dependency-${row.id}`}>
      <div className="aletheia-dashboard__permission-instrument-head">
        <span className="aletheia-dashboard__stat-key">
          {row.label}
          {row.critical ? " · required" : ""}
        </span>
        <span
          className={`aletheia-dashboard__stat-value${ok ? " aletheia-dashboard__stat-value--ok" : " aletheia-dashboard__stat-value--error"}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="aletheia-dashboard__permission-copy">{row.detail}</p>
      <p className="aletheia-dashboard__permission-impact">{ok ? row.withIt : row.withoutIt}</p>
    </li>
  );
}

function ServicesPanel({
  sidecarPlane,
}: {
  sidecarPlane?: GlassState["aletheiaSidecarPlane"];
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-services">
      <p className="aletheia-dashboard__panel-label">Supervised services</p>
      {sidecarPlane ? (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-sidecar-boot">
            Boot ready: {sidecarPlane.bootReady ? "Yes" : "No"}
          </p>
          <ul className="aletheia-dashboard__stat-list" data-testid="aletheia-dashboard-sidecar-plane">
            {sidecarPlane.services.map((row) => (
              <SidecarServiceInstrumentRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      ) : (
        <p className="aletheia-dashboard__panel-meta">Checking local services…</p>
      )}
    </section>
  );
}

function SidecarServiceInstrumentRow({ row }: { row: SidecarServiceRow }): JSX.Element {
  const ok = row.status === "healthy" || row.status === "disabled";
  const statusLabel =
    row.status === "healthy"
      ? "Online"
      : row.status === "disabled"
        ? "Disabled"
        : row.status === "starting"
          ? "Starting"
          : row.status === "not_installed"
            ? "Not installed"
            : row.status === "degraded"
              ? "Degraded"
              : "Offline";
  return (
    <li className="aletheia-dashboard__permission-instrument" data-testid={`aletheia-sidecar-${row.id}`}>
      <div className="aletheia-dashboard__permission-instrument-head">
        <span className="aletheia-dashboard__stat-key">
          {row.label}
          {row.critical ? " · required" : ""}
        </span>
        <span
          className={`aletheia-dashboard__stat-value${ok ? " aletheia-dashboard__stat-value--ok" : " aletheia-dashboard__stat-value--error"}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="aletheia-dashboard__permission-copy">{row.detail}</p>
      <p className="aletheia-dashboard__permission-impact">
        {ok ? row.withIt : row.withoutIt}
      </p>
    </li>
  );
}

function PendingAdvicePanel({
  companionActive,
  pendingAdvice,
  onApprove,
  onDismiss,
}: {
  companionActive: boolean;
  pendingAdvice?: GlassState["aletheiaPendingAdvice"];
  onApprove: (adviceId: string) => void;
  onDismiss: (adviceId: string) => void;
}): JSX.Element {
  const pending = pendingAletheiaAdviceCards(pendingAdvice);

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-pending-advice">
      <p className="aletheia-dashboard__panel-label">Pending advice</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia to receive advice — she waits for your go before acting.
        </p>
      ) : pending.length === 0 ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-pending-advice-empty">
          No pending advice — Aletheia will queue recommendations here when she observes something worth suggesting.
        </p>
      ) : (
        <ul className="aletheia-dashboard__advice-list" data-testid="aletheia-dashboard-pending-advice-list">
          {pending.map((card) => (
            <PendingAdviceCard
              key={card.id}
              card={card}
              onApprove={() => onApprove(card.id)}
              onDismiss={() => onDismiss(card.id)}
            />
          ))}
        </ul>
      )}
      {companionActive && pending.length > 0 ? (
        <p className="aletheia-dashboard__panel-footnote">
          Approve to review a concrete action — execution still requires a second confirmation.
        </p>
      ) : null}
    </section>
  );
}

function ActionConfirmationPanel({
  companionActive,
  actionPipeline,
  onConfirm,
  onReject,
  onModify,
}: {
  companionActive: boolean;
  actionPipeline?: GlassState["aletheiaActionPipeline"];
  onConfirm: (intentId: string) => void;
  onReject: (intentId: string) => void;
  onModify: (intentId: string, modifier: string) => void;
}): JSX.Element {
  const pending = actionPipeline?.pendingConfirmation;
  const card = pending ? formatActionConfirmationCard(pending) : null;
  const lastResult = actionPipeline?.lastResult;
  const [modifier, setModifier] = useState("");

  useEffect(() => {
    setModifier("");
  }, [pending?.intentId]);

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-action-confirmation">
      <p className="aletheia-dashboard__panel-label">Action confirmation</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia to confirm actions she proposes.
        </p>
      ) : card ? (
        <div className="aletheia-dashboard__confirm-card" data-testid="aletheia-dashboard-confirm-card">
          <p className="aletheia-dashboard__confirm-line">
            <span className="aletheia-dashboard__confirm-key">Aletheia will run</span>
            {card.runLine}
          </p>
          <p className="aletheia-dashboard__confirm-line">
            <span className="aletheia-dashboard__confirm-key">On</span>
            {card.targetLine}
          </p>
          <p className="aletheia-dashboard__confirm-line">
            <span className="aletheia-dashboard__confirm-key">Reason</span>
            {card.reasonLine}
          </p>
          {card.scopeDeclaration ? (
            <p
              className="aletheia-dashboard__confirm-scope"
              data-testid="aletheia-dashboard-confirm-scope"
            >
              {card.scopeDeclaration}
            </p>
          ) : null}
          {card.commandPreview ? (
            <pre className="aletheia-dashboard__confirm-preview" data-testid="aletheia-dashboard-confirm-preview">
              {card.commandPreview}
            </pre>
          ) : null}
          <label className="aletheia-dashboard__confirm-modify">
            <span className="aletheia-dashboard__confirm-key">Modify</span>
            <input
              type="text"
              className="aletheia-dashboard__confirm-input"
              data-testid="aletheia-dashboard-confirm-modify-input"
              placeholder="Change it to npm test"
              value={modifier}
              onChange={(event) => setModifier(event.target.value)}
            />
          </label>
          <div className="aletheia-dashboard__panel-actions">
            <button
              type="button"
              className="aletheia-dashboard__activate"
              data-testid="aletheia-dashboard-confirm-approve"
              onClick={() => onConfirm(card.intentId)}
            >
              Approve
            </button>
            <button
              type="button"
              className="aletheia-dashboard__secondary-btn"
              data-testid="aletheia-dashboard-confirm-modify"
              disabled={!modifier.trim()}
              onClick={() => onModify(card.intentId, modifier.trim())}
            >
              Apply change
            </button>
            <button
              type="button"
              className="aletheia-dashboard__secondary-btn"
              data-testid="aletheia-dashboard-confirm-reject"
              onClick={() => onReject(card.intentId)}
            >
              Reject
            </button>
          </div>
          <p className="aletheia-dashboard__panel-footnote">
            Say yes, no, or &quot;change it to…&quot; — nothing runs until you approve.
          </p>
        </div>
      ) : (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-confirm-empty">
          No action awaiting confirmation.
        </p>
      )}
      {lastResult ? (
        <div
          className={`aletheia-dashboard__confirm-result${lastResult.ok ? " aletheia-dashboard__confirm-result--ok" : " aletheia-dashboard__confirm-result--error"}`}
          data-testid="aletheia-dashboard-confirm-result"
        >
          <p className="aletheia-dashboard__confirm-key">Last result</p>
          <p className="aletheia-dashboard__panel-copy">{lastResult.message}</p>
        </div>
      ) : null}
    </section>
  );
}

function BoundedLoopPanel({
  companionActive,
  boundedLoop,
}: {
  companionActive: boolean;
  boundedLoop?: GlassState["aletheiaBoundedLoop"];
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-bounded-loop">
      <p className="aletheia-dashboard__panel-label">Bounded loop</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia to run declared autonomous loops with a live audit trail.
        </p>
      ) : !boundedLoop ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-bounded-loop-empty">
          No active loop — bounded investigations appear here once you confirm scope.
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-bounded-loop-scope">
            {boundedLoop.scope.declaration}
          </p>
          <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-bounded-loop-audit">
            {boundedLoop.scope.allowedActions.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-bounded-loop-phase">
            Phase: {boundedLoop.phase.replace(/_/g, " ")}
            {boundedLoop.iteration > 0 ? ` · iteration ${boundedLoop.iteration}/${boundedLoop.scope.maxIterations}` : ""}
          </p>
          {boundedLoop.audit.length > 0 ? (
            <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-bounded-loop-log">
              {boundedLoop.audit.map((row) => (
                <li
                  key={row.id}
                  className={
                    row.ok === true
                      ? "aletheia-dashboard__bounded-audit-row--ok"
                      : row.ok === false
                        ? "aletheia-dashboard__bounded-audit-row--error"
                        : undefined
                  }
                >
                  {row.narration}
                </li>
              ))}
            </ul>
          ) : null}
          {boundedLoop.summary ? (
            <div className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok" data-testid="aletheia-dashboard-bounded-loop-summary">
              <p className="aletheia-dashboard__confirm-key">Loop summary</p>
              <p className="aletheia-dashboard__panel-copy">{boundedLoop.summary}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SecurityHivePanel({
  securityHive,
  onDismissContainment,
}: {
  securityHive?: SecurityHiveSnapshot;
  onDismissContainment: () => void;
}): JSX.Element {
  const mode = securityHive?.mode ?? "full";
  const showDismiss =
    securityHive?.activeContainment === true
    || securityHive?.newActionsBlocked === true
    || mode === "hold"
    || mode === "locked";
  const modeClass =
    mode === "full"
      ? undefined
      : mode === "locked"
        ? "aletheia-dashboard__degraded--warn"
        : "aletheia-dashboard__degraded";

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-security-hive">
      <p className="aletheia-dashboard__panel-label">Security hive</p>
      {!securityHive ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-security-empty">
          Security agents initialize when Glass boots — Watcher, Verifier, Containment, and Key Guardian.
        </p>
      ) : (
        <>
          <div
            className={modeClass ? `aletheia-dashboard__degraded ${modeClass}` : undefined}
            data-testid="aletheia-dashboard-security-mode"
          >
            <p className="aletheia-dashboard__degraded-label">
              {mode === "full" ? "Full posture" : `${mode.charAt(0).toUpperCase()}${mode.slice(1)} mode`}
            </p>
            <p className="aletheia-dashboard__degraded-detail">{securityHive.modeNarration}</p>
            {showDismiss ? (
              <button
                type="button"
                className="aletheia-dashboard__secondary-btn"
                data-testid="aletheia-dashboard-security-dismiss"
                onClick={onDismissContainment}
              >
                Clear security hold
              </button>
            ) : null}
          </div>
          <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-security-agents">
            {securityHive.agents.map((row) => (
              <li
                key={row.agentId}
                className={
                  row.health === "healthy"
                    ? "aletheia-dashboard__bounded-audit-row--ok"
                    : row.health === "offline"
                      ? "aletheia-dashboard__bounded-audit-row--error"
                      : undefined
                }
              >
                <span className="aletheia-dashboard__notes-meta">
                  {agentLabel(row.agentId)} · {row.health}
                </span>
                {" "}
                {row.lastReport ?? row.role}
              </li>
            ))}
          </ul>
          {securityHive.recentThreats.length > 0 ? (
            <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-security-threats">
              {securityHive.recentThreats.map((threat) => (
                <li key={threat.id}>
                  <span className="aletheia-dashboard__notes-meta">
                    {threatCategoryLabel(threat.category)} · {threat.severity}
                  </span>
                  {" "}
                  {threat.briefing}
                </li>
              ))}
            </ul>
          ) : (
            <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-security-threats-empty">
              No active threat signals — hive is observing bus traffic and keychain access.
            </p>
          )}
          <p className="aletheia-dashboard__panel-footnote">
            {securityHive.newActionsBlocked
              ? "New actions are paused until verification restores."
              : securityHive.keychainPerimeterActive
                ? "Key Guardian is holding the keychain perimeter."
                : "All four agents report healthy."}
          </p>
        </>
      )}
    </section>
  );
}

function TrustActivityPanel({
  companionActive,
  trustActivity,
}: {
  companionActive: boolean;
  trustActivity?: AletheiaTrustActivitySnapshot;
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-trust-activity">
      <p className="aletheia-dashboard__panel-label">Trust &amp; activity</p>
      {!trustActivity || trustActivity.entries.length === 0 ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-trust-empty">
          {companionActive
            ? "Actions Aletheia takes will appear here with a plain-language audit trail."
            : "Activate Aletheia — every action she runs is logged here in human-readable form."}
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-trust-summary">
            {trustActivity.summaryLine}
            {trustActivity.sessionId ? " · this session" : " · recent history"}
          </p>
          <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-trust-audit">
            {trustActivity.entries.map((row) => (
              <li
                key={row.id}
                className={
                  row.ok === true
                    ? "aletheia-dashboard__bounded-audit-row--ok"
                    : row.ok === false
                      ? "aletheia-dashboard__bounded-audit-row--error"
                      : undefined
                }
              >
                <span className="aletheia-dashboard__notes-meta">
                  {kindLabel(row.kind)} · {stageLabel(row.stage)}
                  {row.attributionLabel ? ` · ${row.attributionLabel}` : ""}
                </span>
                {" "}
                {row.headline}
                {row.detail && row.detail !== row.headline ? (
                  <span className="aletheia-dashboard__panel-footnote"> — {row.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="aletheia-dashboard__panel-footnote">
            Durable audit trail from the action ledger — read-only here; memory admin stays in Glass.
          </p>
        </>
      )}
    </section>
  );
}

function AgentActivityPanel({
  companionActive,
  agentActivity,
}: {
  companionActive: boolean;
  agentActivity?: GlassState["aletheiaAgentActivity"];
}): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-agent-activity">
      <p className="aletheia-dashboard__panel-label">Agent activity</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — she can route council, research, and writing work on your behalf.
        </p>
      ) : !agentActivity ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-agent-activity-empty">
          No active coordination — ask her to figure out an approach, research a topic, or draft something.
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-agent-activity-phase">
            {agentActivity.phase.replace(/_/g, " ")}
          </p>
          <ul className="aletheia-dashboard__agent-activity" data-testid="aletheia-dashboard-agent-activity-steps">
            {agentActivity.steps.map((step) => (
              <li
                key={step.id}
                className={
                  step.status === "done"
                    ? "aletheia-dashboard__agent-activity-row--done"
                    : step.status === "running"
                      ? "aletheia-dashboard__agent-activity-row--running"
                      : step.status === "failed"
                        ? "aletheia-dashboard__agent-activity-row--error"
                        : undefined
                }
              >
                <span className="aletheia-dashboard__agent-activity-label">{step.label}</span>
                {step.detail ? (
                  <span className="aletheia-dashboard__panel-footnote">{step.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {agentActivity.unifiedAnswer ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-agent-activity-answer"
            >
              <p className="aletheia-dashboard__confirm-key">Unified answer</p>
              <p className="aletheia-dashboard__panel-copy">{agentActivity.unifiedAnswer}</p>
            </div>
          ) : null}
          {agentActivity.errorMessage ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--error"
              data-testid="aletheia-dashboard-agent-activity-error"
            >
              <p className="aletheia-dashboard__confirm-key">Could not finish</p>
              <p className="aletheia-dashboard__panel-copy">{agentActivity.errorMessage}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ComputerOperatorPanel({
  companionActive,
  computerOperator,
  persistentGrants,
  lastPrompt,
  onGrantSession,
  onCancel,
  onPrepare,
  onRevokeGrant,
}: {
  companionActive: boolean;
  computerOperator?: GlassState["aletheiaComputerOperator"];
  persistentGrants: NonNullable<GlassState["aletheiaComputerOperatorGrants"]>;
  lastPrompt?: string;
  onGrantSession: (loopId: string, goal?: string) => void;
  onCancel: () => void;
  onPrepare: (goal?: string) => void;
  onRevokeGrant: (grantId: string) => void;
}): JSX.Element {
  const [goalInput, setGoalInput] = useState(lastPrompt?.trim() ?? "");

  const running =
    computerOperator != null
    && computerOperator.phase === "running";

  const awaitingGrant =
    computerOperator?.phase === "awaiting_grant"
    || computerOperator?.phase === "awaiting_confirm";

  const dashboardOwnsLiveSession = isComputerOperatorLiveUiSurface(
    computerOperator,
    "dashboard",
  );

  const sessionActiveElsewhere =
    computerOperator != null
    && isComputerOperatorActivePhase(computerOperator.phase)
    && !dashboardOwnsLiveSession;

  useEffect(() => {
    if (lastPrompt?.trim() && !computerOperator) {
      setGoalInput(lastPrompt.trim());
    }
  }, [lastPrompt, computerOperator]);

  return (
    <section
      className="aletheia-dashboard__panel aletheia-dashboard__panel--computer"
      data-testid="aletheia-dashboard-computer"
    >
      <p className="aletheia-dashboard__panel-label">Computer operator</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — she can capture the live UI, pick grounded actions, verify each step,
          and repeat until your goal is done.
        </p>
      ) : !computerOperator ? (
        <>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-computer-empty">
            Describe a task — e.g. open Slack, go to the unread thread, and summarize it.
          </p>
          <label className="aletheia-dashboard__panel-copy" htmlFor="aletheia-computer-goal">
            Goal
          </label>
          <textarea
            id="aletheia-computer-goal"
            className="aletheia-dashboard__computer-goal-input"
            data-testid="aletheia-dashboard-computer-goal-input"
            rows={3}
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="Open Slack, inspect unread items, summarize latest unread thread…"
          />
          <button
            type="button"
            className="aletheia-dashboard__confirm-btn"
            data-testid="aletheia-dashboard-computer-start"
            disabled={!goalInput.trim()}
            onClick={() => onPrepare(goalInput.trim())}
          >
            Plan task
          </button>
        </>
      ) : sessionActiveElsewhere ? (
        <>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-computer-goal">
            {computerOperator.plan.goal}
          </p>
          <p
            className="aletheia-dashboard__panel-footnote"
            data-testid="aletheia-dashboard-computer-active-elsewhere"
          >
            Session active — live progress is in{" "}
            {computerOperatorLiveProgressLocation(computerOperator.entrySurface)}.
            Full audit appears here when the run finishes.
          </p>
        </>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-computer-goal">
            {computerOperator.plan.goal}
          </p>
          {computerOperator.sessionGrant ? (
            <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-computer-scope">
              {computerOperator.sessionGrant.declaration}
            </p>
          ) : null}
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-computer-phase">
            Phase: {computerOperator.phase.replace(/_/g, " ")}
            {computerOperator.step > 0
              ? ` · step ${computerOperator.step}/${computerOperator.plan.stepBudget}`
              : ""}
          </p>
          {computerOperator.currentBelief ? (
            <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-computer-belief">
              {computerOperator.currentBelief}
            </p>
          ) : null}
          {computerOperator.narrative ? (
            <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-computer-narrative">
              {computerOperator.narrative}
            </p>
          ) : null}
          {computerOperator.audit.length > 0 ? (
            <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-computer-audit">
              {computerOperator.audit.map((row) => (
                <li
                  key={row.id}
                  className={
                    row.ok === true
                      ? "aletheia-dashboard__bounded-audit-row--ok"
                      : row.ok === false
                        ? "aletheia-dashboard__bounded-audit-row--error"
                        : undefined
                  }
                >
                  {row.narration}
                </li>
              ))}
            </ul>
          ) : null}
          {computerOperator.readSummary ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-computer-read-summary"
            >
              <p className="aletheia-dashboard__confirm-key">Screen read</p>
              <p className="aletheia-dashboard__panel-copy">{computerOperator.readSummary}</p>
            </div>
          ) : null}
          {computerOperator.summary ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-computer-summary"
            >
              <p className="aletheia-dashboard__confirm-key">Result</p>
              <p className="aletheia-dashboard__panel-copy">{computerOperator.summary}</p>
            </div>
          ) : null}
          {computerOperator.pauseReason ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--error"
              data-testid="aletheia-dashboard-computer-pause"
            >
              <p className="aletheia-dashboard__confirm-key">Paused</p>
              <p className="aletheia-dashboard__panel-copy">{computerOperator.pauseReason}</p>
            </div>
          ) : null}
          {awaitingGrant ? (
            <div className="aletheia-dashboard__confirm-actions" data-testid="aletheia-dashboard-computer-grant-actions">
              {computerOperator.phase === "awaiting_confirm" ? (
                <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-computer-confirm-note">
                  This task may include sensitive actions — review scope before granting.
                </p>
              ) : null}
              <button
                type="button"
                className="aletheia-dashboard__confirm-btn"
                data-testid="aletheia-dashboard-computer-grant"
                onClick={() =>
                  onGrantSession(
                    computerOperator.loopId,
                    computerOperator.plan.goal.startsWith("Enter a task")
                      ? undefined
                      : computerOperator.plan.goal,
                  )
                }
              >
                Grant session & run
              </button>
              <button
                type="button"
                className="aletheia-dashboard__confirm-btn aletheia-dashboard__confirm-btn--ghost"
                data-testid="aletheia-dashboard-computer-cancel"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {running ? (
            <button
              type="button"
              className="aletheia-dashboard__confirm-btn aletheia-dashboard__confirm-btn--ghost"
              data-testid="aletheia-dashboard-computer-cancel-running"
              onClick={onCancel}
            >
              Stop operator
            </button>
          ) : null}
        </>
      )}
      {persistentGrants.length > 0 ? (
        <div
          className="aletheia-dashboard__computer-grants"
          data-testid="aletheia-dashboard-computer-persistent-grants"
        >
          <p className="aletheia-dashboard__panel-label">Always-allow grants</p>
          <ul className="aletheia-dashboard__bounded-audit">
            {persistentGrants.map((grant) => (
              <li key={grant.id} data-testid={`aletheia-dashboard-computer-grant-${grant.id}`}>
                <span>{grant.declaration}</span>
                <button
                  type="button"
                  className="aletheia-dashboard__confirm-btn aletheia-dashboard__confirm-btn--ghost"
                  data-testid={`aletheia-dashboard-computer-revoke-${grant.id}`}
                  onClick={() => onRevokeGrant(grant.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function DelegatedPresencePanel({
  companionActive,
  delegatedPresence,
}: {
  companionActive: boolean;
  delegatedPresence?: GlassState["aletheiaDelegatedPresence"];
}): JSX.Element {
  const running =
    delegatedPresence != null
    && delegatedPresence.phase !== "complete"
    && delegatedPresence.phase !== "failed";

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-delegated-presence">
      <p className="aletheia-dashboard__panel-label">Delegated presence</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — she can go operate any app on your machine and report back.
        </p>
      ) : !delegatedPresence ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-delegated-presence-empty">
          No active task — try &quot;Go to Figma and tell me what&apos;s on the artboard.&quot;
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-delegated-presence-phase">
            {running ? "Operating" : delegatedPresence.phase.replace(/_/g, " ")}
            {delegatedPresence.method ? ` · ${delegatedPresence.method}` : ""}
          </p>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-delegated-presence-goal">
            {delegatedPresence.targetApp}: {delegatedPresence.reportQuestion}
          </p>
          {delegatedPresence.audit.length > 0 ? (
            <ul className="aletheia-dashboard__bounded-audit" data-testid="aletheia-dashboard-delegated-presence-audit">
              {delegatedPresence.audit.map((row) => (
                <li
                  key={row.id}
                  className={
                    row.ok === true
                      ? "aletheia-dashboard__bounded-audit-row--ok"
                      : row.ok === false
                        ? "aletheia-dashboard__bounded-audit-row--error"
                        : undefined
                  }
                >
                  {row.narration}
                </li>
              ))}
            </ul>
          ) : null}
          {delegatedPresence.report ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-delegated-presence-report"
            >
              <p className="aletheia-dashboard__confirm-key">Report</p>
              <p className="aletheia-dashboard__panel-copy">{delegatedPresence.report}</p>
            </div>
          ) : null}
          {delegatedPresence.errorMessage ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--error"
              data-testid="aletheia-dashboard-delegated-presence-error"
            >
              <p className="aletheia-dashboard__confirm-key">Could not finish</p>
              <p className="aletheia-dashboard__panel-copy">{delegatedPresence.errorMessage}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function LoopNarrativePanel({
  companionActive,
  delegatedLoop,
  onContinue,
  onCancel,
}: {
  companionActive: boolean;
  delegatedLoop?: GlassState["aletheiaDelegatedLoop"];
  onContinue: () => void;
  onCancel: () => void;
}): JSX.Element {
  const awaitingDecision = delegatedLoop?.phase === "awaiting_decision";
  const loopRunning =
    delegatedLoop != null
    && delegatedLoop.phase !== "complete"
    && delegatedLoop.phase !== "failed"
    && delegatedLoop.phase !== "cancelled";

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-loop-narrative">
      <p className="aletheia-dashboard__panel-label">Loop narrative</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — she can run multi-step work across apps while narrating each step.
        </p>
      ) : !delegatedLoop ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-loop-narrative-empty">
          No active loop — try &quot;Work through the launch checklist for me and report back.&quot;
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-loop-narrative-phase">
            {delegatedLoop.phase.replace(/_/g, " ")}
            {delegatedLoop.currentStepIndex >= 0
              ? ` · step ${delegatedLoop.currentStepIndex + 1}/${delegatedLoop.steps.length}`
              : ""}
          </p>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-loop-narrative-goal">
            {delegatedLoop.goal}
          </p>
          {delegatedLoop.narrative.length > 0 ? (
            <ol className="aletheia-dashboard__loop-narrative" data-testid="aletheia-dashboard-loop-narrative-log">
              {delegatedLoop.narrative.map((row) => (
                <li key={row.id}>{row.sentence}</li>
              ))}
            </ol>
          ) : null}
          {awaitingDecision && delegatedLoop.pendingDecision ? (
            <div className="aletheia-dashboard__confirm-card" data-testid="aletheia-dashboard-loop-decision">
              <p className="aletheia-dashboard__confirm-key">Decision needed</p>
              <p className="aletheia-dashboard__panel-copy">{delegatedLoop.pendingDecision.question}</p>
              <div className="aletheia-dashboard__confirm-actions">
                <button
                  type="button"
                  className="aletheia-dashboard__primary-btn"
                  data-testid="aletheia-dashboard-loop-continue"
                  onClick={onContinue}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="aletheia-dashboard__secondary-btn"
                  data-testid="aletheia-dashboard-loop-cancel"
                  onClick={onCancel}
                >
                  Stop loop
                </button>
              </div>
            </div>
          ) : loopRunning ? (
            <div className="aletheia-dashboard__confirm-actions">
              <button
                type="button"
                className="aletheia-dashboard__secondary-btn"
                data-testid="aletheia-dashboard-loop-cancel-running"
                onClick={onCancel}
              >
                Stop loop
              </button>
            </div>
          ) : null}
          {delegatedLoop.handoff ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-loop-handoff"
            >
              <p className="aletheia-dashboard__confirm-key">Handoff</p>
              <p className="aletheia-dashboard__panel-copy">{delegatedLoop.handoff.completed}</p>
              {delegatedLoop.handoff.remaining ? (
                <p className="aletheia-dashboard__panel-footnote">{delegatedLoop.handoff.remaining}</p>
              ) : null}
              {delegatedLoop.handoff.needsFromYou ? (
                <p className="aletheia-dashboard__panel-copy">{delegatedLoop.handoff.needsFromYou}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ResearchConversationPanel({
  companionActive,
  researchConversation,
  onFollowUp,
}: {
  companionActive: boolean;
  researchConversation?: GlassState["aletheiaResearchConversation"];
  onFollowUp: (action: import("../../shared/aletheiaResearchConversation.ts").ResearchFollowUpAction) => void;
}): JSX.Element {
  const researching = researchConversation?.phase === "researching";
  const followUps: import("../../shared/aletheiaResearchConversation.ts").ResearchFollowUpAction[] = [
    "summarize",
    "compare_deeper",
    "save_to_notes",
    "draft_from_findings",
    "hand_to_writing",
  ];

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-research-conversation">
      <p className="aletheia-dashboard__panel-label">Research</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">
          Activate Aletheia — ask her to look things up and she&apos;ll answer in this thread with sources.
        </p>
      ) : !researchConversation ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-research-empty">
          No active research — try &quot;Look this up: latest EU AI Act guidance.&quot;
        </p>
      ) : (
        <>
          <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-research-phase">
            {researching
              ? "Researching…"
              : researchConversation.phase.replace(/_/g, " ")}
          </p>
          <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-research-query">
            {researchConversation.query}
          </p>
          {researchConversation.statusMessage && researching ? (
            <p className="aletheia-dashboard__panel-copy aletheia-dashboard__research-status">
              {researchConversation.statusMessage}
            </p>
          ) : null}
          {researchConversation.synthesis ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--ok"
              data-testid="aletheia-dashboard-research-synthesis"
            >
              <p className="aletheia-dashboard__confirm-key">Answer</p>
              <p className="aletheia-dashboard__panel-copy">{researchConversation.synthesis}</p>
            </div>
          ) : null}
          {researchConversation.citations.length > 0 ? (
            <ul className="aletheia-dashboard__research-citations" data-testid="aletheia-dashboard-research-citations">
              {researchConversation.citations.map((citation) => (
                <li key={`${citation.index}-${citation.url}`}>
                  [{citation.index}] {citation.url}
                </li>
              ))}
            </ul>
          ) : null}
          {researchConversation.phase === "complete" ? (
            <div className="aletheia-dashboard__confirm-actions" data-testid="aletheia-dashboard-research-follow-ups">
              {followUps.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="aletheia-dashboard__secondary-btn"
                  data-testid={`aletheia-dashboard-research-follow-up-${action}`}
                  onClick={() => onFollowUp(action)}
                >
                  {action === "summarize"
                    ? "Summarize"
                    : action === "compare_deeper"
                      ? "Compare deeper"
                      : action === "save_to_notes"
                        ? "Save to notes"
                        : action === "draft_from_findings"
                          ? "Draft from findings"
                          : "Hand to writing"}
                </button>
              ))}
            </div>
          ) : null}
          {researchConversation.errorMessage ? (
            <div
              className="aletheia-dashboard__confirm-result aletheia-dashboard__confirm-result--error"
              data-testid="aletheia-dashboard-research-error"
            >
              <p className="aletheia-dashboard__confirm-key">Could not finish</p>
              <p className="aletheia-dashboard__panel-copy">{researchConversation.errorMessage}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PendingAdviceCard({
  card,
  onApprove,
  onDismiss,
}: {
  card: AletheiaAdviceCard;
  onApprove: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <li className="aletheia-dashboard__advice-card" data-testid="aletheia-dashboard-advice-card">
      <p className="aletheia-dashboard__advice-headline">{card.headline}</p>
      <p className="aletheia-dashboard__advice-body">{card.body}</p>
      <p className="aletheia-dashboard__advice-question">{card.question}</p>
      <div className="aletheia-dashboard__panel-actions">
        <button
          type="button"
          className="aletheia-dashboard__activate"
          data-testid="aletheia-dashboard-advice-approve"
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className="aletheia-dashboard__secondary-btn"
          data-testid="aletheia-dashboard-advice-dismiss"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

function ObservationPanel({
  observationPlane,
  activation,
  ambientSynthesis,
  companionActive,
}: {
  observationPlane?: GlassState["aletheiaObservationPlane"];
  activation?: GlassState["aletheiaActivation"];
  ambientSynthesis?: GlassState["aletheiaAmbientSynthesis"];
  companionActive: boolean;
}): JSX.Element {
  const modeClass =
    observationPlane?.mode === "companion_active"
      ? " aletheia-dashboard__mode-pill--active"
      : observationPlane?.mode === "passive"
        ? " aletheia-dashboard__mode-pill--passive"
        : observationPlane?.mode === "companion_privacy"
          ? " aletheia-dashboard__mode-pill--privacy"
          : "";

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-observation">
      <p className="aletheia-dashboard__panel-label">Observation signals</p>
      {observationPlane ? (
        <>
          <div className="aletheia-dashboard__observation-mode">
            <span
              className={`aletheia-dashboard__mode-pill${modeClass}`}
              data-testid="aletheia-dashboard-observation-mode"
            >
              {observationPlane.modeLabel}
            </span>
            <p className="aletheia-dashboard__panel-meta">{observationPlane.modeDetail}</p>
          </div>
          <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-observation-engagement">
            {observationPlane.engagementNote}
          </p>
          <ul className="aletheia-dashboard__stat-list" data-testid="aletheia-dashboard-observation-signals">
            {observationPlane.signals.map((row) => (
              <ObservationSignalInstrument key={row.id} row={row} />
            ))}
          </ul>
          {observationPlane.sessionId ? (
            <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-observation-recall">
              {observationPlane.sessionSnapshotCount} signal snapshot
              {observationPlane.sessionSnapshotCount === 1 ? "" : "s"} persisted for this session.
            </p>
          ) : null}
          {companionActive && activation ? (
            <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-activation-phase">
              Activation: {activationPhaseLabel(activation.phase)}
              {activation.awaitingUserLead ? " — waiting for you to lead" : ""}
            </p>
          ) : null}
          {ambientSynthesis?.ready && ambientSynthesis.connectedPicture ? (
            <div data-testid="aletheia-dashboard-ambient-synthesis">
              <p className="aletheia-dashboard__panel-footnote">Connected picture</p>
              <p className="aletheia-dashboard__panel-copy memory-note-card__summary">
                {ambientSynthesis.connectedPicture}
              </p>
              {ambientSynthesis.connections.length > 1 ? (
                <ul className="aletheia-dashboard__stat-list">
                  {ambientSynthesis.connections.slice(1, 3).map((row) => (
                    <li key={row.id}>
                      <span className="aletheia-dashboard__stat-key">{row.signals.join(" + ")}</span>
                      <span className="aletheia-dashboard__stat-value">{row.insight}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="aletheia-dashboard__panel-meta">Checking observation signals…</p>
      )}
    </section>
  );
}

function ObservationSignalInstrument({ row }: { row: ObservationSignalRowData }): JSX.Element {
  const ok = row.status === "active" || row.status === "idle";
  const statusLabel = observationSignalStatusLabel(row.status);
  const permissionNote =
    row.permissionLabel && row.permissionStatus
      ? `${row.permissionLabel}: ${row.permissionStatus.replace(/_/g, " ")}`
      : null;

  return (
    <li className="aletheia-dashboard__permission-instrument" data-testid={`aletheia-observation-${row.id}`}>
      <div className="aletheia-dashboard__permission-instrument-head">
        <span className="aletheia-dashboard__stat-key">{row.label}</span>
        <span
          className={`aletheia-dashboard__stat-value${
            row.status === "active"
              ? " aletheia-dashboard__stat-value--live"
              : ok
                ? " aletheia-dashboard__stat-value--ok"
                : " aletheia-dashboard__stat-value--error"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="aletheia-dashboard__permission-copy">{row.detail}</p>
      {permissionNote ? (
        <p className="aletheia-dashboard__permission-impact">Permission: {permissionNote}</p>
      ) : null}
    </li>
  );
}

function PermissionsPanel({
  permissionPlane,
  capabilities,
  consentState,
  systemAudioStatus,
  onOpenSetup,
}: {
  permissionPlane?: GlassState["aletheiaPermissionPlane"];
  capabilities: GlassCapabilityRow[];
  consentState?: GlassState["consentState"];
  systemAudioStatus?: string;
  onOpenSetup: () => void;
}): JSX.Element {
  const mic = capabilities.find((row) => row.id === "microphone");
  const screen = capabilities.find((row) => row.id === "screenRecording");
  const audio = capabilities.find((row) => row.id === "systemAudio");

  const instrumentRows =
    permissionPlane?.domains.filter((row) =>
      ["microphone", "screenCapture", "systemAudio", "accessibility", "automation"].includes(row.id),
    ) ?? [];

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-permissions">
      <p className="aletheia-dashboard__panel-label">Permissions &amp; authority</p>
      {permissionPlane ? (
        <p className="aletheia-dashboard__panel-meta" data-testid="aletheia-dashboard-authority-tier">
          Authority tier: {permissionPlane.authorityTier.replace(/_/g, " ")}
        </p>
      ) : null}
      {instrumentRows.length > 0 ? (
        <ul className="aletheia-dashboard__stat-list" data-testid="aletheia-dashboard-permission-plane">
          {instrumentRows.map((row) => (
            <PermissionInstrumentRow key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <ul className="aletheia-dashboard__stat-list">
          <PermissionRow label="Microphone" row={mic} fallback={mic ? undefined : "Not checked"} />
          <PermissionRow label="Screen capture" row={screen} fallback={screen ? undefined : "Not checked"} />
          <PermissionRow
            label="Machine audio"
            row={audio}
            fallback={
              systemAudioStatus === "available"
                ? "Available"
                : systemAudioStatus ?? "Not configured"
            }
          />
        </ul>
      )}
      <p className="aletheia-dashboard__panel-footnote">Consent checkpoints</p>
      <ul className="aletheia-dashboard__stat-list">
        <ConsentRow label="Mic consent" ack={consentState?.micAck === true} />
        <ConsentRow label="Screen consent" ack={consentState?.screenAck === true} />
        <ConsentRow label="Recording consent" ack={consentState?.recordingAck === true} />
        <ConsentRow label="Terms accepted" ack={consentState?.tosAck === true} />
      </ul>
      <button
        type="button"
        className="aletheia-dashboard__link-btn"
        data-testid="aletheia-dashboard-open-setup"
        onClick={onOpenSetup}
      >
        Open Glass System setup →
      </button>
    </section>
  );
}

function PermissionInstrumentRow({ row }: { row: PermissionDomainRow }): JSX.Element {
  const ok = row.status === "ready";
  const statusLabel =
    row.status === "ready"
      ? "Ready"
      : row.status === "missing_consent"
        ? "Consent required"
        : row.status === "missing_os_permission"
          ? "OS permission required"
          : row.status === "blocked"
            ? "Blocked"
            : row.status === "degraded"
              ? "Degraded"
              : "Unknown";
  return (
    <li className="aletheia-dashboard__permission-instrument" data-testid={`aletheia-permission-${row.id}`}>
      <div className="aletheia-dashboard__permission-instrument-head">
        <span className="aletheia-dashboard__stat-key">{row.label}</span>
        <span
          className={`aletheia-dashboard__stat-value${ok ? " aletheia-dashboard__stat-value--ok" : " aletheia-dashboard__stat-value--error"}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="aletheia-dashboard__permission-copy">{row.whyNeeded}</p>
      <p className="aletheia-dashboard__permission-impact">
        {ok ? row.withIt : row.withoutIt}
      </p>
    </li>
  );
}

function PermissionRow({
  label,
  row,
  fallback,
}: {
  label: string;
  row?: GlassCapabilityRow;
  fallback?: string;
}): JSX.Element {
  const value = row?.label ?? fallback ?? "Unknown";
  const ok = row?.severity === "ok";
  return (
    <li>
      <span className="aletheia-dashboard__stat-key">{label}</span>
      <span
        className={`aletheia-dashboard__stat-value${ok ? " aletheia-dashboard__stat-value--ok" : row?.severity === "error" ? " aletheia-dashboard__stat-value--error" : ""}`}
      >
        {value}
      </span>
    </li>
  );
}

function PrivacyPanel({
  companionActive,
  privacy,
  onStart,
  onEnd,
}: {
  companionActive: boolean;
  privacy?: { active: boolean; resumeAt: number; durationMs: number };
  onStart: () => void;
  onEnd: () => void;
}): JSX.Element {
  const resumeLabel = privacy?.active
    ? new Date(privacy.resumeAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-privacy">
      <p className="aletheia-dashboard__panel-label">
        <Shield size={12} strokeWidth={2} aria-hidden="true" /> Privacy
      </p>
      {privacy?.active ? (
        <p className="aletheia-dashboard__panel-copy" data-testid="aletheia-dashboard-privacy-active">
          Aletheia is silent until {resumeLabel}. She still listens for your resume phrase.
        </p>
      ) : (
        <p className="aletheia-dashboard__panel-copy">
          Pause Aletheia for 10 minutes — useful when others are in the room.
        </p>
      )}
      <div className="aletheia-dashboard__panel-actions">
        <button
          type="button"
          className="aletheia-dashboard__secondary-btn"
          data-testid="aletheia-dashboard-privacy-start"
          disabled={!companionActive || privacy?.active === true}
          onClick={onStart}
        >
          Start privacy
        </button>
        <button
          type="button"
          className="aletheia-dashboard__secondary-btn"
          data-testid="aletheia-dashboard-privacy-end"
          disabled={!privacy?.active}
          onClick={onEnd}
        >
          End privacy
        </button>
      </div>
    </section>
  );
}

function ConsentRow({ label, ack }: { label: string; ack: boolean }): JSX.Element {
  return (
    <li>
      <span className="aletheia-dashboard__stat-key">{label}</span>
      <span
        className={`aletheia-dashboard__stat-value${ack ? " aletheia-dashboard__stat-value--ok" : ""}`}
        data-testid={`aletheia-dashboard-consent-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {ack ? "Acknowledged" : "Required"}
      </span>
    </li>
  );
}

function VoiceSessionPanel({
  visible,
  companionActive,
  liveTranscript,
  lastPrompt,
  frontApp,
}: {
  visible: boolean;
  companionActive: boolean;
  liveTranscript: string;
  lastPrompt?: string;
  frontApp?: string;
}): JSX.Element {
  const [recentSessions, setRecentSessions] = useState<SessionRowWithMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const snippet = liveTranscript.trim() || lastPrompt?.trim();

  useEffect(() => {
    if (!visible) return;
    void window.glass
      .getAletheiaRecentSessions()
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [visible, companionActive]);

  useEffect(() => {
    if (!visible || !selectedSessionId) {
      setSessionMessages([]);
      return;
    }
    setMessagesLoading(true);
    void window.glass
      .getAletheiaSessionMessages(selectedSessionId)
      .then((messages) => {
        setSessionMessages(messages);
      })
      .catch(() => {
        setSessionMessages([]);
      })
      .finally(() => {
        setMessagesLoading(false);
      });
  }, [visible, selectedSessionId]);

  const handleSelectSession = useCallback((sessionId: string): void => {
    setSelectedSessionId((current) => (current === sessionId ? null : sessionId));
  }, []);

  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-sessions">
      <p className="aletheia-dashboard__panel-label">Voice session</p>
      {!companionActive ? (
        <p className="aletheia-dashboard__panel-copy">Activate Aletheia to start a voice session.</p>
      ) : snippet ? (
        <blockquote className="aletheia-dashboard__quote" data-testid="aletheia-dashboard-session-snippet">
          {snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet}
        </blockquote>
      ) : (
        <p className="aletheia-dashboard__panel-copy">Listening — speak when ready.</p>
      )}
      {frontApp ? (
        <p className="aletheia-dashboard__panel-meta">Context: {frontApp}</p>
      ) : null}
      {recentSessions.length > 0 ? (
        <ul className="aletheia-dashboard__session-list" data-testid="aletheia-dashboard-session-list">
          {recentSessions.slice(0, 5).map((session) => {
            const label =
              session.title?.trim() ||
              session.first_message_preview?.trim() ||
              session.agent_type?.trim() ||
              "Session";
            const selected = selectedSessionId === session.id;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  className={`aletheia-dashboard__session-row${selected ? " aletheia-dashboard__session-row--selected" : ""}`}
                  data-testid="aletheia-dashboard-session-row"
                  aria-expanded={selected}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <span className="aletheia-dashboard__session-time">
                    {formatRelativeTime(session.updated_at)}
                  </span>
                  <span className="aletheia-dashboard__session-title">{label}</span>
                </button>
                {selected ? (
                  <SessionMessageDetail messages={sessionMessages} loading={messagesLoading} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-sessions-empty">
          No prior sessions on this device yet.
        </p>
      )}
    </section>
  );
}

function SessionMessageDetail({
  messages,
  loading,
}: {
  messages: MessageRow[];
  loading: boolean;
}): JSX.Element {
  if (loading) {
    return (
      <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-session-messages-loading">
        Loading session recap…
      </p>
    );
  }
  if (messages.length === 0) {
    return (
      <p className="aletheia-dashboard__panel-footnote" data-testid="aletheia-dashboard-session-messages-empty">
        No messages recorded for this session.
      </p>
    );
  }
  return (
    <ul className="aletheia-dashboard__message-list" data-testid="aletheia-dashboard-session-messages">
      {messages.slice(0, 12).map((message) => {
        const text = message.content.trim();
        const preview = text.length > 180 ? `${text.slice(0, 180)}…` : text;
        return (
          <li key={message.id} className="aletheia-dashboard__message-row">
            <span className="aletheia-dashboard__message-role">{message.role}</span>
            <span className="aletheia-dashboard__message-text">{preview || "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MemoryPanel({ onOpenGlassMemory }: { onOpenGlassMemory: () => void }): JSX.Element {
  return (
    <section className="aletheia-dashboard__panel" data-testid="aletheia-dashboard-memory">
      <p className="aletheia-dashboard__panel-label">Memory</p>
      <p className="aletheia-dashboard__panel-copy">
        Aletheia keeps short-lived session routing while active. Durable memory — what Glass remembers
        across sessions — is managed in the Glass System dashboard.
      </p>
      <button
        type="button"
        className="aletheia-dashboard__link-btn"
        data-testid="aletheia-dashboard-open-memory"
        onClick={onOpenGlassMemory}
      >
        Open Glass System → Memory
      </button>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { BuilderStrip } from "../builder/BuilderStrip.tsx";
import { shouldShowBuilderStrip } from "../../shared/builderStripVisibility.ts";
import type { GlassState } from "../../shared/ipc.ts";
import type { OverlayMode } from "../../shared/glassWindowTypes.ts";
import type { GlassSessionInsight } from "../../shared/sessionTypes.ts";
import {
  isOverlayCardEventKind,
  overlayCardFromEvent,
} from "../../shared/overlayCards.ts";
import { send, useGlassState } from "../useGlassState.ts";
import { CopilotOverlay } from "./CopilotOverlay.tsx";
import { GlassNotificationHost } from "./GlassNotificationHost.tsx";
import { GlassUpdateOverlay } from "./GlassUpdateOverlay.tsx";
import { OverlayGlassFrame } from "../shared/OverlayGlassFrame.tsx";
import { GlassOnboardingOverlay } from "./GlassOnboardingOverlay.tsx";
import { SortingHatScreen } from "../onboarding/SortingHatScreen.tsx";
import { LanguagePickerScreen } from "../onboarding/LanguagePickerScreen.tsx";
import { isUiLocaleChosen, parseUiLocaleSetting } from "../../shared/glassLocale.ts";
import { LiveTranslateCaptionsOverlay } from "./LiveTranslateCaptionsOverlay.tsx";
import { useGlassNotification } from "./useGlassNotification.ts";
import { TerminalFeedWidget } from "./TerminalFeedWidget.tsx";
import { useExtractModeTranscript, useExtractBuildDetection, useExtractModeMainSync } from "./useExtractModeBridge.ts";
import { ExtractBuildCard } from "./ExtractBuildCard.tsx";
import { GlassCommandPalette } from "./GlassCommandPalette.tsx";
import { isSubstantialLastAskResponse, type GlassLastAskResponse } from "../../shared/glassAskTypes.ts";
import type { AgentEvent, GlassAgentId, GlassAgentRunStatus } from "../../shared/ipc.ts";
import { agentCatalogName } from "../../shared/agentCatalog.ts";
import { GlassResponsePanel } from "./GlassResponsePanel.tsx";
import { GlassCoderPanel } from "./GlassCoderPanel.tsx";
import { GlassIdeShell } from "./GlassIdeShell.tsx";
import { builderStripLayoutReservePx, builderStripTopFromBottomPx, glassIdeBottomReservePx } from "../../shared/glassLayoutMath.ts";
import { GlassPowersMenu } from "../command/GlassPowersMenu.tsx";
import { GlassDebriefPanel } from "./GlassDebriefPanel.tsx";
import type { PaletteLastTerminalBlock } from "../../shared/paletteTypes.ts";
import { overlayNotificationBottomPx } from "../../shared/glassLayoutMath.ts";
import { overlayFeedNotificationActive, overlayNoticeNotificationActive } from "../../shared/overlayPointerPolicy.ts";
import { isLiveTranslateActive } from "../../shared/liveTranslateState.ts";
import { GlassCompanionPresence } from "../companion/GlassCompanionPresence.tsx";
import { useGlassCompanion } from "../companion/GlassCompanionProvider.tsx";

// ---------------------------------------------------------------------------
// Session greeting — plays once per session after Glass fully loads
// ---------------------------------------------------------------------------

/** Module-level flag — survives re-renders/re-mounts within the same session. */
let greetingPlayedThisSession = false;

function buildGreeting(name: string): string {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = name.trim().split(/\s+/)[0];
  return `Good ${timeOfDay}, ${firstName}. Glass is ready.`;
}

/**
 * Fires a TTS greeting once when Glass loads with a known user and completed
 * onboarding. Skips gracefully if there's no name, on first-ever launch, or
 * shortly after Sorting Hat finishes (avoids overlapping reveal TTS).
 */
const GREETING_DELAY_MS = 1_200;
const GREETING_COOLDOWN_AFTER_ONBOARDING_MS = 14_000;

function useGlassGreeting(state: GlassState): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || greetingPlayedThisSession) return;
    if (!state.onboardingComplete) return;

    const name = state.glassUserProfile?.name?.trim();
    if (!name) return;

    const finishedAt = state.onboardingFinishedAt;
    const cooldownRemaining =
      finishedAt != null
        ? finishedAt + GREETING_COOLDOWN_AFTER_ONBOARDING_MS - Date.now()
        : 0;
    const delayMs = Math.max(GREETING_DELAY_MS, cooldownRemaining);

    const t = window.setTimeout(() => {
      if (firedRef.current || greetingPlayedThisSession) return;
      firedRef.current = true;
      greetingPlayedThisSession = true;
      send({ type: "glass-tts", text: buildGreeting(name) });
    }, delayMs);

    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.onboardingComplete, state.glassUserProfile?.name, state.onboardingFinishedAt]);
}


const CARD_TTL_MS = 8_000;
const MAX_CARDS = 4;
/** Built-in primary display — visual frame inset from overlay window bottom. */
const PRIMARY_FRAME_BOTTOM_INSET_PX = 7;
/** Horizontal frame inset — slightly tighter than top widens the side brackets. */
const PRIMARY_FRAME_SIDE_INSET_PX = 7;

function overlayFrameBottomInsetPx(_state: GlassState): number {
  // Decorative frame only — keep near the overlay bottom so the command bar
  // (separate window) still sits inside the framed region.
  return PRIMARY_FRAME_BOTTOM_INSET_PX;
}

function overlayRootClassName(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function overlayLayoutStyle(state: GlassState): CSSProperties {
  const frameBottom = overlayFrameBottomInsetPx(state);
  return {
    "--overlay-frame-bottom": `${frameBottom}px`,
    "--overlay-glass-frame-inset-bottom": `${frameBottom}px`,
    "--overlay-glass-frame-inset-left": `${PRIMARY_FRAME_SIDE_INSET_PX}px`,
    "--overlay-glass-frame-inset-right": `${PRIMARY_FRAME_SIDE_INSET_PX}px`,
    "--overlay-notification-bottom": `${overlayNotificationBottomPx({
      commandBarOverlayClearancePx: state.commandBarOverlayClearancePx,
      commandBarStackHeightPx: state.commandBarStackHeightPx,
    })}px`,
    "--extract-card-bottom": `${overlayNotificationBottomPx({
      commandBarOverlayClearancePx: state.commandBarOverlayClearancePx,
      commandBarStackHeightPx: state.commandBarStackHeightPx,
    }) + 52}px`,
    "--grp-bottom-reserve": `${builderStripLayoutReservePx()}px`,
    "--builder-strip-top-from-bottom": `${builderStripTopFromBottomPx()}px`,
    "--glass-ide-bottom-reserve": `${glassIdeBottomReservePx()}px`,
    "--coder-panel-width": `${state.coderWorkspaceActive && !state.glassIdeActive ? (state.glassSettings.coderPanelWidthPx ?? 480) : 0}px`,
  } as CSSProperties;
}

function builderStripVisibleForState(state: GlassState): boolean {
  return shouldShowBuilderStrip({
    onboardingComplete: state.onboardingComplete,
    persona: state.persona,
    glassDevMode: state.glassDevMode ?? import.meta.env.DEV,
  });
}

function paletteModalOpenForState(state: GlassState): boolean {
  return !!(state.commandPaletteOpen || state.powersMenuOpen);
}

function CompanionPresenceLayer({ state }: { state: GlassState }): JSX.Element {
  const companion = useGlassCompanion();
  return (
    <GlassCompanionPresence
      presence={state.companionPresence ?? null}
      companionActive={state.companionModeActive === true}
      activeManifestations={companion.activeManifestations}
    />
  );
}

function ExitGlassButton(): JSX.Element {
  return (
    <button
      type="button"
      onMouseEnter={ensureOverlayInteractive}
      onClick={() => send({ type: "glass-quit" })}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 99999,
        background: "transparent",
        border: "1px solid rgba(239, 68, 68, 0.65)",
        borderRadius: 6,
        color: "rgba(239, 68, 68, 0.9)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.04em",
        padding: "4px 10px",
        cursor: "pointer",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        userSelect: "none",
        lineHeight: 1.4,
        pointerEvents: "auto",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(239, 68, 68, 0.12)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239, 68, 68, 1)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(239, 68, 68, 1)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239, 68, 68, 0.65)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(239, 68, 68, 0.9)";
      }}
    >
      Exit Glass
    </button>
  );
}

function ExtractModeBridge(): null {
  useExtractModeMainSync();
  useExtractModeTranscript();
  useExtractBuildDetection();
  return null;
}

function PaletteLayer({
  state,
  lastTerminalBlock,
}: {
  state: GlassState;
  lastTerminalBlock: PaletteLastTerminalBlock | null;
}): JSX.Element {
  return (
    <>
      <GlassCommandPalette
        open={state.commandPaletteOpen ?? false}
        onClose={() => send({ type: "dismiss-command-palette" })}
        lastTerminalBlock={lastTerminalBlock}
        activePtyId={state.glassDockTerminalId ?? null}
      />
      <GlassPowersMenu />
    </>
  );
}

function BuilderStripLayer({
  state,
  onEnterInteractive,
  onLeaveInteractive,
}: {
  state: GlassState;
  onEnterInteractive: () => void;
  onLeaveInteractive: () => void;
}): JSX.Element | null {
  const openExtractRef = useRef<(() => void) | null>(null);
  const handleCardOpen = useCallback(() => {
    openExtractRef.current?.();
  }, []);

  if (!builderStripVisibleForState(state)) {
    return null;
  }
  return (
    <>
      <ExtractModeBridge />
      <BuilderStrip
        onEnterInteractive={onEnterInteractive}
        onLeaveInteractive={onLeaveInteractive}
        onOpenExtractRef={openExtractRef}
      />
      <ExtractBuildCard onOpen={handleCardOpen} />
    </>
  );
}

type FloatingCard = {
  id: string;
  title: string;
  body: string;
  kind: "event" | "insight";
};

function overlayCardFromInsight(insight: GlassSessionInsight): FloatingCard {
  return {
    id: insight.id,
    title: insight.title,
    body: insight.text,
    kind: "insight",
  };
}

function OverlayPassiveLayer({
  overlayMode,
  meetingsActive,
}: {
  overlayMode: OverlayMode;
  meetingsActive: boolean;
}): JSX.Element {
  return (
    <>
      <div className="overlay-glass-sheet" aria-hidden="true" />
      <div className="overlay-glass-grid" aria-hidden="true" />
      <OverlayGlassFrame />
      <div className="overlay-glass-glow overlay-glass-glow--tl" aria-hidden="true" />
      <div className="overlay-glass-glow overlay-glass-glow--br" aria-hidden="true" />
    </>
  );
}

function ListenCountdownOverlay({ seconds }: { seconds: number }): JSX.Element {
  return (
    <div className="listen-countdown" data-testid="glass-listen-countdown" aria-live="assertive">
      <div className="listen-countdown__backdrop" aria-hidden="true" />
      <div className="listen-countdown__card">
        <span className="listen-countdown__number">{seconds}</span>
        <span className="listen-countdown__label">Listening starts…</span>
        <span className="listen-countdown__hint">Get ready — capture begins when the timer hits zero.</span>
      </div>
    </div>
  );
}

function OverlayStatus({ state }: { state: GlassState }): JSX.Element | null {
  const { privacy } = state;
  const activityChips = (
    <>
      {privacy.capturing ? (
        <span className="overlay-status__chip overlay-status__chip--capture">
          <span className="overlay-status__pulse" aria-hidden="true" />
          Capturing screen
        </span>
      ) : null}
      {privacy.status === "sending" ? (
        <span className="overlay-status__chip overlay-status__chip--send">Sending to IIVO</span>
      ) : null}
    </>
  );
  const hasActivity = privacy.capturing || privacy.status === "sending";

  if (!hasActivity) {
    return null;
  }

  return (
    <>
      {hasActivity ? (
        <div className="overlay-status overlay-status--activity" aria-live="polite">
          {activityChips}
        </div>
      ) : null}
    </>
  );
}

function useOverlayCards(state: GlassState, enabled: boolean): {
  cards: FloatingCard[];
  dismissCard: (id: string) => void;
} {
  const [cards, setCards] = useState<FloatingCard[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const events = state.session?.events ?? [];
    const insights = state.session?.insights ?? [];

    if (!seededRef.current) {
      for (const event of events) seenRef.current.add(`event:${event.id}`);
      for (const insight of insights) seenRef.current.add(`insight:${insight.id}`);
      seededRef.current = true;
      return;
    }

    const nextCards: FloatingCard[] = [];

    for (const event of events) {
      const key = `event:${event.id}`;
      if (seenRef.current.has(key) || !isOverlayCardEventKind(event.kind)) continue;
      seenRef.current.add(key);
      nextCards.push({ ...overlayCardFromEvent(event), kind: "event" });
    }

    for (const insight of insights) {
      const key = `insight:${insight.id}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      nextCards.push(overlayCardFromInsight(insight));
    }

    if (nextCards.length === 0) return;

    setCards((current) => [...nextCards, ...current].slice(0, MAX_CARDS));
    for (const card of nextCards) {
      window.setTimeout(() => {
        setCards((current) => current.filter((item) => item.id !== card.id));
      }, CARD_TTL_MS);
    }
  }, [enabled, state.session?.events, state.session?.insights]);

  const dismissCard = (id: string): void => {
    setCards((current) => current.filter((item) => item.id !== id));
  };

  return { cards, dismissCard };
}

export function Overlay(): JSX.Element {
  const state = useGlassState();
  useGlassGreeting(state);
  const onboardingOpen = state.onboardingOpen;

  // ── Glass Command Palette (Task #66) — ⌘⇧G (state-driven from main hotkey) ───
  const lastTerminalBlock: PaletteLastTerminalBlock | null =
    state.paletteTerminalHint ?? null;

  const overlayMode = state.windows?.overlayMode ?? state.config.overlayMode ?? "passive";
  const overlayContentVisible =
    (state.windows?.overlayVisible ?? state.config.overlayEnabled) && overlayMode !== "hidden";
  const notificationEnabled = !onboardingOpen;
  const translateFocusActive = isLiveTranslateActive(state.liveTranslate);
  const { notification, fading, onChatHoverStart, onChatHoverEnd } = useGlassNotification(
    state,
    notificationEnabled,
    { suppressTransientNotifications: translateFocusActive },
  );
  const notificationVisible = Boolean(notification);
  const updateVisible =
    state.appUpdate.phase === "available" ||
    state.appUpdate.phase === "downloading" ||
    state.appUpdate.phase === "installing";
  const countdownVisible =
    state.listenCountdownSeconds != null && state.listenCountdownSeconds > 0;
  const { cards, dismissCard } = useOverlayCards(state, overlayContentVisible);

  // ── Glass Response Panel — auto-opens for substantial AI answers ──────────
  const [responsePanelOpen, setResponsePanelOpen] = useState(false);
  const lastResponseKeyRef = useRef<string | null>(null);
  const responseRevealSeqRef = useRef(0);
  const responsePanelInitRef = useRef(false);
  const agentRunIdRef = useRef<string | null>(null);
  const coderRunIdRef = useRef<string | null>(null);
  const glassIdeActiveRef = useRef(false);
  const agentPromptRef = useRef<string>("");
  const agentIdRef = useRef<GlassAgentId | null>(null);
  const agentTextRef = useRef("");
  const lastAskResponse = state.lastAskResponse ?? null;

  const [coderPanelOpen, setCoderPanelOpen] = useState(false);
  const [coderPanelWidth, setCoderPanelWidth] = useState(
    state.glassSettings.coderPanelWidthPx ?? 480,
  );
  const [coderAnswer, setCoderAnswer] = useState("");
  const [coderPrompt, setCoderPrompt] = useState("");
  const [coderRunId, setCoderRunId] = useState<string | null>(null);
  const [ideCoderLaunch, setIdeCoderLaunch] = useState<import("../../shared/ipc.ts").OpenCoderWithPromptPayload | null>(null);

  // Agent output — a synthetic GlassLastAskResponse built from streaming agent events
  const [agentResponse, setAgentResponse] = useState<GlassLastAskResponse | null>(null);

  useEffect(() => {
    glassIdeActiveRef.current = Boolean(state.glassIdeActive);
  }, [state.glassIdeActive]);

  useEffect(() => {
    const run = state.agentRun;
    if (run?.agentId !== "coder" || !run.runId) return;
    if (coderRunIdRef.current === run.runId) return;
    coderRunIdRef.current = run.runId;
    setCoderRunId(run.runId);
  }, [state.agentRun?.agentId, state.agentRun?.runId]);

  useEffect(() => {
    return window.glass.onOpenCoderWithPrompt((payload) => {
      setIdeCoderLaunch(payload);
    });
  }, []);

  useEffect(() => {
    const w = state.glassSettings.coderPanelWidthPx;
    if (w) setCoderPanelWidth(w);
  }, [state.glassSettings.coderPanelWidthPx]);

  useEffect(() => {
    if (!state.coderWorkspaceActive || state.glassIdeActive) return;
    if (state.agentRun?.agentId === "coder") {
      setCoderPanelOpen(true);
      return;
    }
    if (
      state.agentPendingApproval?.agentId === "coder"
      && state.agentPendingApproval.runId
    ) {
      setCoderPanelOpen(true);
    }
  }, [
    state.coderWorkspaceActive,
    state.glassIdeActive,
    state.agentRun?.agentId,
    state.agentRun?.runId,
    state.agentRun?.status,
    state.agentPendingApproval?.runId,
    state.agentPendingApproval?.agentId,
  ]);

  const startAgentResponse = useCallback((
    agentId: GlassAgentId,
    prompt: string,
    runId: string,
  ): void => {
    agentRunIdRef.current = runId;
    agentPromptRef.current = prompt;
    agentIdRef.current = agentId;
    agentTextRef.current = "";
    setAgentResponse({
      prompt: `${agentCatalogName(agentId)}: ${prompt}`,
      answer: "",
      fullAnswer: "",
      runId: `agent-${runId}`,
      at: new Date().toISOString(),
      agentMeta: {
        agentId,
        clientRunId: runId,
        originalPrompt: prompt,
        status: "running",
      },
    });
    setResponsePanelOpen(true);
  }, []);

  const handleAgentRefresh = useCallback((): void => {
    ensureOverlayInteractive();
    const runId = agentRunIdRef.current;
    const live = state.agentRun;
    const text = agentTextRef.current;

    setAgentResponse((prev) => {
      if (prev?.agentMeta) {
        const savedFilePath =
          live?.runId === runId ? live.savedFilePath ?? prev.agentMeta.savedFilePath : prev.agentMeta.savedFilePath;
        const status =
          live?.runId === runId ? live.status : prev.agentMeta.status;
        const syncedText = text || prev.fullAnswer || "";
        return {
          ...prev,
          answer: syncedText,
          fullAnswer: syncedText,
          agentMeta: { ...prev.agentMeta, savedFilePath, status },
        };
      }

      if (!live || live.runId !== runId) return prev;

      const agentId = live.agentId;
      const prompt = live.prompt ?? agentPromptRef.current;
      const syncedText = text;
      return {
        prompt: `${agentCatalogName(agentId)}: ${prompt}`,
        answer: syncedText,
        fullAnswer: syncedText,
        runId: `agent-${live.runId}`,
        at: new Date().toISOString(),
        agentMeta: {
          agentId,
          clientRunId: live.runId,
          originalPrompt: prompt,
          savedFilePath: live.savedFilePath,
          status: live.status,
        },
      };
    });
  }, [state.agentRun]);

  useEffect(() => {
    if (!responsePanelInitRef.current) {
      responsePanelInitRef.current = true;
      if (lastAskResponse) {
        lastResponseKeyRef.current = `${lastAskResponse.runId ?? ""}:${lastAskResponse.at ?? ""}`;
      }
      return;
    }
    if (!lastAskResponse) return;
    const key = `${lastAskResponse.runId ?? ""}:${lastAskResponse.at ?? ""}`;
    if (lastResponseKeyRef.current === key) return;
    lastResponseKeyRef.current = key;
    // Clear any agent response so the regular answer takes priority
    agentRunIdRef.current = null;
    setAgentResponse(null);
    if (isSubstantialLastAskResponse(lastAskResponse)) {
      setResponsePanelOpen(true);
    }
  }, [lastAskResponse]);

  useEffect(() => {
    const seq = state.responsePanelRevealSeq ?? 0;
    if (seq <= responseRevealSeqRef.current) return;
    responseRevealSeqRef.current = seq;
    if (lastAskResponse) setResponsePanelOpen(true);
  }, [state.responsePanelRevealSeq, lastAskResponse]);

  // Subscribe to agent DOM events emitted by GlassAgentPanel
  useEffect(() => {
    const handleAgentStart = (e: Event): void => {
      const { agentId, prompt, runId } = (e as CustomEvent<{
        agentId: GlassAgentId;
        prompt: string;
        runId: string;
      }>).detail;

      if (agentId === "coder") {
        coderRunIdRef.current = runId;
        setCoderRunId(runId);
        setCoderPrompt(prompt);
        setCoderAnswer("");
        if (!glassIdeActiveRef.current) {
          setCoderPanelOpen(true);
        }
        return;
      }

      startAgentResponse(agentId, prompt, runId);
    };

    const handleAgentOutput = (e: Event): void => {
      const { text, runId, agentId } = (e as CustomEvent<{
        agentId: string;
        runId: string;
        text: string;
      }>).detail;

      if (agentId === "coder" && runId === coderRunIdRef.current) {
        setCoderAnswer(text);
        return;
      }

      if (runId !== agentRunIdRef.current) return;
      agentTextRef.current = text;
      setAgentResponse((prev) => {
        if (!prev) return prev;
        return { ...prev, answer: text, fullAnswer: text };
      });
    };

    window.addEventListener("glass-agent-start", handleAgentStart);
    window.addEventListener("glass-agent-output", handleAgentOutput);
    return () => {
      window.removeEventListener("glass-agent-start", handleAgentStart);
      window.removeEventListener("glass-agent-output", handleAgentOutput);
    };
  }, [startAgentResponse]);

  // Enrich agent response with file path and terminal status from IPC events.
  useEffect(() => {
    const statusFromEvent = (kind: AgentEvent["kind"]): GlassAgentRunStatus | undefined => {
      if (kind === "done") return "done";
      if (kind === "error") return "error";
      if (kind === "cancelled") return "cancelled";
      return undefined;
    };

    return window.glass.onAgentEvent((ev: AgentEvent) => {
      if (ev.agentId === "coder" && ev.runId === coderRunIdRef.current) {
        if (ev.kind === "text-delta") {
          setCoderAnswer((prev) => prev + (ev.text ?? ""));
        }
        return;
      }

      if (ev.runId !== agentRunIdRef.current) return;

      if (ev.kind === "text-delta") {
        setAgentResponse((prev) => {
          if (!prev) return prev;
          const nextText = (prev.fullAnswer ?? "") + (ev.text ?? "");
          agentTextRef.current = nextText;
          return { ...prev, answer: nextText, fullAnswer: nextText };
        });
        return;
      }

      const terminalStatus = statusFromEvent(ev.kind);
      if (ev.kind === "tool-done" && ev.savedFilePath) {
        setAgentResponse((prev) => {
          if (!prev?.agentMeta) return prev;
          return {
            ...prev,
            agentMeta: { ...prev.agentMeta, savedFilePath: ev.savedFilePath },
          };
        });
      } else if (terminalStatus) {
        setAgentResponse((prev) => {
          if (!prev?.agentMeta) return prev;
          return {
            ...prev,
            agentMeta: { ...prev.agentMeta, status: terminalStatus },
          };
        });
      }
    });
  }, []);

  useEffect(() => {
    window.glass.setResponsePanelOpen?.(responsePanelOpen);
    return () => {
      window.glass.setResponsePanelOpen?.(false);
    };
  }, [responsePanelOpen]);

  // Show agent response while it's streaming; fall back to last ask response
  const activeResponse = agentResponse ?? lastAskResponse;

  const responsePanel = (
    <GlassResponsePanel
      open={responsePanelOpen && !coderPanelOpen}
      response={activeResponse}
      onDismiss={() => setResponsePanelOpen(false)}
      onRefresh={agentResponse?.agentMeta ? handleAgentRefresh : undefined}
    />
  );

  const coderPanel = (
    <GlassCoderPanel
      open={coderPanelOpen && !state.glassIdeActive}
      widthPx={coderPanelWidth}
      onWidthChange={setCoderPanelWidth}
      onClose={() => setCoderPanelOpen(false)}
      state={state}
      answer={coderAnswer}
      prompt={coderPrompt}
      runId={
        coderRunId
        ?? (state.agentRun?.agentId === "coder" ? state.agentRun.runId : coderRunIdRef.current)
      }
    />
  );
  const feedNotificationActive = overlayFeedNotificationActive(notification);
  const noticeNotificationActive = overlayNoticeNotificationActive(notification);

  const enterInteractive = (): void => {
    ensureOverlayInteractive();
  };

  const leaveInteractive = (): void => {
    // mousemove tracking restores click-through when the pointer leaves interactive UI
  };

  const translateCaptionsVisible = Boolean(
    state.liveTranslate?.active &&
      state.liveTranslate.config.enabled &&
      state.liveTranslate.captionsVisible &&
      state.liveTranslate.captions.current &&
      state.liveTranslate.config.captionPosition !== "panel",
  );

  // Post-boot language picker — before Sorting Hat manifestation.
  if (
    state.onboardingComplete === false &&
    state.glassBootComplete === true &&
    !onboardingOpen &&
    !isUiLocaleChosen(state.glassSettings?.uiLocale)
  ) {
    return (
      <div className="overlay-root overlay-root--language-picker" data-testid="glass-overlay-root">
        <LanguagePickerScreen />
      </div>
    );
  }

  // Sorting Hat — after language is chosen.
  const chosenUiLocale = parseUiLocaleSetting(state.glassSettings?.uiLocale);
  if (
    state.onboardingComplete === false &&
    state.glassBootComplete === true &&
    !onboardingOpen &&
    chosenUiLocale
  ) {
    return (
      <div className="overlay-root overlay-root--sorting-hat" data-testid="glass-overlay-root">
        <SortingHatScreen
          key={chosenUiLocale}
          locale={chosenUiLocale}
          afterLanguagePicker
          onComplete={() => { /* IPC handler writes the result; no renderer action needed */ }}
        />
      </div>
    );
  }

  // GlassOnboardingOverlay retired — Sorting Hat now handles all first-launch
  // onboarding including name collection. The onboardingOpen path is kept as a
  // safety net for any existing sessions that had the old flow in progress.
  if (onboardingOpen && !state.onboardingComplete) {
    return (
      <div className="overlay-root overlay-root--onboarding" data-testid="glass-overlay-root">
        <GlassOnboardingOverlay />
      </div>
    );
  }

  if (
    !overlayContentVisible &&
    !updateVisible &&
    !countdownVisible &&
    !translateCaptionsVisible &&
    !notificationVisible
  ) {
    if (builderStripVisibleForState(state)) {
      return (
        <div
          className={overlayRootClassName(
            "overlay-root",
            "overlay-root--builder-strip-only",
            paletteModalOpenForState(state) && "overlay-root--palette-open",
          )}
          data-testid="glass-overlay-root"
          style={overlayLayoutStyle(state)}
        >
          <OverlayGlassFrame />
          <CompanionPresenceLayer state={state} />
          <BuilderStripLayer
            state={state}
            onEnterInteractive={enterInteractive}
            onLeaveInteractive={leaveInteractive}
          />
          <PaletteLayer state={state} lastTerminalBlock={lastTerminalBlock} />
          <GlassDebriefPanel />
          {responsePanel}
          {coderPanel}
          <ExitGlassButton />
        </div>
      );
    }
    return (
      <>
        <GlassDebriefPanel />
        <div className="overlay-root overlay-root--hidden" />
      </>
    );
  }

  if (!overlayContentVisible && !countdownVisible && !updateVisible && translateCaptionsVisible) {
    return (
      <div
        className={overlayRootClassName(
          "overlay-root",
          "overlay-root--captions-only",
          translateFocusActive && "overlay-root--translate-active",
        )}
        data-testid="glass-overlay-root"
      >
        {state.liveTranslate ? (
          <LiveTranslateCaptionsOverlay
            runtime={state.liveTranslate}
            enterInteractive={enterInteractive}
            leaveInteractive={leaveInteractive}
          />
        ) : null}
        <BuilderStripLayer
          state={state}
          onEnterInteractive={enterInteractive}
          onLeaveInteractive={leaveInteractive}
        />
      </div>
    );
  }

  if (!overlayContentVisible && !countdownVisible && updateVisible) {
    return (
      <div className="overlay-root overlay-root--update-only" data-testid="glass-overlay-root">
        <GlassUpdateOverlay
          appUpdate={state.appUpdate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
        <BuilderStripLayer
          state={state}
          onEnterInteractive={enterInteractive}
          onLeaveInteractive={leaveInteractive}
        />
      </div>
    );
  }

  if (!overlayContentVisible && countdownVisible && !updateVisible) {
    return (
      <div className="overlay-root overlay-root--countdown-only" data-testid="glass-overlay-root">
        <ListenCountdownOverlay seconds={state.listenCountdownSeconds!} />
        <BuilderStripLayer
          state={state}
          onEnterInteractive={enterInteractive}
          onLeaveInteractive={leaveInteractive}
        />
      </div>
    );
  }

  if (
    !overlayContentVisible &&
    notificationVisible &&
    !updateVisible &&
    !countdownVisible &&
    !translateCaptionsVisible
  ) {
    return (
      <div
        className="overlay-root overlay-root--notice-only"
        data-testid="glass-overlay-root"
        style={overlayLayoutStyle(state)}
      >
        <GlassNotificationHost
          notification={notification}
          fading={fading}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
          onChatHoverStart={onChatHoverStart}
          onChatHoverEnd={onChatHoverEnd}
        />
        <BuilderStripLayer
          state={state}
          onEnterInteractive={enterInteractive}
          onLeaveInteractive={leaveInteractive}
        />
        <GlassDebriefPanel />
      </div>
    );
  }

  const showInsights = overlayContentVisible && overlayMode === "insights";

  return (
    <div
      className={overlayRootClassName(
        "overlay-root",
        state.glassIdeActive && "overlay-root--ide-active",
        translateFocusActive && "overlay-root--translate-active",
        paletteModalOpenForState(state) && "overlay-root--palette-open",
      )}
      data-testid="glass-overlay-root"
      style={overlayLayoutStyle(state)}
    >
      <OverlayPassiveLayer overlayMode={overlayMode} meetingsActive={state.meetingIntelligence != null} />
      <OverlayStatus state={state} />

      <GlassNotificationHost
        notification={notification}
        fading={fading}
        enterInteractive={enterInteractive}
        leaveInteractive={leaveInteractive}
        onChatHoverStart={onChatHoverStart}
        onChatHoverEnd={onChatHoverEnd}
      />

      {countdownVisible ? (
        <ListenCountdownOverlay seconds={state.listenCountdownSeconds!} />
      ) : null}

      <CopilotOverlay
        state={state}
        enterInteractive={enterInteractive}
        leaveInteractive={leaveInteractive}
      />

      <GlassDebriefPanel />

      {updateVisible ? (
        <GlassUpdateOverlay
          appUpdate={state.appUpdate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      ) : null}

      {showInsights && cards.length > 0 ? (
        <div className="overlay-cards">
          {cards.map((card) => (
            <article
              key={`${card.kind}:${card.id}`}
              className="overlay-card"
              onMouseEnter={enterInteractive}
              onMouseLeave={leaveInteractive}
            >
              <div className="overlay-card__eyebrow">
                {card.kind === "insight" ? "Insight" : "Session"}
              </div>
              <div className="overlay-card__title">{card.title}</div>
              <p className="overlay-card__body">{card.body}</p>
              <div className="overlay-card__actions">
                <button
                  type="button"
                  className="gbtn gbtn--primary"
                  onClick={() => {
                    send({ type: "set-tab", tab: card.kind === "insight" ? "insights" : "session" });
                    if (!state.panelVisible) send({ type: "toggle-panel" });
                  }}
                >
                  Open Panel
                </button>
                <button
                  type="button"
                  className="gbtn gbtn--ghost"
                  onClick={() => dismissCard(card.id)}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {state.liveTranslate?.active && state.liveTranslate.captionsVisible ? (
        <LiveTranslateCaptionsOverlay
          runtime={state.liveTranslate}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
        />
      ) : null}

      {state.terminalWidgetVisible && state.liveTerminal ? (
        <TerminalFeedWidget
          feed={state.liveTerminal}
          pos={state.terminalWidgetPos}
          onClose={() => send({ type: "terminal-widget-toggle" })}
          onPointerEnter={enterInteractive}
          onPointerLeave={leaveInteractive}
        />
      ) : null}

      <CompanionPresenceLayer state={state} />

      <BuilderStripLayer
        state={state}
        onEnterInteractive={enterInteractive}
        onLeaveInteractive={leaveInteractive}
      />

      <PaletteLayer state={state} lastTerminalBlock={lastTerminalBlock} />
      {responsePanel}
      {state.glassIdeActive ? (
        <GlassIdeShell
          state={state}
          answer={coderAnswer}
          prompt={coderPrompt}
          runId={coderRunId ?? (state.agentRun?.agentId === "coder" ? state.agentRun.runId : null)}
          launchPrompt={ideCoderLaunch}
          onLaunchConsumed={() => setIdeCoderLaunch(null)}
        />
      ) : null}
      {coderPanel}
      <ExitGlassButton />
    </div>
  );
}

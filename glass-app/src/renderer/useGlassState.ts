import { useEffect, useState } from "react";
import type { GlassState } from "../shared/ipc.ts";
import { emptyNotes } from "../shared/noteExtraction.ts";
import { initialPrivacyState } from "../shared/privacyState.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";
import { DEFAULT_GLASS_USER_SETTINGS } from "../shared/glassSettings.ts";
import { DEFAULT_WINGMAN_STATE } from "../shared/wingmanSession.ts";
import { DEFAULT_WINGMAN_MEMORY_STATE } from "../shared/wingmanMemory.ts";
import { DEFAULT_COPILOT_CONFIG } from "../shared/copilotTypes.ts";
import { INITIAL_OPERATION_DIAGNOSTICS } from "../shared/glassOperations.ts";
import { WINDOW_CONTEXT_UNAVAILABLE_MESSAGE } from "../shared/windowContextTypes.ts";
import { emptyGlassAppUpdateState } from "../shared/glassAppUpdate.ts";

import type { GlassSttState } from "../shared/sttTypes.ts";

const fallbackStt: GlassSttState = {
  provider: "none",
  endpoint: "server",
  status: "disabled",
  model: "gpt-4o-mini-transcribe",
  enabled: false,
  chunkMs: 20_000,
  autoStopEnabled: false,
  autoStopMs: 30 * 60 * 1000,
};

export const fallbackState: GlassState = {
  privacy: initialPrivacyState,
  transcript: "",
  notes: emptyNotes(),
  moments: [],
  panelTab: "session",
  captureSubTab: undefined,
  config: DEFAULT_CONFIG,
  session: null,
  sessionSummary: "",
  sessionActionStatus: "idle",
  transcriptionMode: "manual",
  systemAudioStatus: "requires_permission",
  windowContext: { status: "unavailable", reason: WINDOW_CONTEXT_UNAVAILABLE_MESSAGE },
  iivoAnalysis: { status: "idle" },
  stt: fallbackStt,
  panelVisible: false,
  windows: {
    overlayVisible: true,
    overlayClickThrough: true,
    overlayMode: "passive",
    panelVisible: false,
    commandBarVisible: true,
    diagnostics: "",
  },
  operationDiagnostics: { ...INITIAL_OPERATION_DIAGNOSTICS },
  commandFeed: [],
  askStatus: "idle" as const,
  latestScreenshot: null,
  screenContextStatus: { kind: "none", label: "Screen: no capture" },
  glassSettings: { ...DEFAULT_GLASS_USER_SETTINGS },
  availableDisplayIds: [],
  connectedDisplays: [],
  setupCapabilities: [],
  micPermission: "not_requested",
  copilot: {
    mode: "off",
    config: { ...DEFAULT_COPILOT_CONFIG },
    active: false,
    muted: false,
    pendingInterventions: [],
    insightCount: 0,
    debrief: null,
    offer: null,
    systemAudioSilenceWarning: false,
    sessionType: "general_workflow",
    debriefReady: false,
    consecutiveDismissals: 0,
    listeningLimitReached: false,
    sessionTypeRefineAvailable: false,
    sessionTypeRefining: false,
    semanticSessionType: null,
    diagnosticResult: null,
    diagnosticAnalyzing: false,
  },
  appUpdate: emptyGlassAppUpdateState("0.1.0"),
  onboardingOpen: false,
  onboardingComplete: false,
  glassUserProfile: null,
  commandBarOverlayClearancePx: undefined,
  iivoAccountLink: null,
  serverRuntimeFlags: null,
  iivoApiUrl: DEFAULT_CONFIG.iivoApiUrl,
  iivoWebUrl: DEFAULT_CONFIG.iivoWebUrl,
  wingman: DEFAULT_WINGMAN_STATE,
  wingmanMemory: DEFAULT_WINGMAN_MEMORY_STATE,
  agentProxy: {
    consented: false,
    running: false,
    port: 7421,
    showConsentModal: false,
    capturedCallCount: 0,
  },
  githubPATConfigured: false,
  githubTokenInvalid: false,
  liveTerminal: null,
  terminalWidgetVisible: false,
  terminalWidgetPos: { x: 20, y: 60 },
  glassDockTerminalOpen: false,
  glassIdeTerminalExpanded: false,
  glassIdeAletheia: {
    chip: null,
    feedLine: null,
    spokenText: null,
    spokenNonce: 0,
  },
  glassDockTerminalId: undefined,
  glassDockTerminalTabs: undefined,
  glassTerminalPendingAction: undefined,
  commandPaletteOpen: false,
};

export function useGlassState(): GlassState {
  const [state, setState] = useState<GlassState>(fallbackState);

  useEffect(() => {
    let active = true;
    void window.glass.getState().then((snapshot) => {
      if (active) setState(snapshot);
    });
    const unsubscribe = window.glass.onState((next) => setState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

export function send(command: Parameters<typeof window.glass.send>[0]): void {
  window.glass.send(command);
}

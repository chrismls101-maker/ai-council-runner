/**
 * IIVO Glass — Complete UI Map
 *
 * Every interactive element in Glass, its testid, what it does, and when it's visible.
 * Used by the visual inspector and autonomous agent to navigate Glass without guessing.
 *
 * Usage:
 *   import { GLASS_UI, TABS, getConnectButton, getTabButton } from "./glass-ui-map.mjs";
 */

// ─── Panel Tabs ────────────────────────────────────────────────────────────────

export const TABS = {
  copilot:     { id: "copilot",     testid: "glass-panel-tab-copilot",     label: "Copilot / Modes",      desc: "Listen, Meetings, Translate mode cards" },
  setup:       { id: "setup",       testid: "glass-panel-tab-setup",       label: "Setup",                desc: "Connect IIVO Glass, status rows, permissions" },
  "live-notes":{ id: "live-notes",  testid: "glass-panel-tab-live-notes",  label: "Live Notes",           desc: "AI notes, transcript, insight strip" },
  audio:       { id: "audio",       testid: "glass-panel-tab-audio",       label: "Audio",                desc: "Audio device selection, routing" },
  session:     { id: "session",     testid: "glass-panel-tab-session",     label: "Session",              desc: "Session notes, saved moments" },
  insights:    { id: "insights",    testid: "glass-panel-tab-insights",    label: "Insights",             desc: "Passive context insights" },
  context:     { id: "context",     testid: "glass-panel-tab-context",     label: "Context",              desc: "Screen context, pasted text, URLs" },
  diagnostics: { id: "diagnostics", testid: "glass-panel-tab-diagnostics", label: "Diagnostics",          desc: "App identity, debug info" },
};

// ─── Dock Buttons ──────────────────────────────────────────────────────────────

export const DOCK = {
  openPanel:      { testid: "glass-dock-open-panel",      label: "Open Panel / Close Panel",   desc: "Toggles the side panel" },
  startSession:   { testid: "glass-dock-start-session",   label: "Start Session",              desc: "Visible when no session is active" },
  pauseSession:   { testid: "glass-dock-pause",           label: "Pause",                      desc: "Visible when session is active" },
  resumeSession:  { testid: "glass-dock-resume",          label: "Resume",                     desc: "Visible when session is paused" },
  endSession:     { testid: "glass-dock-end-session",     label: "End",                        desc: "Visible when session is active or paused" },
  stopEverything: { testid: "glass-dock-stop-everything", label: "Stop Everything",            desc: "Always visible — emergency stop all activity" },
  stopListening:  { testid: "glass-dock-stop-listening",  label: "Stop Listening",             desc: "Visible only when listening is active" },
  capture:        { testid: "glass-dock-capture",         label: "Capture",                    desc: "Screenshot capture" },
  showOverlay:    { testid: "glass-dock-show-overlay",    label: "Show Overlay",               desc: "Visible when overlay is hidden" },
  hideOverlay:    { testid: "glass-dock-hide-overlay",    label: "Hide Overlay",               desc: "Visible when overlay is visible" },
  chromeLock:     { testid: "glass-dock-chrome-lock",     label: "🔒 / 🔓",                   desc: "Lock/unlock layout for dragging" },
  orientation:    { testid: "glass-dock-orientation",     label: "↻",                          desc: "Toggle horizontal/vertical dock" },
};

// ─── Command Bar Buttons ───────────────────────────────────────────────────────

export const COMMAND_BAR = {
  input:          { testid: "glass-command-input",         label: "Type here…",         desc: "Main text input" },
  submit:         { testid: "glass-command-submit",        label: "Ask ↑",              desc: "Submit query" },
  listen:         { testid: "glass-command-listen",        label: "Mic / System Audio", desc: "Opens audio source picker" },
  stopListening:  { testid: "glass-command-stop-listening",label: "Stop Listening",     desc: "Stops active listening" },
  translate:      { testid: "glass-command-translate",     label: "Translate",          desc: "Toggle translate mode" },
  lens:           { testid: "glass-command-lens",          label: "Lens",               desc: "Open visual lens panel" },
  cancel:         { testid: "glass-command-cancel",        label: "Cancel",             desc: "Cancel pending AI ask" },
  chromeLock:     { testid: "glass-command-chrome-lock",   label: "🔒",                 desc: "Lock command bar position" },
};

// ─── Setup / Connect Section ───────────────────────────────────────────────────

export const SETUP = {
  // THE main connect button — clicks this to connect Glass to the IIVO server
  connectButton:  {
    testid: "glass-run-setup-check",
    label: "CONNECT IIVO GLASS",
    labelConnecting: "CONNECTING IIVO GLASS…",
    labelConnected: "IIVO GLASS CONNECTED",
    attr: "data-connected",   // "true" when connected, "false" when not
    desc: "Runs setup check: device scan + server check + screen capture probe. NO audio hardware needed just for this.",
  },

  // Status rows — each has a severity dot (ok / warning / error)
  rows: {
    server:         { testid: "glass-setup-row-server",          label: "Server",           desc: "IIVO server at localhost:3001" },
    screenRecording:{ testid: "glass-setup-row-screenRecording", label: "Screen Recording", desc: "macOS Screen Recording permission" },
    windowCapture:  { testid: "glass-setup-row-windowCapture",   label: "Window Capture",   desc: "CGWindow capture ability" },
    microphone:     { testid: "glass-setup-row-microphone",      label: "Microphone",       desc: "macOS Microphone permission" },
    stt:            { testid: "glass-setup-row-stt",             label: "STT",              desc: "Speech-to-text provider status" },
    vision:         { testid: "glass-setup-row-vision",          label: "Vision",           desc: "Visual ask / screenshot AI status" },
  },

  // Action buttons on rows
  actions: {
    runCaptureCheck: { testid: "glass-run-capture-diagnostics", label: "Run Capture Diagnostics" },
  },
};

// ─── Copilot / Modes Panel ─────────────────────────────────────────────────────

export const MODES = {
  // Mode cards — visible in the copilot tab
  cards: {
    listen:    { testid: "glass-mode-card-listen",    label: "Listen",    desc: "Listen mode — system audio or mic capture + AI notes" },
    meetings:  { testid: "glass-mode-card-meetings",  label: "Meetings",  desc: "Meeting copilot — proactive suggestions" },
    translate: { testid: "glass-mode-card-translate", label: "Translate", desc: "Live translate captions" },
  },

  // Quick tools below mode cards
  quickTools: {
    voice:     { testid: "glass-mode-voice",             label: "Voice",    desc: "Voice ask mode" },
    translate: { testid: "glass-quick-tool-translate",   label: "Translate",desc: "Quick translate toggle" },
  },

  // After clicking Listen card — audio source choice
  meetingSource: {
    mic:       { testid: "glass-meeting-source-mic",    label: "Microphone",    desc: "Use mic for listen mode" },
    system:    { testid: "glass-meeting-source-system", label: "System Audio",  desc: "Use system audio for listen mode — needs BlackHole/virtual device" },
  },

  stopAll:     { testid: "glass-mode-stop-everything",  label: "Stop Everything", desc: "Stop all active modes" },
};

// ─── Live Notes Tab ────────────────────────────────────────────────────────────

export const LIVE_NOTES = {
  container:    { testid: "glass-live-notes",              desc: "Live notes root element" },
  insightStrip: { testid: "glass-listen-insight-strip",    desc: "Gold banner — shows latest AI insight" },
  insightToggle:{ testid: "glass-listen-insight-toggle",   desc: "Expand/collapse insight strip" },
  statusPill:   { testid: "glass-live-notes-status",       desc: "Shows: warming-up / building / ai-enhanced" },
  topicLine:    { testid: "glass-live-notes-topic",        desc: "Current detected topic" },
  tabNotes:     { testid: "glass-live-notes-tab-notes",    desc: "Notes tab in live notes" },
  tabTranscript:{ testid: "glass-live-notes-tab-transcript",desc: "Transcript tab in live notes" },

  // States
  states: {
    empty:        { testid: "glass-live-notes-empty",          desc: "No session active" },
    noSession:    { testid: "glass-live-notes-no-session",     desc: "Not in a listen session" },
    warmingUp:    { testid: "glass-live-notes-warming-up",     desc: "Listening but not enough audio yet" },
    building:     { testid: "glass-live-notes-building",       desc: "Local notes building, AI not yet fired" },
    aiEnhanced:   { testid: "glass-live-notes-ai-enhanced",    desc: "AI notes are live — ideal state" },
    micOff:       { testid: "glass-live-notes-mic-off",        desc: "Mic/audio is off" },
    wrongSession: { testid: "glass-live-notes-wrong-session-type", desc: "Session type doesn't support notes" },
  },
};

// ─── Full Sequential Navigation Map ───────────────────────────────────────────
// What to click and check, in order, to do a full Glass health inspection.

export const INSPECTION_SEQUENCE = [
  {
    step: 1,
    action: "OPEN_PANEL",
    testid: DOCK.openPanel.testid,
    desc: "Click 'Open Panel' in the dock to reveal the Glass side panel",
    verify: '[data-testid="glass-panel"]',
  },
  {
    step: 2,
    action: "GO_TO_SETUP",
    testid: SETUP.connectButton.testid,
    tabTestid: TABS.setup.testid,
    desc: "Navigate to Setup tab",
    verify: '[data-testid="glass-panel-setup"]',
  },
  {
    step: 3,
    action: "CONNECT",
    testid: SETUP.connectButton.testid,
    desc: "Click CONNECT IIVO GLASS — runs setup check. No audio hardware needed.",
    verify: `[data-testid="${SETUP.connectButton.testid}"]`,
    pollAttr: "data-connected",
    pollValue: "true",
    timeoutMs: 15_000,
    softFail: true, // OK if server is offline — just report it
  },
  {
    step: 4,
    action: "CHECK_STATUS_ROWS",
    desc: "Read each setup row severity to detect any red/error states",
    rows: Object.values(SETUP.rows),
  },
  {
    step: 5,
    action: "GO_TO_COPILOT",
    tabTestid: TABS.copilot.testid,
    desc: "Navigate to Copilot tab — verify mode cards are present",
    verify: '[data-testid="glass-mode-cards"]',
  },
  {
    step: 6,
    action: "VERIFY_MODE_CARDS",
    desc: "Check that Listen, Meetings, Translate mode cards are all visible",
    cards: Object.values(MODES.cards),
  },
  {
    step: 7,
    action: "GO_TO_LIVE_NOTES",
    tabTestid: TABS["live-notes"].testid,
    desc: "Navigate to Live Notes tab — verify it renders without error",
    verify: '[data-testid="glass-live-notes"]',
  },
  {
    step: 8,
    action: "CHECK_LIVE_NOTES_STATE",
    desc: "Detect which live-notes state is showing (empty / warming-up / ai-enhanced / error)",
    states: Object.values(LIVE_NOTES.states),
  },
  {
    step: 9,
    action: "GO_TO_DIAGNOSTICS",
    tabTestid: TABS.diagnostics.testid,
    desc: "Navigate to Diagnostics tab — verify app identity block loads",
    verify: '[data-testid="glass-app-identity"]',
  },
  {
    step: 10,
    action: "CLOSE_PANEL",
    testid: DOCK.openPanel.testid,
    desc: "Close the panel — verify panel hides",
  },
];

// ─── Helper exports ────────────────────────────────────────────────────────────

export function selector(testid) {
  return `[data-testid="${testid}"]`;
}

export function getConnectButton() {
  return selector(SETUP.connectButton.testid);
}

export function getTabButton(tabId) {
  const tab = TABS[tabId];
  if (!tab) throw new Error(`Unknown tab: ${tabId}. Valid: ${Object.keys(TABS).join(", ")}`);
  return selector(tab.testid);
}

export function getModeCard(mode) {
  const card = MODES.cards[mode];
  if (!card) throw new Error(`Unknown mode card: ${mode}`);
  return selector(card.testid);
}

export function getDockButton(name) {
  const btn = DOCK[name];
  if (!btn) throw new Error(`Unknown dock button: ${name}`);
  return selector(btn.testid);
}

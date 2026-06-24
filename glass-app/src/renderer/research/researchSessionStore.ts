import type { LineType } from "./phaseContent";

export type ResearchScreen = "intro" | "torrent" | "deliver";

export type StoredTorrentLine = { text: string; type: LineType };

export type StoredRawReport = {
  text: string;
  savedPath: string;
  htmlBlock?: string;
};

/** Serializable snapshot — persisted to localStorage and restored on reopen. */
export type ResearchSessionSnapshot = {
  id: string;
  title: string;
  question: string;
  screen: ResearchScreen;
  inputText: string;
  activeQ: string;
  phase: number;
  chip: string;
  status: string;
  zones: [string, string, string];
  counting: boolean;
  countdown: number;
  introOut: boolean;
  leftLines: StoredTorrentLine[];
  midLines: StoredTorrentLine[];
  rightLines: StoredTorrentLine[];
  phase5: unknown | null;
  rawReport: StoredRawReport | null;
  running: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ResearchSessionStore = {
  sessions: ResearchSessionSnapshot[];
  activeSessionId: string;
  sidebarOpen: boolean;
};

const SESSIONS_KEY = "glass-research-sessions-v1";
const UI_KEY = "glass-research-ui-v1";
const MAX_SESSIONS = 24;

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `research-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sessionTitleFromQuestion(question: string): string {
  const q = question.trim();
  if (!q) return "New research";
  return q.length > 56 ? `${q.slice(0, 55)}…` : q;
}

export function createEmptySession(question = ""): ResearchSessionSnapshot {
  const now = Date.now();
  const trimmed = question.trim();
  return {
    id: createSessionId(),
    title: sessionTitleFromQuestion(trimmed),
    question: trimmed,
    screen: "intro",
    inputText: trimmed,
    activeQ: "",
    phase: 0,
    chip: "Aletheia",
    status: "",
    zones: ["Sources", "Analysis", "Output"],
    counting: false,
    countdown: 3,
    introOut: false,
    leftLines: [],
    midLines: [],
    rightLines: [],
    phase5: null,
    rawReport: null,
    running: false,
    createdAt: now,
    updatedAt: now,
  };
}

function readUiPrefs(): { activeSessionId: string; sidebarOpen: boolean } {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { activeSessionId: "", sidebarOpen: false };
    const parsed = JSON.parse(raw) as { activeSessionId?: string; sidebarOpen?: boolean };
    return {
      activeSessionId: typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : "",
      sidebarOpen: parsed.sidebarOpen === true,
    };
  } catch {
    return { activeSessionId: "", sidebarOpen: false };
  }
}

function writeUiPrefs(activeSessionId: string, sidebarOpen: boolean): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ activeSessionId, sidebarOpen }));
  } catch {
    /* ignore */
  }
}

export function loadResearchSessionStore(): ResearchSessionStore {
  const ui = readUiPrefs();
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) {
      const session = createEmptySession();
      return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
    }
    const parsed = JSON.parse(raw) as ResearchSessionSnapshot[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const session = createEmptySession();
      return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
    }
    const sessions = parsed.slice(0, MAX_SESSIONS);
    const activeSessionId =
      sessions.some((s) => s.id === ui.activeSessionId) ? ui.activeSessionId : sessions[0]!.id;
    return { sessions, activeSessionId, sidebarOpen: ui.sidebarOpen };
  } catch {
    const session = createEmptySession();
    return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
  }
}

export function persistResearchSessionStore(store: ResearchSessionStore): void {
  const sorted = [...store.sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  const activeSessionId = sorted.some((s) => s.id === store.activeSessionId)
    ? store.activeSessionId
    : sorted[0]?.id ?? store.activeSessionId;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sorted));
  } catch {
    /* ignore */
  }
  writeUiPrefs(activeSessionId, store.sidebarOpen);
}

export function upsertSessionInStore(
  store: ResearchSessionStore,
  session: ResearchSessionSnapshot,
): ResearchSessionStore {
  const sessions = store.sessions.filter((s) => s.id !== session.id);
  sessions.unshift({ ...session, updatedAt: Date.now() });
  return {
    ...store,
    sessions: sessions.slice(0, MAX_SESSIONS),
    activeSessionId: session.id,
  };
}

export function deleteSessionFromStore(store: ResearchSessionStore, sessionId: string): ResearchSessionStore {
  if (store.sessions.length <= 1) {
    const fresh = createEmptySession();
    return { ...store, sessions: [fresh], activeSessionId: fresh.id };
  }
  const sessions = store.sessions.filter((s) => s.id !== sessionId);
  const activeSessionId =
    store.activeSessionId === sessionId ? sessions[0]!.id : store.activeSessionId;
  return { ...store, sessions, activeSessionId };
}

export function sessionStatusLabel(session: ResearchSessionSnapshot): string {
  if (session.running) return "Running";
  if (session.screen === "deliver") return "Complete";
  if (session.screen === "torrent") return "In progress";
  if (session.activeQ.trim()) return "Draft";
  return "New";
}

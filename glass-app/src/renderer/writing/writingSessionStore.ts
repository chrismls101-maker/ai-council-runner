import type { LineType } from "../research/phaseContent";

export type WritingScreen = "intro" | "stream" | "deliver";

export type WritingFormat = "email" | "blog" | "essay" | "product" | "social" | "memo";
export type WritingTone = "professional" | "casual" | "persuasive" | "technical";

export type StoredTorrentLine = { text: string; type: LineType };

export type WritingSessionSnapshot = {
  id: string;
  title: string;
  brief: string;
  format: WritingFormat;
  tone: WritingTone;
  screen: WritingScreen;
  inputText: string;
  activeBrief: string;
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
  documentText: string;
  savedPath: string;
  running: boolean;
  createdAt: number;
  updatedAt: number;
};

export type WritingSessionStore = {
  sessions: WritingSessionSnapshot[];
  activeSessionId: string;
  sidebarOpen: boolean;
};

const SESSIONS_KEY = "glass-writing-sessions-v1";
const UI_KEY = "glass-writing-ui-v1";
const MAX_SESSIONS = 24;

export const WRITING_FORMAT_LABELS: Record<WritingFormat, string> = {
  email: "Email",
  blog: "Blog post",
  essay: "Essay",
  product: "Product copy",
  social: "Social post",
  memo: "Memo / doc",
};

export const WRITING_TONE_LABELS: Record<WritingTone, string> = {
  professional: "Professional",
  casual: "Casual",
  persuasive: "Persuasive",
  technical: "Technical",
};

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `writing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sessionTitleFromBrief(brief: string): string {
  const q = brief.trim();
  if (!q) return "New draft";
  return q.length > 56 ? `${q.slice(0, 55)}…` : q;
}

export function createEmptyWritingSession(brief = ""): WritingSessionSnapshot {
  const now = Date.now();
  const trimmed = brief.trim();
  return {
    id: createSessionId(),
    title: sessionTitleFromBrief(trimmed),
    brief: trimmed,
    format: "blog",
    tone: "professional",
    screen: "intro",
    inputText: trimmed,
    activeBrief: "",
    phase: 0,
    chip: "Writing Agent",
    status: "",
    zones: ["References", "Craft", "Draft"],
    counting: false,
    countdown: 3,
    introOut: false,
    leftLines: [],
    midLines: [],
    rightLines: [],
    documentText: "",
    savedPath: "",
    running: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildWritingAgentPrompt(
  brief: string,
  format: WritingFormat,
  tone: WritingTone,
): string {
  return [
    `Write a ${WRITING_FORMAT_LABELS[format].toLowerCase()} in a ${WRITING_TONE_LABELS[tone].toLowerCase()} tone.`,
    "",
    brief.trim(),
  ].join("\n");
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

export function loadWritingSessionStore(): WritingSessionStore {
  const ui = readUiPrefs();
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) {
      const session = createEmptyWritingSession();
      return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
    }
    const parsed = JSON.parse(raw) as WritingSessionSnapshot[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const session = createEmptyWritingSession();
      return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
    }
    const sessions = parsed.slice(0, MAX_SESSIONS);
    const activeSessionId =
      sessions.some((s) => s.id === ui.activeSessionId) ? ui.activeSessionId : sessions[0]!.id;
    return { sessions, activeSessionId, sidebarOpen: ui.sidebarOpen };
  } catch {
    const session = createEmptyWritingSession();
    return { sessions: [session], activeSessionId: session.id, sidebarOpen: ui.sidebarOpen };
  }
}

export function persistWritingSessionStore(store: WritingSessionStore): void {
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

export function upsertWritingSession(
  store: WritingSessionStore,
  session: WritingSessionSnapshot,
): WritingSessionStore {
  const sessions = store.sessions.filter((s) => s.id !== session.id);
  sessions.unshift({ ...session, updatedAt: Date.now() });
  return {
    ...store,
    sessions: sessions.slice(0, MAX_SESSIONS),
    activeSessionId: session.id,
  };
}

export function deleteWritingSession(
  store: WritingSessionStore,
  sessionId: string,
): WritingSessionStore {
  if (store.sessions.length <= 1) {
    const fresh = createEmptyWritingSession();
    return { ...store, sessions: [fresh], activeSessionId: fresh.id };
  }
  const sessions = store.sessions.filter((s) => s.id !== sessionId);
  const activeSessionId =
    store.activeSessionId === sessionId ? sessions[0]!.id : store.activeSessionId;
  return { ...store, sessions, activeSessionId };
}

export function writingSessionStatusLabel(session: WritingSessionSnapshot): string {
  if (session.running) return "Writing";
  if (session.screen === "deliver") return "Complete";
  if (session.screen === "stream") return "In progress";
  if (session.activeBrief.trim()) return "Draft";
  return "New";
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function readingTimeMinutes(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 220));
}

/**
 * In-memory session store for IIVO Glass Session Intelligence.
 *
 * Pure data structure (no fs/electron) so it is unit-testable. The main process
 * owns one instance and persists it via serialize()/hydrate().
 */

import type {
  GlassSession,
  GlassSessionEvent,
  GlassSessionEventKind,
  GlassSessionImportance,
  GlassSessionInsight,
  GlassInsightType,
} from "./sessionTypes.ts";

export type IdFactory = () => string;
export type Clock = () => string;

let fallbackCounter = 0;
const defaultIdFactory: IdFactory = () => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  fallbackCounter += 1;
  return `glass-${Date.now()}-${fallbackCounter}`;
};

const defaultClock: Clock = () => new Date().toISOString();

export interface SessionStoreDeps {
  idFactory?: IdFactory;
  clock?: Clock;
}

export interface AddEventInput {
  kind: GlassSessionEventKind;
  title: string;
  text?: string;
  sourceApp?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  screenshotPath?: string;
  screenshotDataUrl?: string;
  tags?: string[];
  importance?: GlassSessionImportance;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface AddInsightInput {
  type: GlassInsightType;
  title: string;
  text: string;
  sourceEventIds?: string[];
  importance?: GlassSessionImportance;
  accepted?: boolean;
  timestamp?: string;
}

/** Fill in any missing fields on a (possibly old) persisted session. */
function migrateSession(raw: Partial<GlassSession>, clock: Clock): GlassSession {
  const now = clock();
  return {
    id: raw.id ?? `glass-${Date.now()}`,
    title: raw.title ?? "Untitled session",
    status: raw.status ?? "ended",
    startedAt: raw.startedAt ?? now,
    endedAt: raw.endedAt,
    pausedAt: raw.pausedAt,
    updatedAt: raw.updatedAt ?? raw.startedAt ?? now,
    events: Array.isArray(raw.events) ? raw.events : [],
    insights: Array.isArray(raw.insights) ? raw.insights : [],
    summary: raw.summary,
    copilot: raw.copilot,
  };
}

export class GlassSessionStore {
  private sessions: GlassSession[];
  private currentId: string | null = null;
  private readonly idFactory: IdFactory;
  private readonly clock: Clock;

  constructor(deps: SessionStoreDeps = {}, initial: GlassSession[] = []) {
    this.idFactory = deps.idFactory ?? defaultIdFactory;
    this.clock = deps.clock ?? defaultClock;
    this.sessions = initial.map((s) => migrateSession(s, this.clock));
  }

  /** Sessions, most-recently-updated first. */
  list(): GlassSession[] {
    return [...this.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  current(): GlassSession | null {
    if (!this.currentId) return null;
    return this.sessions.find((s) => s.id === this.currentId) ?? null;
  }

  private touch(session: GlassSession): void {
    session.updatedAt = this.clock();
  }

  createSession(title?: string): GlassSession {
    const now = this.clock();
    const session: GlassSession = {
      id: this.idFactory(),
      title: title?.trim() || `Session ${new Date(now).toLocaleString()}`,
      status: "idle",
      startedAt: now,
      updatedAt: now,
      events: [],
      insights: [],
    };
    this.sessions.push(session);
    this.currentId = session.id;
    return session;
  }

  /** Create-if-needed and activate the current session, recording session_started. */
  startSession(title?: string): GlassSession {
    let session = this.current();
    if (!session || session.status === "ended") {
      session = this.createSession(title);
    } else if (title?.trim()) {
      session.title = title.trim();
    }
    session.status = "active";
    session.startedAt = session.startedAt || this.clock();
    this.touch(session);
    this.addEvent({ kind: "session_started", title: `Session started: ${session.title}` });
    return session;
  }

  pauseSession(): GlassSession | null {
    const session = this.current();
    if (!session || session.status !== "active") return session;
    session.status = "paused";
    session.pausedAt = this.clock();
    this.addEvent({ kind: "session_paused", title: "Session paused" });
    this.touch(session);
    return session;
  }

  resumeSession(): GlassSession | null {
    const session = this.current();
    if (!session || session.status !== "paused") return session;
    session.status = "active";
    session.pausedAt = undefined;
    this.addEvent({ kind: "session_resumed", title: "Session resumed" });
    this.touch(session);
    return session;
  }

  endSession(): GlassSession | null {
    const session = this.current();
    if (!session || session.status === "ended") return session;
    this.addEvent({ kind: "session_ended", title: "Session ended" });
    session.status = "ended";
    session.endedAt = this.clock();
    this.touch(session);
    return session;
  }

  addEvent(input: AddEventInput): GlassSessionEvent | null {
    const session = this.current();
    if (!session || session.status === "ended") return null;
    const event: GlassSessionEvent = {
      id: this.idFactory(),
      sessionId: session.id,
      kind: input.kind,
      timestamp: input.timestamp ?? this.clock(),
      title: input.title,
      text: input.text,
      sourceApp: input.sourceApp,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      screenshotPath: input.screenshotPath,
      screenshotDataUrl: input.screenshotDataUrl,
      tags: input.tags,
      importance: input.importance,
      metadata: input.metadata,
    };
    session.events.push(event);
    this.touch(session);
    return event;
  }

  addInsight(input: AddInsightInput): GlassSessionInsight | null {
    const session = this.current();
    if (!session) return null;
    const insight: GlassSessionInsight = {
      id: this.idFactory(),
      sessionId: session.id,
      timestamp: input.timestamp ?? this.clock(),
      type: input.type,
      title: input.title,
      text: input.text,
      sourceEventIds: input.sourceEventIds ?? [],
      importance: input.importance ?? "medium",
      accepted: input.accepted,
    };
    session.insights.push(insight);
    this.touch(session);
    return insight;
  }

  updateInsight(
    id: string,
    patch: Partial<Pick<GlassSessionInsight, "accepted" | "title" | "text" | "importance">>,
  ): GlassSessionInsight | null {
    const session = this.current();
    const insight = session?.insights.find((i) => i.id === id);
    if (!session || !insight) return null;
    Object.assign(insight, patch);
    this.touch(session);
    return insight;
  }

  deleteEvent(id: string): boolean {
    const session = this.current();
    if (!session) return false;
    const before = session.events.length;
    session.events = session.events.filter((e) => e.id !== id);
    const changed = session.events.length < before;
    if (changed) this.touch(session);
    return changed;
  }

  deleteInsight(id: string): boolean {
    const session = this.current();
    if (!session) return false;
    const before = session.insights.length;
    session.insights = session.insights.filter((i) => i.id !== id);
    const changed = session.insights.length < before;
    if (changed) this.touch(session);
    return changed;
  }

  /** Clears the current session's events + insights + summary (keeps the session). */
  clearSession(): GlassSession | null {
    const session = this.current();
    if (!session) return null;
    session.events = [];
    session.insights = [];
    session.summary = undefined;
    this.touch(session);
    return session;
  }

  setSummary(summary: string): GlassSession | null {
    const session = this.current();
    if (!session) return null;
    session.summary = summary;
    this.touch(session);
    return session;
  }

  /** Persist Session Copilot data (insights / interventions / debrief) on the current session. */
  setCopilotData(data: import("./copilotTypes.ts").GlassCopilotSessionData): GlassSession | null {
    const session = this.current();
    if (!session) return null;
    session.copilot = data;
    this.touch(session);
    return session;
  }

  getSession(id: string): GlassSession | null {
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  serialize(): string {
    return JSON.stringify({ sessions: this.list(), currentId: this.currentId });
  }

  static hydrate(json: string, deps: SessionStoreDeps = {}): GlassSessionStore {
    try {
      const parsed = JSON.parse(json) as { sessions?: Partial<GlassSession>[]; currentId?: string | null };
      const store = new GlassSessionStore(deps, (parsed.sessions ?? []) as GlassSession[]);
      // Only restore currentId if it still exists and is not ended.
      const cur = parsed.currentId
        ? store.sessions.find((s) => s.id === parsed.currentId)
        : null;
      if (cur && cur.status !== "ended") {
        // Session was interrupted (Glass quit mid-session). Mark it ended so it
        // doesn't show as "active" on the next launch, but keep it in history.
        cur.status = "ended";
      }
      store.currentId = null;
      return store;
    } catch {
      return new GlassSessionStore(deps);
    }
  }
}

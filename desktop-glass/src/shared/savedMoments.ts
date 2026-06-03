/**
 * In-memory saved-moments store for IIVO Glass.
 *
 * Pure data structure (no fs/electron) so it is trivially unit-testable. The
 * main process owns one instance and persists it via serialize()/deserialize().
 */

import type { GlassMomentKind, SavedMoment } from "./types.ts";

export interface AddMomentInput {
  kind: GlassMomentKind;
  note: string;
  sourceTitle?: string;
  contextId?: string;
  sentToIivo?: boolean;
  createdAt?: string;
}

export type IdFactory = () => string;

let fallbackCounter = 0;
const defaultIdFactory: IdFactory = () => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // fall through to counter-based id
  }
  fallbackCounter += 1;
  return `moment-${Date.now()}-${fallbackCounter}`;
};

export class SavedMomentsStore {
  private moments: SavedMoment[];
  private readonly idFactory: IdFactory;

  constructor(initial: SavedMoment[] = [], idFactory: IdFactory = defaultIdFactory) {
    this.moments = [...initial];
    this.idFactory = idFactory;
  }

  /** Newest first. */
  list(): SavedMoment[] {
    return [...this.moments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  add(input: AddMomentInput): SavedMoment {
    const moment: SavedMoment = {
      id: this.idFactory(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      kind: input.kind,
      note: input.note.trim(),
      sourceTitle: input.sourceTitle,
      contextId: input.contextId,
      sentToIivo: input.sentToIivo ?? false,
    };
    this.moments.push(moment);
    return moment;
  }

  remove(id: string): boolean {
    const before = this.moments.length;
    this.moments = this.moments.filter((m) => m.id !== id);
    return this.moments.length < before;
  }

  markSent(id: string, contextId: string): SavedMoment | null {
    const moment = this.moments.find((m) => m.id === id);
    if (!moment) return null;
    moment.sentToIivo = true;
    moment.contextId = contextId;
    return moment;
  }

  clear(): void {
    this.moments = [];
  }

  size(): number {
    return this.moments.length;
  }

  serialize(): string {
    return JSON.stringify({ moments: this.moments });
  }

  static deserialize(json: string, idFactory: IdFactory = defaultIdFactory): SavedMomentsStore {
    try {
      const parsed = JSON.parse(json) as { moments?: SavedMoment[] };
      const moments = Array.isArray(parsed.moments) ? parsed.moments : [];
      return new SavedMomentsStore(moments, idFactory);
    } catch {
      return new SavedMomentsStore([], idFactory);
    }
  }
}

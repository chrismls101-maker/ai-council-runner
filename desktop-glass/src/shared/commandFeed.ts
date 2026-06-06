/**
 * Command feed entries surfaced as floating overlay response cards.
 * Shared, no Electron imports.
 */

export type GlassCommandFeedKind =
  | "command"
  | "looking"
  | "thinking"
  | "response"
  | "capture"
  | "transcript"
  | "error"
  | "moment";

export interface GlassCommandFeedItem {
  id: string;
  kind: GlassCommandFeedKind;
  title: string;
  body: string;
  at: string;
  pinned?: boolean;
  runId?: string;
  contextId?: string;
  prompt?: string;
  fullBody?: string;
  /** Listen mode — ties card to a moment; only one listen card visible at a time. */
  listenMomentId?: string;
}

export const MAX_COMMAND_FEED_ITEMS = 12;

export const COMMAND_FEED_TITLES: Record<GlassCommandFeedKind, string> = {
  command: "You asked",
  looking: "IIVO is looking",
  thinking: "IIVO is thinking",
  response: "IIVO",
  capture: "Capture",
  transcript: "Transcript",
  error: "Warning",
  moment: "Saved moment",
};

let feedSeq = 0;

export function createCommandFeedItem(
  kind: GlassCommandFeedKind,
  body: string,
  opts: {
    title?: string;
    pinned?: boolean;
    at?: string;
    runId?: string;
    contextId?: string;
    prompt?: string;
    fullBody?: string;
    listenMomentId?: string;
  } = {},
): GlassCommandFeedItem {
  feedSeq += 1;
  return {
    id: `feed-${Date.now()}-${feedSeq}`,
    kind,
    title: opts.title ?? COMMAND_FEED_TITLES[kind],
    body,
    at: opts.at ?? new Date().toISOString(),
    pinned: opts.pinned,
    runId: opts.runId,
    contextId: opts.contextId,
    prompt: opts.prompt,
    fullBody: opts.fullBody,
    listenMomentId: opts.listenMomentId,
  };
}

export function appendCommandFeedItem(
  feed: GlassCommandFeedItem[],
  item: GlassCommandFeedItem,
  max = MAX_COMMAND_FEED_ITEMS,
): GlassCommandFeedItem[] {
  return [...feed, item].slice(-max);
}

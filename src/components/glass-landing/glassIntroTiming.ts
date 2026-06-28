/** Shared intro choreography timings — phase machine + component animations stay in sync. */

import {
  INTRO_IDE_COMPOSER_PROMPT,
  INTRO_IDE_STREAM_ITEMS,
} from "./glassIntroIdeScript";

export const INTRO_CMD_TYPE_MS = 34;
export const INTRO_CMD_RESPONSE_TYPE_MS = 17;
export const INTRO_IDE_COMPOSE_TYPE_MS = 40;
export const INTRO_IDE_STREAM_STEP_MS = 540;
export const INTRO_IDE_ANSWER_TYPE_MS = 20;

export const INTRO_HOLD = {
  afterCommandType: 520,
  afterResponse: 720,
  afterIdeSubmit: 400,
  afterStream: 580,
  cursorHop: 360,
  windowReveal: 480,
} as const;

export function introTypingPhaseMs(text: string, charMs: number, hold: number): number {
  return text.length * charMs + hold;
}

export function introIdeComposePhaseMs(): number {
  return (
    introTypingPhaseMs(INTRO_IDE_COMPOSER_PROMPT, INTRO_IDE_COMPOSE_TYPE_MS, INTRO_HOLD.afterCommandType) +
    INTRO_HOLD.afterIdeSubmit
  );
}

export function introIdeStreamPhaseMs(): number {
  const liveItem = INTRO_IDE_STREAM_ITEMS.find((item) => item.kind === "text" && item.live);
  const liveMs =
    liveItem && liveItem.kind === "text" ? liveItem.text.length * INTRO_IDE_ANSWER_TYPE_MS : 0;
  return INTRO_IDE_STREAM_ITEMS.length * INTRO_IDE_STREAM_STEP_MS + liveMs + INTRO_HOLD.afterStream;
}

/** Preview zoom CSS animation duration — keep phase matched. */
export const INTRO_IDE_ZOOM_MS = 3600;

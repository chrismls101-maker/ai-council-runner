import { GLASS_BOOT_DURATION_MS } from "./bootTiming.ts";

/** Boot ambience runs for the full splash (synced with energy bar). */
export const GLASS_BOOT_SOUND_DURATION_MS = GLASS_BOOT_DURATION_MS;

/** Fade boot bed under two-note confirmation (overlap). */
export const GLASS_BOOT_SOUND_FADE_MS = 620;

/** Off until boot/finish cue is finalized. */
export const GLASS_BOOT_SOUND_ENABLED = false;

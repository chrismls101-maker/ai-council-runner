/** Pause after a TTS line finishes before the next beat. */
export const SORTING_HAT_PAUSE_AFTER_LINE_MS = 320;

/** Shorter beat before the name question (follows Glass intro). */
export const SORTING_HAT_PAUSE_BEFORE_NAME_MS = 180;

/** Extra beat before showing the input row after a spoken prompt. */
export const SORTING_HAT_PAUSE_BEFORE_INPUT_MS = 220;

/** Gentle beat after boot splash before first intro line — avoids voice shock. */
export const SORTING_HAT_POST_MANIFEST_PAUSE_MS = 1_400;

/** After language picker — boot already ran; brief iris beat then speak. */
export const SORTING_HAT_AFTER_LANGUAGE_PICKER_PAUSE_MS = 320;

/** Substrate → aperture manifestation when Sorting Hat opens post-picker. */
export const SORTING_HAT_POST_PICKER_MANIFEST_MS = 650;

/** Max wait if TTS never arrives (per line). */
export const SORTING_HAT_TTS_GUARD_MS = 20_000;

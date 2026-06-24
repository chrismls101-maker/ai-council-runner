/** Persisted Glass IDE panel split sizes. */

export interface GlassIdeLayoutSettings {
  /** File tree column width in pixels. */
  glassIdeTreeWidthPx?: number;
  /** AI stream column width in pixels. */
  glassIdeStreamWidthPx?: number;
  /** Editor area height ratio within center column (0.35–0.85). */
  glassIdeEditorSplitRatio?: number;
}

export const DEFAULT_GLASS_IDE_TREE_WIDTH_PX = 220;
export const DEFAULT_GLASS_IDE_STREAM_WIDTH_PX = 380;
/** Editor share when the IDE terminal is expanded — leaves ~38% for terminal + chrome. */
export const DEFAULT_GLASS_IDE_EDITOR_SPLIT_RATIO = 0.62;
/** Legacy default before terminal collapse strip — clamped on expand if still persisted. */
export const LEGACY_GLASS_IDE_EDITOR_SPLIT_RATIO = 0.72;

export const GLASS_IDE_TREE_WIDTH_MIN = 140;
export const GLASS_IDE_TREE_WIDTH_MAX = 480;
export const GLASS_IDE_STREAM_WIDTH_MIN = 280;
export const GLASS_IDE_STREAM_WIDTH_MAX = 720;
export const GLASS_IDE_EDITOR_SPLIT_MIN = 0.35;
export const GLASS_IDE_EDITOR_SPLIT_MAX = 0.85;

/** Collapsed IDE terminal strip — tab bar + full NL shell bar (mic, arrow, input). */
export const GLASS_IDE_TERMINAL_COLLAPSED_CHROME_PX = 158;
/** Drag terminal below this height (px) → snap to collapsed chrome strip. */
export const GLASS_IDE_TERMINAL_COLLAPSE_SNAP_PX = 184;
/** Editor ratio band when expanding IDE terminal (terminal ~35–38% of center column). */
export const GLASS_IDE_TERMINAL_EXPANDED_EDITOR_RATIO_MIN = 0.62;
export const GLASS_IDE_TERMINAL_EXPANDED_EDITOR_RATIO_MAX = 0.65;
/** Slide-up animation — keep in sync with `.gide-ide-terminal-reveal` in CSS. */
export const GLASS_IDE_TERMINAL_REVEAL_MS = 450;

/** Editor ratio used when expanding the IDE terminal from the collapsed strip. */
export function defaultGlassIdeTerminalExpandedEditorRatio(): number {
  return GLASS_IDE_TERMINAL_EXPANDED_EDITOR_RATIO_MIN;
}

/** Keep expand height in a sensible band — not chrome-only, not full-column. */
export function clampGlassIdeEditorRatioForTerminalExpand(editorRatio: number): number {
  return clampGlassIdeEditorSplitRatio(
    Math.min(
      GLASS_IDE_TERMINAL_EXPANDED_EDITOR_RATIO_MAX,
      Math.max(GLASS_IDE_TERMINAL_EXPANDED_EDITOR_RATIO_MIN, editorRatio),
    ),
  );
}

export function clampGlassIdeTreeWidthPx(value: number): number {
  return Math.min(
    GLASS_IDE_TREE_WIDTH_MAX,
    Math.max(GLASS_IDE_TREE_WIDTH_MIN, Math.round(value)),
  );
}

export function clampGlassIdeStreamWidthPx(value: number): number {
  return Math.min(
    GLASS_IDE_STREAM_WIDTH_MAX,
    Math.max(GLASS_IDE_STREAM_WIDTH_MIN, Math.round(value)),
  );
}

export function clampGlassIdeEditorSplitRatio(value: number): number {
  return Math.min(
    GLASS_IDE_EDITOR_SPLIT_MAX,
    Math.max(GLASS_IDE_EDITOR_SPLIT_MIN, Math.round(value * 1000) / 1000),
  );
}

export function resolveGlassIdeLayout(
  settings: GlassIdeLayoutSettings | undefined,
): Required<GlassIdeLayoutSettings> {
  return {
    glassIdeTreeWidthPx: clampGlassIdeTreeWidthPx(
      settings?.glassIdeTreeWidthPx ?? DEFAULT_GLASS_IDE_TREE_WIDTH_PX,
    ),
    glassIdeStreamWidthPx: clampGlassIdeStreamWidthPx(
      settings?.glassIdeStreamWidthPx ?? DEFAULT_GLASS_IDE_STREAM_WIDTH_PX,
    ),
    glassIdeEditorSplitRatio: clampGlassIdeEditorSplitRatio(
      settings?.glassIdeEditorSplitRatio ?? DEFAULT_GLASS_IDE_EDITOR_SPLIT_RATIO,
    ),
  };
}

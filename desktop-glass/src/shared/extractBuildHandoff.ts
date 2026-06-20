/** Where to send a generated master build prompt. */
export type ExtractBuildTarget = "glass" | "cursor" | "claude";

export interface ExtractBuildTargetOption {
  id: ExtractBuildTarget;
  label: string;
  /** Shown in the build menu — what happens after click. */
  hint: string;
  icon: string;
}

export const EXTRACT_BUILD_TARGETS: ExtractBuildTargetOption[] = [
  {
    id: "glass",
    label: "Build in Glass",
    hint: "Prefills chat — press Enter",
    icon: "◇",
  },
  {
    id: "cursor",
    label: "Build in Cursor",
    hint: "Opens Composer — allow if macOS asks",
    icon: "⌘",
  },
  {
    id: "claude",
    label: "Build in Claude",
    hint: "Claude app if installed, else browser",
    icon: "✦",
  },
];

export function extractBuildHandoffNotice(target: ExtractBuildTarget): string {
  switch (target) {
    case "glass":
      return "Build prompt ready in Glass — press Enter to send";
    case "cursor":
      return "Build prompt pasted in Cursor — press Enter to send";
    case "claude":
      return "Build prompt pasted in Claude — press Enter to send";
  }
}

export function extractBuildClaudeDesktopNotice(): string {
  return "Build prompt pasted in Claude app — press Enter to send";
}

export function extractBuildClaudeWebNotice(): string {
  return "Build prompt pasted in Claude (browser) — press Enter to send";
}

/** macOS app names used for activation (best-effort). */
export const EXTRACT_BUILD_APP_NAMES: Record<Exclude<ExtractBuildTarget, "glass">, string> = {
  cursor: "Cursor",
  claude: "Claude",
};

/** Claude desktop app bundle id (Claude.app in /Applications). */
export const CLAUDE_DESKTOP_BUNDLE_ID = "com.anthropic.claudefordesktop";

export const CLAUDE_DESKTOP_APP_PATHS = [
  "/Applications/Claude.app",
  "~/Applications/Claude.app",
] as const;

export const EXTRACT_BUILD_CLAUDE_WEB_URL = "https://claude.ai/new";

const VALID_TARGETS = new Set<ExtractBuildTarget>(["glass", "cursor", "claude"]);

export function isExtractBuildTarget(value: unknown): value is ExtractBuildTarget {
  return typeof value === "string" && VALID_TARGETS.has(value as ExtractBuildTarget);
}

/** Shown when macOS blocks keystroke automation (Accessibility permission). */
export const EXTRACT_BUILD_ACCESSIBILITY_HINT =
  "Prompt copied. Enable IIVO Glass under System Settings → Privacy & Security → Accessibility, then try again — or paste manually (⌘V).";

/**
 * What users typically see on first Cursor/Claude handoff (macOS Automation + Accessibility).
 * Not a guarantee — Apple varies wording by OS version.
 */
export const EXTRACT_BUILD_MACOS_PERMISSION_EXPLAIN =
  "macOS may ask to allow IIVO Glass to control Cursor or Claude — tap OK/Allow so Glass can paste your build prompt. The prompt is copied to your clipboard either way.";

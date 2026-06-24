/**
 * Glass Command Palette — item schema (Task #66).
 * Raycast-style ⌘⇧G overlay (GlassCommandPalette). Not the ⌘⇧P Powers Menu.
 * No Electron or React imports — safe for src/shared/.
 */

export type PaletteActionKind =
  | "send-glass-command"
  | "inject-pty"
  | "prefill-command-bar"
  | "copy-to-clipboard"
  | "copy-api-key"
  | "open-builder-tab"
  | "open-terminal"
  | "dismiss";

export interface PaletteAction {
  kind: PaletteActionKind;
  /** Payload by kind:
   *  send-glass-command  → GlassCommand object (import from ipc.ts in consumers)
   *  inject-pty          → string (command to inject)
   *  prefill-command-bar → string
   *  copy-to-clipboard   → string
   *  copy-api-key        → string (key id)
   *  open-builder-tab    → "prompts" | "keys" | "spend" | "extract"
   *  open-terminal       → undefined
   *  dismiss             → undefined
   */
  payload?: unknown;
}

export interface PaletteActionResult {
  ok: boolean;
  keepOpen?: boolean;
  notice?: string;
  error?: string;
}

export interface PaletteLastTerminalBlock {
  command: string;
  output: string;
  exitCode: number | null;
  status: "success" | "error" | "unknown";
}

export interface PaletteContextSignals {
  clipboardText: string;
  activeApp: string;
  lastTerminalBlock: PaletteLastTerminalBlock | null;
  terminalOpen: boolean;
  activePtyId: string | null;
  extractModeActive: boolean;
  hasLastResult: boolean;
}

export interface PaletteQuery {
  query: string;
  context: PaletteContextSignals;
}

export type PaletteContextTag =
  | "terminal"
  | "terminal-error"
  | "terminal-success"
  | "has-clipboard"
  | "clipboard-code"
  | "code-editor"
  | "browser"
  | "extract-active"
  | "always-top"
  | "has-last-result";

export interface PaletteItemBase {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  icon: string;
  badge?: string;
  shortcutHint?: string;
  action: PaletteAction;
  secondaryAction?: PaletteAction;
  score: number;
}

export interface GlassCommandItem extends PaletteItemBase {
  type: "command";
  commandId: string;
  contextTags: PaletteContextTag[];
  keywords: string[];
  useCount: number;
}

export interface TerminalHistoryItem extends PaletteItemBase {
  type: "terminal-history";
  command: string;
  outputPreview: string;
  exitCode: number | null;
  status: "success" | "error" | "unknown";
  finishedAt: number;
  cwd?: string;
  durationLabel?: string;
  ptySessionId: string | null;
}

export interface SavedPromptItem extends PaletteItemBase {
  type: "saved-prompt";
  body: string;
  bodyPreview: string;
  tags: string[];
  lastUsedAt?: number;
}

export interface ApiKeyItem extends PaletteItemBase {
  type: "api-key";
  keyId: string;
  service: string;
  label: string;
  environment: "dev" | "prod" | "any";
  maskedValue: string;
}

export interface ScrollbackResultItem extends PaletteItemBase {
  type: "scrollback-result";
  command: string;
  outputPreview: string;
  exitCode: number | null;
  status: "success" | "error" | "unknown";
  startedAt: number;
  timeLabel: string;
  cwd?: string;
  relevanceScore: number;
  rowId: number;
}

export interface QuickActionItem extends PaletteItemBase {
  type: "quick-action";
  reason: string;
  triggerSignal: PaletteContextTag;
}

export type PaletteItem =
  | GlassCommandItem
  | TerminalHistoryItem
  | SavedPromptItem
  | ApiKeyItem
  | ScrollbackResultItem
  | QuickActionItem;

export type PaletteSectionId =
  | "quick-actions"
  | "commands"
  | "ask-answer"
  | "terminal-commands"
  | "builder"
  | "extract"
  | "clipboard"
  | "terminal-history"
  | "saved-prompts"
  | "api-keys"
  | "scrollback";

export type PaletteCommandRegistrySection =
  | "ask"
  | "terminal"
  | "builder"
  | "extract"
  | "clipboard";

export interface PaletteSection {
  id: PaletteSectionId;
  label: string;
  items: PaletteItem[];
  maxVisible: number;
  order: number;
  loading?: boolean;
}

export interface GlassCommandRegistryEntry {
  commandId: string;
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  shortcutHint?: string;
  section: PaletteCommandRegistrySection;
  contextTags: PaletteContextTag[];
  keywords: string[];
  action: PaletteAction;
  secondaryAction?: PaletteAction;
}

export interface PaletteState {
  open: boolean;
  query: string;
  sections: PaletteSection[];
  focusedIndex: number;
  context: PaletteContextSignals;
  asyncStatus: "idle" | "searching" | "error";
  footerNotice?: string;
}

export type PaletteFrequencyMap = Record<string, number>;

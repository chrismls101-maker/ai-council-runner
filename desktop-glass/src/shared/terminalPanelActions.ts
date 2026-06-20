/** Panel actions dispatched from ⌘⇧P or main → terminal renderer. */
export type GlassTerminalPanelAction =
  | "explain"
  | "vision"
  | "find"
  | "scrollback"
  | "voice"
  | "nl-focus";

export interface GlassTerminalPendingAction {
  action: GlassTerminalPanelAction;
  /** Monotonic counter so repeated actions re-fire. */
  nonce: number;
}

export interface GlassTerminalTab {
  id: string;
}

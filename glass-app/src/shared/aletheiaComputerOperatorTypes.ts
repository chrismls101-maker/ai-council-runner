/**
 * Shared types for Aletheia computer operator loop.
 */

export type OperatorActionKind =
  | "focus_app"
  | "click_target"
  | "type_text"
  | "press_keys"
  | "scroll"
  | "read_region"
  | "wait_for"
  | "open_url"
  | "done"
  | "pause";

export interface OperatorAction {
  kind: OperatorActionKind;
  targetId?: string;
  app?: string;
  text?: string;
  keys?: string;
  url?: string;
  waitMs?: number;
  reason?: string;
}

export const ALL_OPERATOR_ACTION_KINDS: OperatorActionKind[] = [
  "focus_app",
  "click_target",
  "type_text",
  "press_keys",
  "scroll",
  "read_region",
  "wait_for",
  "open_url",
  "done",
];

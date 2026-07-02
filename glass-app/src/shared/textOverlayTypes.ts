/**
 * Glass this — text overlay intelligence types.
 */

export type TextOverlayTrigger =
  | "selection"
  | "clipboard"
  | "scroll_pause"
  | "hotkey"
  | "cursor_pause"
  | "ambient";

export type TextContentType =
  | "legal_contract"
  | "technical_doc"
  | "email"
  | "financial_doc"
  | "foreign_language"
  | "medical_health"
  | "research_paper"
  | "regulatory_compliance"
  | "earnings_transcript"
  | "meeting_notes"
  | "other";

export type VerificationConfidence = "confirmed" | "uncertain" | "unverifiable";

/** Normalized (0-1) bounding box of the logical text unit within the captured image. */
export interface TextOverlayFractionBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextOverlayExtraction {
  rawText: string;
  logicalUnit: string;
  appName: string | null;
  triggerSource: TextOverlayTrigger;
  contentType: TextContentType;
  confidence: "high" | "low";
  /** Fractional bounds of the logical text unit (relative to the captured image). */
  textBounds?: TextOverlayFractionBounds;
}

export interface TextOverlayAction {
  label: string;
  op: TextOverlayActionOp;
  payload?: unknown;
}

export type TextOverlayActionOp =
  | "copy_to_clipboard"
  | "draft_reply"
  | "apply_fix"
  | "save_to_memory"
  | "open_in_glass"
  | "flag_risk"
  | "create_action_item";

export interface TextOverlayCard {
  id: string;
  rawText: string;
  /** Full logical unit from extraction (~600 chars). */
  logicalUnit?: string;
  contentType: TextContentType;
  /** Null while L1 is still pending/failed — the card may open on L2 alone. */
  level1: string | null;
  level2: string | null;
  level2Source?: {
    title: string;
    url: string;
  };
  verificationConfidence: VerificationConfidence;
  level3: string | null;
  level4: TextOverlayAction[];
  triggerSource: TextOverlayTrigger;
  cursorX: number;
  cursorY: number;
  createdAt: number;
  /** Shown below L1 for legal/medical/financial content. */
  level1Disclaimer?: string;
  /** Overlay-local px bounds of the logical text unit — card anchors to this, not the cursor. */
  textAnchor?: { x: number; y: number; width: number; height: number };
  /** Dominant hue of the app region behind the card (border/pill tinting). */
  appTint?: { h: number; s: number; l: number };
  /** True when the region behind the card is light — use the light frosted variant. */
  lightMode?: boolean;
  /** Levels still resolving — the card renders progressively as they land. */
  pendingLevels?: { l1: boolean; l2: boolean; l3: boolean };
}

/** Progressive patch for a live card (L1/L2/L3 arriving after first paint). */
export interface TextOverlayCardUpdate {
  cardId: string;
  level1?: string | null;
  level2?: string | null;
  level2Source?: { title: string; url: string };
  verificationConfidence?: VerificationConfidence;
  level3?: string | null;
  pendingLevels: { l1: boolean; l2: boolean; l3: boolean };
}

/** Whisper-stage dot — overlay-local anchor shown within 250ms of a trigger. */
export interface TextOverlayWhisperPayload {
  x: number;
  y: number;
  nonce: number;
}

/**
 * Which level is the hero for a content type. "l2" types render verification
 * above comprehension at full opacity — the source of truth matters more than
 * the paraphrase for legal/medical/financial/regulatory/research text.
 */
export const CONTENT_EMPHASIS: Record<TextContentType, "l1" | "l2"> = {
  legal_contract: "l2",
  medical_health: "l2",
  financial_doc: "l2",
  regulatory_compliance: "l2",
  research_paper: "l2",
  technical_doc: "l1",
  email: "l1",
  foreign_language: "l1",
  earnings_transcript: "l1",
  meeting_notes: "l1",
  other: "l1",
};

export const DEFAULT_TEXT_OVERLAY_PRIVACY_APPS = [
  "1Password",
  "Bitwarden",
  "LastPass",
  "Dashlane",
  "KeePassXC",
  "Keychain Access",
  "Bank of America",
  "Chase",
  "Wells Fargo",
  "Citibank",
  "Capital One",
  "American Express",
  "Venmo",
  "PayPal",
  "Robinhood",
  "Coinbase",
] as const;

const GLASS_APP_PATTERN = /^(Native Glass|Electron|IIVO|iivo)/i;

export function isGlassAppName(appName: string | null | undefined): boolean {
  if (!appName?.trim()) return false;
  return GLASS_APP_PATTERN.test(appName.trim());
}

export function isPrivacyApp(
  appName: string | null | undefined,
  privacyApps: readonly string[],
): boolean {
  if (!appName?.trim()) return false;
  const lower = appName.trim().toLowerCase();
  return privacyApps.some((entry) => lower.includes(entry.toLowerCase()));
}

export function contentTypeLabel(type: TextContentType): string {
  switch (type) {
    case "legal_contract":
      return "Legal Clause";
    case "technical_doc":
      return "Technical";
    case "email":
      return "Email";
    case "financial_doc":
      return "Financial";
    case "foreign_language":
      return "Foreign Language";
    case "medical_health":
      return "Medical";
    case "research_paper":
      return "Research";
    case "regulatory_compliance":
      return "Regulatory";
    case "earnings_transcript":
      return "Earnings";
    case "meeting_notes":
      return "Meeting Notes";
    default:
      return "Text";
  }
}

export function shouldRunL2Verification(type: TextContentType): boolean {
  return (
    type === "legal_contract"
    || type === "financial_doc"
    || type === "medical_health"
    || type === "research_paper"
    || type === "regulatory_compliance"
    || type === "earnings_transcript"
  );
}

export function needsLevel1Disclaimer(type: TextContentType): boolean {
  return (
    type === "legal_contract"
    || type === "medical_health"
    || type === "financial_doc"
    || type === "regulatory_compliance"
  );
}

export const LEVEL1_DISCLAIMER =
  "Plain-language reading only — not legal, medical, or financial advice.";

const ACTION_MAP: Record<TextContentType, TextOverlayAction[]> = {
  legal_contract: [
    { label: "Flag this clause", op: "flag_risk" },
    { label: "Draft redline", op: "draft_reply" },
    { label: "Open in Glass", op: "open_in_glass" },
    { label: "Save risk to memory", op: "save_to_memory" },
  ],
  technical_doc: [
    { label: "Copy command", op: "copy_to_clipboard" },
    { label: "Apply fix", op: "apply_fix" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  email: [
    { label: "Draft reply", op: "draft_reply" },
    { label: "Flag commitment", op: "flag_risk" },
    { label: "Save to memory", op: "save_to_memory" },
  ],
  financial_doc: [
    { label: "Flag anomaly", op: "flag_risk" },
    { label: "Save to memory", op: "save_to_memory" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  medical_health: [
    { label: "Save to memory", op: "save_to_memory" },
    { label: "Prep questions", op: "draft_reply" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  research_paper: [
    { label: "Extract key finding", op: "copy_to_clipboard" },
    { label: "Save to memory", op: "save_to_memory" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  regulatory_compliance: [
    { label: "Flag obligation", op: "flag_risk" },
    { label: "Save deadline", op: "create_action_item" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  earnings_transcript: [
    { label: "Flag guidance change", op: "flag_risk" },
    { label: "Save number", op: "save_to_memory" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  meeting_notes: [
    { label: "Create action item", op: "create_action_item" },
    { label: "Draft follow-up", op: "draft_reply" },
    { label: "Save to memory", op: "save_to_memory" },
  ],
  foreign_language: [
    { label: "Copy translation", op: "copy_to_clipboard" },
    { label: "Save vocabulary", op: "save_to_memory" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
  other: [
    { label: "Copy summary", op: "copy_to_clipboard" },
    { label: "Save to memory", op: "save_to_memory" },
    { label: "Open in Glass", op: "open_in_glass" },
  ],
};

export function deriveTextOverlayActions(contentType: TextContentType): TextOverlayAction[] {
  return ACTION_MAP[contentType].slice(0, 3);
}

export const L2_VERIFICATION_PROMPTS: Record<
  Extract<TextContentType, "legal_contract" | "financial_doc" | "medical_health" | "research_paper" | "regulatory_compliance" | "earnings_transcript">,
  string
> = {
  legal_contract:
    "Is this contract clause standard market language, or does it deviate from typical terms? Cite a source.",
  financial_doc:
    "Is this financial claim or number consistent with public filings or market data? Cite a source.",
  medical_health:
    "Is this medical statement consistent with current clinical guidelines? Cite the guideline.",
  research_paper:
    "Has this claim been replicated or challenged in subsequent research? Cite sources.",
  regulatory_compliance:
    "Is this regulatory provision current and in force? Cite the regulation.",
  earnings_transcript:
    "Is this guidance language consistent with or softer/stronger than prior quarters for this company?",
};

const VALID_CONTENT_TYPES = new Set<TextContentType>([
  "legal_contract",
  "technical_doc",
  "email",
  "financial_doc",
  "foreign_language",
  "medical_health",
  "research_paper",
  "regulatory_compliance",
  "earnings_transcript",
  "meeting_notes",
  "other",
]);

function parseContentType(value: unknown): TextContentType {
  if (typeof value === "string" && VALID_CONTENT_TYPES.has(value as TextContentType)) {
    return value as TextContentType;
  }
  return "other";
}

export interface AmbientReadingProbe {
  found: boolean;
  text: string | null;
  contentType: TextContentType | null;
}

export function parseAmbientReadingJson(text: string): AmbientReadingProbe | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      found?: boolean;
      text?: string | null;
      contentType?: string | null;
    };
    if (parsed.found !== true) {
      return { found: false, text: null, contentType: null };
    }
    const probeText = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!probeText) {
      return { found: false, text: null, contentType: null };
    }
    return {
      found: true,
      text: probeText.slice(0, 600),
      contentType: parsed.contentType ? parseContentType(parsed.contentType) : "other",
    };
  } catch {
    return null;
  }
}

function parseFractionBounds(value: unknown): TextOverlayFractionBounds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Partial<TextOverlayFractionBounds>;
  const clamp = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
  const left = clamp(obj.left);
  const top = clamp(obj.top);
  const width = clamp(obj.width);
  const height = clamp(obj.height);
  if (left == null || top == null || width == null || height == null) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { left, top, width, height };
}

export function parseTextOverlayVisionJson(text: string): Omit<
  TextOverlayExtraction,
  "rawText" | "triggerSource"
> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      logicalUnit?: string;
      appName?: string | null;
      contentType?: string;
      confidence?: string;
      textBounds?: unknown;
    };
    const logicalUnit = typeof parsed.logicalUnit === "string" ? parsed.logicalUnit.trim() : "";
    if (!logicalUnit) return null;
    return {
      logicalUnit: logicalUnit.slice(0, 600),
      appName: typeof parsed.appName === "string" ? parsed.appName.trim() || null : null,
      contentType: parseContentType(parsed.contentType),
      confidence: parsed.confidence === "high" ? "high" : "low",
      textBounds: parseFractionBounds(parsed.textBounds),
    };
  } catch {
    return null;
  }
}

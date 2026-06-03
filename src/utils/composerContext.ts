import type { BusinessContext } from "../types/decisionQuality";

/** @deprecated Use BusinessContext from types/decisionQuality */
export type BusinessProfileFields = BusinessContext;

export const EMPTY_BUSINESS_PROFILE: BusinessContext = {
  name: "",
  offer: "",
  targetCustomer: "",
  pricing: "",
  currentGoal: "",
  constraints: "",
  notes: "",
};

export const SESSION_CONTEXT_KEY = "iivo-session-business-context";
export const SESSION_REMEMBER_KEY = "iivo-remember-business-context";

export function appendToPrompt(current: string, block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return current;
  return current.trim() ? `${current.trimEnd()}\n\n${trimmed}` : trimmed;
}

export function formatAdditionalContext(notes: string): string {
  return `Additional Context:\n${notes.trim()}`;
}

export function formatBusinessProfile(fields: BusinessContext): string {
  return [
    "Business / Project Context:",
    `Project / Business Name: ${fields.name.trim()}`,
    `Offer: ${fields.offer.trim()}`,
    `Target Customer: ${fields.targetCustomer.trim()}`,
    `Pricing: ${fields.pricing.trim()}`,
    `Current Goal: ${fields.currentGoal.trim()}`,
    `Constraints: ${fields.constraints.trim()}`,
    fields.notes.trim() ? `Notes: ${fields.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function hasBusinessProfileContent(fields: BusinessContext): boolean {
  return Object.values(fields).some((v) => v.trim().length > 0);
}

export function loadSessionBusinessContext(): BusinessContext | null {
  try {
    const raw = localStorage.getItem(SESSION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BusinessContext;
    return hasBusinessProfileContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSessionBusinessContext(
  ctx: BusinessContext,
  remember: boolean,
): void {
  if (remember && hasBusinessProfileContent(ctx)) {
    localStorage.setItem(SESSION_CONTEXT_KEY, JSON.stringify(ctx));
    localStorage.setItem(SESSION_REMEMBER_KEY, "true");
  } else {
    localStorage.removeItem(SESSION_CONTEXT_KEY);
    localStorage.setItem(SESSION_REMEMBER_KEY, "false");
  }
}

export function shouldRememberBusinessContext(): boolean {
  return localStorage.getItem(SESSION_REMEMBER_KEY) === "true";
}

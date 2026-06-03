import type { BusinessContext } from "./types.js";
import { hasBusinessContext } from "./types.js";

export function formatBusinessContextBlock(ctx: BusinessContext): string {
  const lines = ["Business / Project Context:"];
  if (ctx.name.trim()) lines.push(`Project / Business Name: ${ctx.name.trim()}`);
  if (ctx.offer.trim()) lines.push(`Offer: ${ctx.offer.trim()}`);
  if (ctx.targetCustomer.trim()) {
    lines.push(`Target Customer: ${ctx.targetCustomer.trim()}`);
  }
  if (ctx.pricing.trim()) lines.push(`Pricing: ${ctx.pricing.trim()}`);
  if (ctx.currentGoal.trim()) lines.push(`Current Goal: ${ctx.currentGoal.trim()}`);
  if (ctx.constraints.trim()) lines.push(`Constraints: ${ctx.constraints.trim()}`);
  if (ctx.notes.trim()) lines.push(`Notes: ${ctx.notes.trim()}`);
  return lines.join("\n");
}

export function normalizeBusinessContext(
  input: Partial<BusinessContext> | undefined,
): BusinessContext | undefined {
  if (!input) return undefined;
  const ctx: BusinessContext = {
    name: input.name?.trim() ?? "",
    offer: input.offer?.trim() ?? "",
    targetCustomer: input.targetCustomer?.trim() ?? "",
    pricing: (input.pricing ?? (input as { price?: string }).price ?? "").trim(),
    currentGoal: input.currentGoal?.trim() ?? "",
    constraints: input.constraints?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
  };
  return hasBusinessContext(ctx) ? ctx : undefined;
}

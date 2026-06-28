import type { DesignScreenSpec } from "./designToCodeTypes.ts";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asRegions(v: unknown): DesignScreenSpec["visibleRegions"] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      return {
        id: asString(o.id, `region-${i + 1}`),
        role: asString(o.role, "unknown"),
        label: asString(o.label) || undefined,
        bounds:
          o.bounds && typeof o.bounds === "object"
            ? {
                x: asNumber((o.bounds as Record<string, unknown>).x, 0),
                y: asNumber((o.bounds as Record<string, unknown>).y, 0),
                width: asNumber((o.bounds as Record<string, unknown>).width, 0),
                height: asNumber((o.bounds as Record<string, unknown>).height, 0),
              }
            : undefined,
      };
    })
    .filter(Boolean) as DesignScreenSpec["visibleRegions"];
}

export function createFallbackDesignScreenSpec(warnings: string[]): DesignScreenSpec {
  return {
    screenType: "unknown",
    confidence: 0.2,
    warnings: warnings.length ? warnings : ["spec_unavailable"],
    visibleRegions: [],
    layoutTree: "Unable to parse structured layout from screenshot.",
    components: [],
    repeatedPatterns: [],
    textContent: [],
    palette: [],
    typography: [],
    spacing: [],
    borders: [],
    shadows: [],
    interactionAffordances: [],
    estimatedResponsiveness: "unknown",
    uncertainAreas: ["Full screen — decomposition failed"],
  };
}

export function parseDesignScreenSpec(raw: unknown): DesignScreenSpec {
  if (!raw || typeof raw !== "object") {
    return createFallbackDesignScreenSpec(["spec_parse_failed"]);
  }
  const o = raw as Record<string, unknown>;
  const spec: DesignScreenSpec = {
    screenType: asString(o.screenType, "ui-screen"),
    confidence: Math.max(0, Math.min(1, asNumber(o.confidence, 0.5))),
    warnings: asStringArray(o.warnings),
    visibleRegions: asRegions(o.visibleRegions),
    layoutTree: asString(o.layoutTree, "See visible regions."),
    components: asStringArray(o.components),
    repeatedPatterns: asStringArray(o.repeatedPatterns),
    textContent: asStringArray(o.textContent),
    palette: asStringArray(o.palette),
    typography: asStringArray(o.typography),
    spacing: asStringArray(o.spacing),
    borders: asStringArray(o.borders),
    shadows: asStringArray(o.shadows),
    interactionAffordances: asStringArray(o.interactionAffordances),
    estimatedResponsiveness: asString(o.estimatedResponsiveness, "desktop-fixed"),
    uncertainAreas: asStringArray(o.uncertainAreas),
  };
  if (spec.confidence < 0.35 && !spec.warnings.includes("low_confidence")) {
    spec.warnings.push("low_confidence");
  }
  return spec;
}

export function serializeScreenSpecForPrompt(spec: DesignScreenSpec): string {
  return JSON.stringify(
    {
      screenType: spec.screenType,
      confidence: spec.confidence,
      warnings: spec.warnings,
      layoutTree: spec.layoutTree,
      components: spec.components,
      repeatedPatterns: spec.repeatedPatterns,
      textContent: spec.textContent,
      palette: spec.palette,
      typography: spec.typography,
      spacing: spec.spacing,
      interactionAffordances: spec.interactionAffordances,
      uncertainAreas: spec.uncertainAreas,
    },
    null,
    2,
  );
}

export const DESIGN_SCREEN_SPEC_JSON_SCHEMA = `{
  "screenType": "string — e.g. dashboard, form, modal, landing",
  "confidence": 0.0-1.0,
  "warnings": ["string"],
  "visibleRegions": [{ "id": "string", "role": "string", "label": "string?", "bounds": { "x", "y", "width", "height" }? }],
  "layoutTree": "string — hierarchical layout description",
  "components": ["string — named UI components"],
  "repeatedPatterns": ["string — lists, grids, nav items"],
  "textContent": ["string — visible copy"],
  "palette": ["string — hex or descriptive colors"],
  "typography": ["string — font sizes/weights observed"],
  "spacing": ["string — padding/gap estimates"],
  "borders": ["string"],
  "shadows": ["string"],
  "interactionAffordances": ["string — buttons, inputs, links"],
  "estimatedResponsiveness": "string",
  "uncertainAreas": ["string — ambiguous regions"]
}`;

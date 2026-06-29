/**
 * Canonical Glass UI map for Aletheia — navigation and feature awareness.
 *
 * Injected into ask context so Aletheia can guide users through the current
 * product (Aletheia core strip) without referencing removed surfaces.
 */

import { ALETHEIA_CORE_STRIP } from "./builderStripVisibility.ts";
import { GLASS_MODE_ORDER, GLASS_MODE_PRESETS } from "./glassModePresets.ts";

/** Prompts that should receive the Glass product map even without companion on. */
const GLASS_NAVIGATION_PATTERNS: RegExp[] = [
  /\b(how do i|where is|where's|how to|show me how|navigate|find the|what does|what's in|what is in)\b/i,
  /\b(glass|iivo|aletheia)\b.*\b(panel|dock|strip|setup|preferences|session|mode|agent)\b/i,
  /\b(panel|dock|strip|setup tab|preferences tab)\b/i,
  /\b(intelligent listening|meeting intelligence|listen mode|meetings mode|wingman|translate mode)\b/i,
  /\b(omniparser|use computer|computer operator|screen context)\b/i,
  /\b(research agent|writing agent|agents panel)\b/i,
];

export function promptRequestsGlassProductContext(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return GLASS_NAVIGATION_PATTERNS.some((re) => re.test(text));
}

export function shouldInjectGlassProductKnowledge(input: {
  prompt: string;
  companionModeActive: boolean;
  coreStrip?: boolean;
}): boolean {
  if (input.coreStrip === false) return false;
  if (input.companionModeActive) return true;
  return promptRequestsGlassProductContext(input.prompt);
}

/**
 * Compact, authoritative map of what exists in Glass today (Aletheia core).
 * Keep in sync with builder strip, panel tabs, and mode presets.
 */
export function buildAletheiaGlassProductContext(coreStrip = ALETHEIA_CORE_STRIP): string | undefined {
  if (!coreStrip) return undefined;

  const modeLines = GLASS_MODE_ORDER.map(
    (id) => `- ${GLASS_MODE_PRESETS[id].label} (Panel → Session)`,
  ).join("\n");

  return [
    "IIVO Glass product map (Aletheia core — authoritative for navigation help):",
    "",
    "Bottom builder strip:",
    "- Agents (left): Research and Writing agents only.",
    "- Storage (left): opens full-screen Glass Storage with a Files tab — drag-drop or choose files to upload locally.",
    "- Aletheia (center): menu with Activate (voice companion), Deactivate, Use computer for this task (computer operator), and Dashboard.",
    "- Quit (right): exit Glass.",
    "",
    "Command bar (bottom center): type or dictate questions; visual ask captures the screen when you use capture/ask flows.",
    "",
    "Dock (left rail or top pill): session status, Start/End Session, Panel, Capture, Live Notes, Stop Everything, lock position.",
    "Terminal and Glass IDE are not in this build.",
    "",
    "Panel tabs (open from dock → Panel):",
    "- Setup: permissions, API keys, server health, profile, account.",
    "- Preferences: screen context on/off, display & dock placement, OmniParser/Ollama components, agent output folder.",
    "- Session: session mode cards and Quick Tools.",
    "- Capture: live notes and transcript while listening.",
    "- Audio: input sources and system audio routing.",
    "",
    "Session modes (Panel → Session):",
    modeLines,
    "- Quick Tools: Voice (hands-free talk to IIVO) and Translate (live captions).",
    "",
    "Aletheia capabilities:",
    "- Voice companion (strip → Aletheia → Activate): listens, answers, may speak via TTS.",
    "- Screen guidance: on visual ask, highlights UI (glow, arrows, spotlight) using accessibility/DOM marks; OmniParser adds extra marks when installed (Preferences → Components).",
    "- Computer operator: strip → Aletheia → Use computer for this task.",
    "- Agents: Research and Writing run from strip → Agents.",
    "- Glass Storage: strip → Storage — Files tab for local uploads (saved under glass-storage/files).",
    "",
    "Not available in this build (do not direct users here):",
    "- Wingman mode, Glass IDE, built-in terminal, design-to-code, extract & build, powers menu, Code Analyst/Coder agents, separate System dashboard (setup lives in Panel → Setup).",
    "",
    "When guiding navigation: name the exact strip item, panel tab, or dock control. Session modes and Aletheia companion can run together.",
  ].join("\n");
}

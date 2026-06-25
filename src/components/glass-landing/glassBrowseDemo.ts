import type { GlassBrowseCommandCategory } from "../../utils/glassBrowseAnalytics";

/** Aletheia-voice demo answers — short, factual, page-aware. */
export function glassBrowseDemoAnswer(question: string): string {
  const category = classifyGlassBrowseDemoCategory(question);
  return GLASS_BROWSE_DEMO_ANSWERS[category];
}

export function classifyGlassBrowseDemoCategory(question: string): GlassBrowseCommandCategory {
  const q = question.toLowerCase();
  if (/\b(download|install|dmg)\b/.test(q)) return "download";
  if (/\b(agent|agents|automate)\b/.test(q)) return "agents";
  if (/\b(build loop|ship from here|orchestrat)\b/.test(q)) return "build_loop";
  if (/\b(launch|boot|open glass|first run|ready)\b/.test(q)) return "launch";
  if (/\b(privacy|trust|data|record|capture)\b/.test(q)) return "privacy";
  if (/\b(memory|remember|recall|forget|delete)\b/.test(q)) return "memory";
  return "general";
}

const GLASS_BROWSE_DEMO_ANSWERS: Record<GlassBrowseCommandCategory, string> = {
  download:
    "Here's what I see on this page: a Mac download CTA. On your Mac I'd serve the latest DMG from GitHub — drag to Applications and the overlay goes live system-wide.",
  agents:
    "From here I'd open Agents in the builder strip, read this landing page as context, and turn it into files and a build plan — without leaving Safari.",
  build_loop:
    "This page is the kind of context I'd keep in the build loop: hero promise, pillars, trust. On Mac I'd draft the next step from here while you stay in flow.",
  launch:
    "Launch check: command bar ready, builder strip synced, frame locked to the screen edge. From this download you'd be on the ambient layer in under a minute.",
  privacy:
    "This trust section matches how Glass behaves: screen capture and audio only when you trigger them. I don't watch or listen silently beneath your desktop.",
  memory:
    "Memory stays yours — and compounds. On Mac I'd recall sessions you save across three local tiers, so every answer builds on the last. You can delete everything, completely, whenever you want.",
  general:
    "Here's what I see on this page — hero, ambient OS story, builder pillars. On your Mac I'd answer from here, your screen, and your memory, all from this command bar.",
};

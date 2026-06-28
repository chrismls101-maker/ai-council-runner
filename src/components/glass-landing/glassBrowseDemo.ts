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
  if (/\b(build loop|ship from here|orchestrat|cross.?app|lens)\b/.test(q)) return "build_loop";
  if (/\b(launch|boot|open glass|first run|ready)\b/.test(q)) return "launch";
  if (/\b(privacy|trust|data|record|capture)\b/.test(q)) return "privacy";
  if (/\b(memory|remember|recall|forget|delete)\b/.test(q)) return "memory";
  return "general";
}

const GLASS_BROWSE_DEMO_ANSWERS: Record<GlassBrowseCommandCategory, string> = {
  download:
    "This page is selling the next layer — intelligent Glass above every Mac app. On yours I'd serve the latest DMG: drag to Applications and the overlay goes live system-wide in under a minute.",
  agents:
    "From here I'd open Agents in the builder strip, fuse this landing page with whatever else is on your screen, and ship files — without leaving the app you're in. That's what cross-window Lens is for.",
  build_loop:
    "This hero, the layer stack, the pillars — exactly the kind of context Glass keeps in the build loop. On Mac I'd draft the next commit from here while you stay in flow across every window.",
  launch:
    "Launch check: command bar armed, builder strip synced, glass frame locked to your display. One download and you're on the intelligence layer — not inside another chat tab.",
  privacy:
    "This trust section is how Glass actually works: screen capture and audio only when you trigger them. No silent watching. No training on your sessions without explicit consent.",
  memory:
    "Memory stays yours and compounds across apps. On Mac I'd recall sessions you save across local tiers — so every answer builds on the last. Delete everything, completely, whenever you want.",
  general:
    "Here's what I see — the next layer of AI-native computing, pitched against tab AI and per-app copilots. On your Mac I'd answer from this page, your screen, and your memory — all from one command bar above everything.",
};

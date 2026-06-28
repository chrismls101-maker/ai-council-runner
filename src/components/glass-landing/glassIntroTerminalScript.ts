/** Intro terminal voice demo — realistic dev workflow via Aletheia voice → shell. */

export const INTRO_TERMINAL_VOICE_TRANSCRIPT =
  "Find what's using port 3000, kill it, restart npm dev, and open localhost.";

export const INTRO_TERMINAL_SHELL_CMD =
  "lsof -ti :3000 | xargs kill -9 2>/dev/null; npm run dev & open http://localhost:3000";

export const INTRO_TERMINAL_RUN_STEPS = [
  "✓ Cleared process on port 3000",
  "✓ Dev server starting on localhost:3000",
  "→ Opened browser tab",
] as const;

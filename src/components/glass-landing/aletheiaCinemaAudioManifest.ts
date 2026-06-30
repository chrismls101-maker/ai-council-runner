import type { AletheiaVoiceProfile } from "./glassIntroAletheiaSpeak";

/** Stable clip id → baked MP3 at /audio/aletheia-cinema/{id}.mp3 */
export type AletheiaCinemaBakedClip = {
  id: string;
  text: string;
  profile: AletheiaVoiceProfile;
};

/** One clip per spoken line — bake with `npm run bake:aletheia-cinema`. */
export const ALETHEIA_CINEMA_BAKED_CLIPS: readonly AletheiaCinemaBakedClip[] = [
  { id: "every-window", text: "Every window,", profile: "cinemaFelt" },
  { id: "one-layer", text: "One layer.", profile: "cinemaEmphasis" },
  { id: "above-it-all", text: "Above it all.", profile: "cinemaEmphasis" },
  { id: "agents", text: "Agents...", profile: "cinemaSoft" },
  { id: "orchestrated", text: "Orchestrated.", profile: "cinemaEmphasis" },
  { id: "memory", text: "Memory...", profile: "cinemaSoft" },
  { id: "memory-payoff", text: "They can't match.", profile: "cinemaEmphasis" },
  { id: "voice", text: "Voice...", profile: "cinemaSoft" },
  { id: "voice-payoff", text: "Across your Mac.", profile: "cinemaEmphasis" },
  { id: "read-1", text: "I reed...", profile: "cinemaSoft" },
  { id: "read-2", text: "Every app. One understanding.", profile: "cinemaEmphasis" },
  { id: "listen-1", text: "I listen...", profile: "cinemaSoft" },
  { id: "listen-2", text: "To what you allow. Carried forward.", profile: "cinemaEmphasis" },
  { id: "build-1", text: "I build.", profile: "cinemaFelt" },
  { id: "build-2", text: "Intelligence.", profile: "cinemaEmphasis" },
  { id: "build-3", text: "You own it.", profile: "cinemaEmphasis" },
  { id: "build-4", text: "I create it.", profile: "cinemaEmphasis" },
  { id: "build-5", text: "It is yours.", profile: "cinemaEmphasis" },
  { id: "build-6", text: "Intelligence that compounds.", profile: "cinemaEmphasis" },
  { id: "intelligence", text: "Intelligence...", profile: "cinemaSoft" },
  { id: "always-on-top", text: "Always on top.", profile: "cinemaEmphasis" },
  { id: "glass", text: "Glass...", profile: "cinemaSoft" },
  { id: "always-yours", text: "Always yours.", profile: "cinemaEmphasis" },
  { id: "intelligent-glass", text: "Intelligent glass.", profile: "cinemaFinale" },
  {
    id: "glass-welcome-1",
    text: "This is the next layer... of AI-native computing.",
    profile: "cinemaFinale",
  },
  { id: "glass-welcome-2", text: "Welcome... to Glass.", profile: "cinemaFinale" },
  { id: "boot-activate", text: "Glass... is live.", profile: "boot" },
] as const;

export const ALETHEIA_CINEMA_BAKED_CLIP_MAP = Object.fromEntries(
  ALETHEIA_CINEMA_BAKED_CLIPS.map((clip) => [clip.id, clip]),
) as Record<string, AletheiaCinemaBakedClip>;

export const ALETHEIA_CINEMA_AUDIO_BASE = "/audio/aletheia-cinema";

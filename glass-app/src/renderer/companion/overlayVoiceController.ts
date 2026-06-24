import { VoiceController } from "../onboarding/swarm/VoiceController.ts";

let instance: VoiceController | null = null;

/** Shared VoiceController for overlay TTS — chorus + reverb FX (same as Sorting Hat). */
export function getOverlayVoiceController(): VoiceController {
  if (!instance) instance = new VoiceController();
  return instance;
}

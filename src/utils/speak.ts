// speak(text) — plays IIVO's voice.
// Fetches audio from the server proxy (/api/tts, which holds the ElevenLabs key)
// and plays it. Pitch is dropped slightly for a more serious, deliberate read —
// matching the voice from the IIVO interface. Usage:  import { speak } from
// "../utils/speak";  await speak("...the AI's reply...");

let audioEl: HTMLAudioElement | null = null;
let busy = false;
const PITCH = 0.9; // <1 = lower / more deliberate

export async function speak(text: string): Promise<void> {
  if (busy || !text) return;
  busy = true;
  try {
    if (!audioEl) audioEl = new Audio();
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) {
      console.error("[IIVO] TTS error", await r.text());
      busy = false;
      return;
    }
    const blob = await r.blob();
    if (audioEl.src) URL.revokeObjectURL(audioEl.src);
    audioEl.src = URL.createObjectURL(blob);
    (audioEl as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    audioEl.playbackRate = PITCH;
    audioEl.onended = () => { busy = false; };
    audioEl.onerror = () => { busy = false; };
    await audioEl.play();
  } catch (e) {
    console.error("[IIVO] speak failed", e);
    busy = false;
  }
}

export function isSpeaking(): boolean { return busy; }

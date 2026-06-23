# Cursor Build — Aletheia Interruption + Privacy Mode

Three features, one build. All three live in the companion/STT layer.

---

## Feature 1 — Barge-In Interruption

When the user speaks while Aletheia is speaking (TTS playing), cut her off immediately and handle the new input.

### What exists
- `GlassCompanionProvider.tsx` has `tts.stop()`, `timedTts.stop()`, `scriptPlayer.stopScript()` — all callable together
- `speaking` state boolean tracks whether TTS is active
- Deepgram runs continuously even while TTS plays — transcripts can arrive mid-speech

### What to build

**In `GlassCompanionProvider.tsx`:**

1. Expose a ref `isSpeakingRef` that mirrors the `speaking` state — needed for the transcript callback (closures).

2. In the Deepgram/STT `onTranscript` handler (or wherever final companion transcripts are processed), add:
```typescript
if (isSpeakingRef.current) {
  // Barge-in: user spoke while Aletheia was speaking
  tts.stop();
  timedTts.stop();
  scriptPlayer.stopScript();
  setSpeaking(false);
  setFlatManifestations(null);
  // Short debounce (80ms) then process the new transcript as normal
  // Tag the submission with companionRoute: "barge_in" so the server
  // knows to keep the response shorter
}
```

3. Add `"barge_in"` to the `CompanionRoute` union type in `src/shared/companionRetarget.ts` (or `ipc.ts` wherever it lives).

4. When submitting a barge-in transcript, pass `companionRoute: "barge_in"` so the server prompt can note the user interrupted.

### IPC additions
None required — barge-in is handled entirely in renderer.

### Echo suppression
Deepgram will also pick up Aletheia's own voice from the speakers. Suppress self-echo:
- Keep a ref `lastTtsText` with the text Aletheia just spoke
- In the transcript handler, if the incoming text has >60% token overlap with `lastTtsText`, treat it as echo and discard (do not barge-in).

```typescript
function isLikelyEcho(incoming: string, lastSpoken: string): boolean {
  if (!lastSpoken) return false;
  const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const a = new Set(tokenize(incoming));
  const b = new Set(tokenize(lastSpoken));
  let overlap = 0;
  for (const t of a) { if (b.has(t)) overlap++; }
  return overlap / Math.max(a.size, b.size) > 0.6;
}
```

---

## Feature 2 — Privacy Mode

User says "stop listening" (or similar) → Aletheia goes completely silent for N minutes, then softly announces she's back.

### State additions

**`src/shared/ipc.ts` — add to `GlassState`:**
```typescript
companionPrivacy?: {
  active: boolean;
  resumeAt: number;      // Unix ms timestamp
  durationMs: number;
};
```

**`src/shared/ipc.ts` — add to `GlassCommand`:**
```typescript
| { type: "companion-privacy-start"; durationMs?: number }
| { type: "companion-privacy-end" }
```

### Main process (`src/main/index.ts`)

Add privacy state to initial `state`:
```typescript
companionPrivacy: undefined,
```

Add to `handleCommand`:
```typescript
case "companion-privacy-start": {
  const durationMs = command.durationMs ?? 10 * 60 * 1000; // default 10 min
  state.companionPrivacy = {
    active: true,
    resumeAt: Date.now() + durationMs,
    durationMs,
  };
  push();
  // Schedule auto-resume
  clearCompanionPrivacyTimer();
  companionPrivacyTimer = setTimeout(() => {
    if (!state.companionPrivacy?.active) return;
    state.companionPrivacy = undefined;
    push();
    // Signal renderer to speak the resume line
    broadcast(IPC.companionPrivacyResumed, {});
  }, durationMs);
  return;
}
case "companion-privacy-end": {
  clearCompanionPrivacyTimer();
  state.companionPrivacy = undefined;
  push();
  return;
}
```

Add module-level:
```typescript
let companionPrivacyTimer: ReturnType<typeof setTimeout> | null = null;
function clearCompanionPrivacyTimer() {
  if (companionPrivacyTimer) { clearTimeout(companionPrivacyTimer); companionPrivacyTimer = null; }
}
```

**Add to `IPC` object in `ipc.ts`:**
```typescript
companionPrivacyResumed: "companion-privacy-resumed",
```

**Expose in `preload/index.ts`:**
```typescript
onCompanionPrivacyResumed: (cb: () => void) =>
  ipcRenderer.on(IPC.companionPrivacyResumed, cb),
```

### Renderer — `GlassCompanionProvider.tsx`

1. Read `state.companionPrivacy?.active` — when true, suppress all transcript processing (do not submit, do not respond).

2. Listen for `companionPrivacyResumed` IPC event → speak the resume line via TTS:
```typescript
useEffect(() => {
  return window.glass.onCompanionPrivacyResumed(() => {
    void tts.speak("I'm back when you need me.");
  });
}, [tts]);
```

3. When submitting the privacy-start command, speak the acknowledgment *before* sending the IPC:
```typescript
const minutes = Math.round(durationMs / 60000);
void tts.speak(`Of course — going quiet. I'll check back in ${minutes} minutes.`);
setTimeout(() => send({ type: "companion-privacy-start", durationMs }), 600);
```

### Privacy trigger detection

In the transcript handler, before checking privacy mode, run the privacy intent detector:

```typescript
// src/shared/companionPrivacyDetect.ts (new file)
const PRIVACY_TRIGGERS = [
  /\b(stop listening|go dark|privacy mode|give us a minute|give me a minute|don't listen|go quiet|be quiet|mute yourself|go away for)\b/i,
  /\b(i need privacy|we need privacy|private conversation|not for you)\b/i,
  /\b(come back in|check back in|back in)\s+(\d+)\s*(min|minute|hour)/i,
];

export function detectPrivacyIntent(text: string): { isPrivacy: boolean; durationMs?: number } {
  for (const re of PRIVACY_TRIGGERS) {
    if (re.test(text)) {
      // Try to parse a duration from "come back in 20 minutes" etc.
      const durationMatch = text.match(/(\d+)\s*(min|minute|hour)/i);
      if (durationMatch) {
        const n = parseInt(durationMatch[1], 10);
        const unit = durationMatch[2].toLowerCase();
        const durationMs = unit.startsWith('h') ? n * 3600000 : n * 60000;
        return { isPrivacy: true, durationMs };
      }
      return { isPrivacy: true };
    }
  }
  return { isPrivacy: false };
}

const RESUME_TRIGGERS = [
  /\b(come back|i'm back|you can listen|resume|stop privacy|end privacy|you're good|we're good)\b/i,
];

export function detectResumeIntent(text: string): boolean {
  return RESUME_TRIGGERS.some(re => re.test(text));
}
```

In the transcript handler:
```typescript
// Check privacy resume first
if (state.companionPrivacy?.active) {
  if (detectResumeIntent(text) || looksLikeDirectQuestion(text)) {
    send({ type: "companion-privacy-end" });
    if (!detectResumeIntent(text)) {
      // They asked a question without explicitly resuming — answer it
      submitTranscript(text);
    }
  }
  return; // Otherwise: stay silent
}

// Check privacy start
const privacyIntent = detectPrivacyIntent(text);
if (privacyIntent.isPrivacy) {
  triggerPrivacyMode(privacyIntent.durationMs);
  return;
}
```

---

## Feature 3 — Ambient Conversation Awareness ("Not talking to me")

When Aletheia is active and hears a conversation happening nearby (not directed at her), she stays silent.

### Detection logic

**`src/shared/companionAmbientDetect.ts` (new file):**

```typescript
export interface AmbientDetectionResult {
  addressedToCompanion: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Phrases that strongly indicate the user is talking TO a device/AI
const DEVICE_DIRECTED = [
  /\b(can you|could you|will you|would you|please)\b/i,
  /\b(show me|tell me|explain|summarize|help me|what is|what are|how do|how can|why is|find|search|open|close|write|read|translate)\b/i,
  /\b(aletheia|hey glass|iivo|hey computer)\b/i,
];

// Phrases that strongly indicate human-to-human conversation
const HUMAN_TO_HUMAN = [
  /\b(yeah|right|exactly|totally|for sure|no way|seriously|i know|oh my god|that's crazy|honestly|literally)\b/i,
  /\b(did you see|have you heard|do you remember|what did you think|i was telling|she said|he said|they said)\b/i,
  /\b(okay so|anyway|like i said|the thing is|you know what|listen|so basically|and then he|and then she)\b/i,
];

export function detectAmbientConversation(
  text: string,
  speakerId?: number,
  prevSpeakerId?: number,
  speakerChangeCount?: number,
): AmbientDetectionResult {
  const wordCount = text.trim().split(/\s+/).length;

  // Explicit address → definitely for companion
  if (/\b(aletheia|hey glass|iivo)\b/i.test(text)) {
    return { addressedToCompanion: true, confidence: 'high', reason: 'explicit_address' };
  }

  // Multiple distinct speakers detected → probably human-to-human
  if (speakerChangeCount !== undefined && speakerChangeCount >= 2) {
    // Still check if this turn is device-directed
    const deviceHit = DEVICE_DIRECTED.some(re => re.test(text));
    if (!deviceHit) {
      return { addressedToCompanion: false, confidence: 'high', reason: 'multiple_speakers' };
    }
  }

  // Speaker changed from previous turn → likely different person responding
  if (speakerId !== undefined && prevSpeakerId !== undefined && speakerId !== prevSpeakerId) {
    const deviceHit = DEVICE_DIRECTED.some(re => re.test(text));
    if (!deviceHit) {
      return { addressedToCompanion: false, confidence: 'medium', reason: 'speaker_change' };
    }
  }

  // Short social utterance with human-to-human markers
  const humanHit = HUMAN_TO_HUMAN.some(re => re.test(text));
  if (humanHit && wordCount < 12) {
    return { addressedToCompanion: false, confidence: 'medium', reason: 'social_utterance' };
  }

  // Device-directed phrasing → respond
  const deviceHit = DEVICE_DIRECTED.some(re => re.test(text));
  if (deviceHit) {
    return { addressedToCompanion: true, confidence: 'medium', reason: 'device_phrasing' };
  }

  // Ambiguous — default to NOT responding (better to miss than to interrupt)
  // EXCEPT: if companion has been actively conversing recently (last turn < 30s ago),
  // lean toward responding.
  return { addressedToCompanion: false, confidence: 'low', reason: 'ambiguous_default_silent' };
}

export function looksLikeDirectQuestion(text: string): boolean {
  return DEVICE_DIRECTED.some(re => re.test(text));
}
```

### Wiring in main process

Track speaker context. Deepgram already provides `speakerId` in transcripts. In the companion transcript handler (`index.ts`, wherever companion STT transcripts are dispatched):

```typescript
// Module-level ambient state
let companionLastSpeakerId: number | undefined;
let companionSpeakerChangeCount = 0;
let companionLastResponseAt = 0;

// In the transcript handler, before submitting to AI:
const ambient = detectAmbientConversation(
  text,
  speakerId,
  companionLastSpeakerId,
  companionSpeakerChangeCount,
);

if (speakerId !== undefined && speakerId !== companionLastSpeakerId) {
  companionSpeakerChangeCount++;
}
companionLastSpeakerId = speakerId;

// Override: if companion responded recently (< 30s), assume continued conversation
const recentConversation = Date.now() - companionLastResponseAt < 30_000;

if (!ambient.addressedToCompanion && !recentConversation) {
  // Log silently — never speak
  console.log(`[companion] ambient suppress: ${ambient.reason} "${text.slice(0, 60)}"`);
  return;
}

// Proceed to submit
companionLastResponseAt = Date.now();
```

### Reset on companion toggle off/on

When companion toggles off or privacy mode starts, reset:
```typescript
companionLastSpeakerId = undefined;
companionSpeakerChangeCount = 0;
companionLastResponseAt = 0;
```

---

## Files to create
- `src/shared/companionPrivacyDetect.ts` — privacy trigger + resume intent detection
- `src/shared/companionAmbientDetect.ts` — ambient conversation classifier

## Files to modify
- `src/shared/ipc.ts` — add `companionPrivacy` to `GlassState`, add `companion-privacy-start` / `companion-privacy-end` to `GlassCommand`, add `companionPrivacyResumed` to `IPC` object
- `src/main/index.ts` — privacy state, timer, `handleCommand` cases, ambient detection wiring in companion transcript path, reset on toggle
- `src/renderer/companion/GlassCompanionProvider.tsx` — barge-in in transcript handler, privacy suppression, `onCompanionPrivacyResumed` listener, echo suppression ref
- `src/shared/companionRetarget.ts` — add `"barge_in"` to `CompanionRoute`
- `src/preload/index.ts` — expose `onCompanionPrivacyResumed`

---

## Behavior summary

| Situation | Aletheia does |
|-----------|--------------|
| User speaks while she's talking | Stops immediately, listens, responds shorter |
| Her own voice picked up by mic | Discards as echo (>60% token overlap) |
| User says "stop listening for 20 min" | "Of course — going quiet. I'll check back in 20 minutes." → silent |
| Privacy timer fires | "I'm back when you need me." |
| User says "come back" during privacy | Exits privacy mode, ready |
| User asks a question during privacy | Exits privacy silently, answers the question |
| Two people talking nearby | Silent — does not interrupt |
| Companion was recently active + new speech | Assumes continued conversation, responds |
| Explicit name/address during ambient | Always responds regardless of speaker count |

---

## Test cases

```typescript
// Barge-in
expect(isLikelyEcho("the file is at src slash renderer", "the file is at src/renderer")).toBe(true);
expect(isLikelyEcho("what about the other one", "the file is at src/renderer")).toBe(false);

// Privacy triggers
expect(detectPrivacyIntent("stop listening").isPrivacy).toBe(true);
expect(detectPrivacyIntent("give us a minute").isPrivacy).toBe(true);
expect(detectPrivacyIntent("come back in 15 minutes").durationMs).toBe(900000);
expect(detectResumeIntent("come back").toBe(true));
expect(detectResumeIntent("you're good now").toBe(true));

// Ambient detection
expect(detectAmbientConversation("yeah totally that's so funny", undefined, undefined, 0).addressedToCompanion).toBe(false);
expect(detectAmbientConversation("can you explain what this does", undefined, undefined, 0).addressedToCompanion).toBe(true);
expect(detectAmbientConversation("aletheia what time is it", undefined, undefined, 3).addressedToCompanion).toBe(true);
expect(detectAmbientConversation("she said she was going to call", 1, 0, 2).addressedToCompanion).toBe(false);
```

---

## Why this matters

No current voice AI (Siri, Alexa, Google, ChatGPT Voice) does all three of these correctly:
- Siri and Alexa require wake words — they can't detect ambient conversations
- ChatGPT Voice has barge-in but no privacy mode and no ambient detection
- None of them use speaker diarization to distinguish "talking to me" from "talking near me"

Aletheia's dual hearing (mic + machine audio) plus Deepgram's speaker diarization gives her the raw signals no cloud assistant has. This build uses those signals.

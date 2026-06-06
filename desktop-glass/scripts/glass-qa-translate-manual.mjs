#!/usr/bin/env node
/**
 * Manual QA checklist for IIVO Glass Live Translate.
 *
 * Usage: npm run glass:qa:translate:manual
 */

console.log(`
# IIVO Glass — Live Translate Manual QA

Run with: npm run dev (Glass) + npm run dev (server) in another terminal.

## Media Captions

1. Open IIVO Glass panel → Quick Tools → **Translate**.
2. Select **Media Captions**.
3. Source: **Computer Audio**.
4. Target: **English → Spanish** (or Auto → Spanish).
5. Play an English video (YouTube, podcast, course, webinar).
6. Confirm Spanish captions appear bottom-center.
7. Confirm **Mic: Off** in status row.
8. Confirm **Save: Off** (private_no_save default).
9. Switch Display to **Original + translation**.
10. Confirm both lines show (ES: / EN: short labels).

## Conversation Captions

1. Quick Tools → **Translate** → **Conversation Captions**.
2. Source: **Computer Audio**.
3. Target: **Spanish → English** (or Auto → English).
4. Play Spanish audio or join WhatsApp/Zoom/Meet call audio.
5. Confirm English captions appear naturally (not over-formal).
6. Confirm **Save: Off** / private_no_save — no silent session saves.
7. Confirm **Mic: Off** unless microphone explicitly enabled.
8. Click **Stop Translation** — captions clear.
9. Click **Stop Everything** — all sources and translate state clear.

## Listen / Meetings integration

- In **Listen** mode: toggle **Show translated captions** — notes remain; captions parallel.
- In **Meetings** mode: toggle **Show translated captions** — meeting intelligence uses original transcript.
- Saving requires explicit opt-in: **Save translation only** or **Save original + translation**.

## Privacy checks

- No audio on app launch.
- Translation starts only after explicit Start Translate.
- Raw audio not stored.
- Microphone requires explicit enable with visible warning.
- Translated text labeled as translation when saved (never treated as original speaker quote).

Report issues in session notes — do not commit /tmp reports or raw audio.
`);

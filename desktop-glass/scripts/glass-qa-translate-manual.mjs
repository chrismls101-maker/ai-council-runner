#!/usr/bin/env node
/**
 * Manual QA checklist for IIVO Glass Live Translate.
 *
 * Usage: npm run glass:qa:translate:manual
 */

console.log(`
# IIVO Glass — Live Translate Manual QA

Run with: npm run dev (Glass) + npm run dev (server) in another terminal.

## Checklist

1. Open an English video (YouTube, podcast, course).
2. Open IIVO Glass panel → click **Translate** mode card.
3. Select **Spanish** as target language → **Start Translate**.
4. Confirm Spanish captions appear bottom-center while video plays.
5. Confirm **Mic: Off** and **Source: Computer Audio** in status row.
6. Start a WhatsApp/Zoom/Meet call (or Spanish audio source).
7. Choose **Spanish → English** (or Auto → English).
8. Confirm English captions appear for Spanish speech.
9. Confirm **private mode** (conversation/mic): no new transcript events saved to session.
10. Click **Stop Translation** — captions clear; **Stop Everything** ends all capture.

## Privacy checks

- No audio on app launch.
- Translation starts only after explicit Start Translate.
- Raw audio not stored.
- Microphone requires explicit enable with visible warning.

Report issues in session notes or /tmp/iivo-glass-manual-qa.md
`);

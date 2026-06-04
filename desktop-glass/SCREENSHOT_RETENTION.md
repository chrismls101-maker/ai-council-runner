# IIVO Glass screenshot retention

## Where pixels go

| Action | Local disk (`session-screenshots/`) | RAM (ephemeral) | `POST /api/glass/ask` → OpenAI vision | Context Bridge |
|--------|-------------------------------------|-----------------|--------------------------------------|----------------|
| Manual **Capture** (session active) | Yes — `screen_capture` event | `pendingCaptureDataUrl` optional | No | Only if **Auto-upload captures** is on |
| Manual **Capture** (no session) | No | `pendingCaptureDataUrl` | No | Only if auto-upload on |
| **Visual Ask** (session + save on) | Yes — new `screen_capture` | No (paths on disk) | Yes — `imageDataUrl` in request body | No (unless auto-upload / Open in IIVO / Save screen) |
| **Visual Ask** (no session or save off) | No | Yes — until Save screen or Open in IIVO | Yes — request body only | No (unless explicit Open / Save) |
| **Open in IIVO** on visual answer | — | — | — | Yes — upload at click time |
| **Save screen** on overlay | Yes (if session active) | Cleared after save | — | No |

Session JSON (`glass-sessions.json`) never stores base64 — `screenshotDataUrl` is stripped on persist.

## UI status (after a visual ask)

- **Screen used for this answer · Saved to session**
- **Screen used for this answer · Not saved** (+ **Save screen** when session active)
- **Screen used for this answer · Uploaded to IIVO Context**

## Settings (Panel → Screen capture privacy)

- **Save visual asks to session** (default on)
- **Auto-upload captures to IIVO Context** (default off)

## Live Vision

Periodic background capture is not implemented. Only explicit Capture and visual-intent asks capture the display.

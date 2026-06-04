# IIVO Glass — Limitation Audit (final)

Last updated: v1.4+ server-first STT pass.

## Current state

IIVO Glass is a permission-first desktop companion: session intelligence, durable screenshots, Analyze Now / Open in IIVO, optional source context, microphone/system audio capture, and OpenAI STT (server-first).

## Fixed in code

| Item | Status |
|------|--------|
| Server-first STT via `POST /api/transcribe-audio` | Fixed in code |
| Glass reuses IIVO server `OPENAI_API_KEY` when endpoint=server | Fixed in code |
| Direct Glass OpenAI STT fallback | Fixed in code |
| System audio status + “How to fix” hints | Fixed in code |
| Web Speech vs OpenAI path labels | Fixed in code |
| Cost controls (20s chunks, 10m warning, optional auto-stop) | Fixed in code |
| No mock provider in product UI | Fixed in code |
| Manual QA checklist + pass/fail template | Fixed in code |

## External / manual requirements

| Item | Classification |
|------|----------------|
| macOS Screen Recording / audio capture permission | Requires user permission |
| macOS virtual audio device for some loopback setups | Normal OS limitation |
| `OPENAI_API_KEY` on IIVO server (or direct Glass env) | Requires user API key |
| Headed manual QA (launch Glass, grant permissions, listen) | Requires headed manual QA |
| Live OpenAI billing for real transcription | Requires user API key |
| `npm run dev` running for server STT | Requires user action |

## True remaining limitations

| Limitation | Classification |
|------------|----------------|
| Web Speech does not use OpenAI (browser-local when available) | Deferred by design |
| System audio loopback OS/permission dependent | Normal OS limitation |
| No Deepgram provider | Deferred by design |
| No autonomous computer control | Deferred by design |
| Live OpenAI not verified in CI | Requires user API key |
| Headed QA not run in agent sessions | Requires headed manual QA |

## What requires user action before manual QA

1. Start IIVO server: `npm run dev` (with `OPENAI_API_KEY` in root `.env`)
2. Start Glass: `npm run glass:dev`
3. Grant macOS Screen Recording (+ Accessibility for source context) if prompted
4. Start Session → test Microphone and System Audio modes
5. Run optional live STT: `npm run glass:stt:live` (requires fixture + key; may cost)

## Deepgram

Not implemented. OpenAI STT is sufficient for v1. Future optional provider only — no code or UI added.

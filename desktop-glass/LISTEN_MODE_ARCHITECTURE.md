# Listen Mode Architecture

IIVO Glass Listen Mode captures **computer audio only**, builds transcript context, detects meaningful moments, and optionally surfaces **one** thought card — while always supporting user-initiated “Ask About This Moment” questions.

This document is the source-of-truth map before adding a Listen persona / thought-partner prompt.

---

## User flow

```
Click Listen (mode preset)
  → session starts (if needed)
  → system audio source selected (BlackHole / loopback)
  → STT produces transcript chunks
  → chunks deduped → session events + running transcript
  → Active Listening context window updated
  → moment intelligence evaluates each chunk
  → timing/maturity decides: quiet | wait | save silently | surface (one card)
  → user may pause video and ask (typed or Voice)
  → debrief / Listen Report from saved + surfaced moments
```

**Stop Everything** clears listening, moments, active card, timers, and media context.

---

## Data flow

```
system_audio (MediaRecorder segment)
  → IPC sttProcessChunk (main/sttChunkHandler.ts)
  → STT provider → text
  → appendTranscriptDeduped (running transcript)
  → session event transcript_note (deduped)
  → maybeShowActiveListeningProactive → processListenModeChunk (Listen only)
       → evaluateListenMoments
       → shouldSurfaceListenMoment (warm-up, maturity, grounded insight)
       → decideListenCardSurface (one-card rule)
       → upsertListenInsightCard → command feed (overlay)

User ask (command bar / Voice)
  → buildCurrentMomentContext
  → activeListeningGuidance + listenModePersona
  → glass ask API
```

---

## Source of truth

| Concern | Source of truth | Notes |
|--------|-----------------|-------|
| **Active mode (Listen vs Meetings)** | `glassModePresets.ts` + `deriveActiveListeningMode()` | User-facing preset maps to `sessionType: video_learning` |
| **Audio source** | `state.transcriptionMode` + mode activation | Listen preset → `system_audio`; mic off unless Voice explicitly started |
| **Transcript chunks (events)** | `session.events` (`transcript_note`) | Written from `sttChunkHandler` and `add-transcript-chunk` |
| **Transcript dedupe** | `transcriptDedupe.ts` | `isDuplicateTranscriptChunk`, `appendTranscriptDeduped`, display dedupe in Panel |
| **Running transcript string** | `state.transcript` | Always via `appendTranscriptDeduped` |
| **Listen timer** | `state.stt.listeningElapsedMs` + `listeningLimit.ts` | Reset on `start-listening`; `maxListeningMin=0` = off |
| **Attention level** | `copilot.config.listenAttentionLevel` | Drives cooldown / surface caps in `listenMomentTiming.ts` |
| **Current card** | `listenModeRuntime.activeCardId` + feed item | One card via `listenCardState.ts` + `filterFeedToSingleListenCard` |
| **Moment queue** | `listenModeRuntime.queuedMomentIds` | Silent overflow when card already visible |
| **Moments list** | `listenModeRuntime.moments` | Detected by `listenMomentIntelligence.ts` |
| **Media context** | `state.mediaContext` + session `app_context` events | `mediaContextExtract.ts`; no face ID |
| **Ask context** | `buildCurrentMomentContext()` | Wraps `buildActiveListeningContext` + moments + pause/stale |
| **Saved / report data** | session `saved_moment` events + `listenReport.ts` | Ad/intro excluded from report sections |
| **Runtime reset** | `listenModeRuntime.ts` | `clearListenModeRuntime()`, `prepareListenModeSession()` |

---

## Privacy guarantees

- **Mic off in Listen** — preset uses `system_audio`; `activeListeningContext` drops mic chunks when `activeMode === "listen"`.
- **System audio only** for speaker content in Listen mode.
- **No raw audio in session JSON** — audio chunks on disk for STT only; not embedded in events.
- **No base64 screenshots in session JSON** — screenshot paths/metadata only.
- **No silent upload** — send/capture requires explicit user action.
- **Stop Everything** — `clearListenModeRuntime()`, `resetListeningLimitTracking()`, pause privacy, stop copilot loop.
- **No Council** in real-time Listen ask path — `glass_direct` only.

---

## Module boundaries (target)

| Module | Role |
|--------|------|
| `glassModePresets.ts` | User-facing mode cards → internal copilot/session settings |
| `listenModeRuntime.ts` | In-memory Listen session state + reset helpers |
| `transcriptDedupe.ts` | All transcript append/dedupe/display collapse |
| `sttChunkHandler.ts` | STT ingest → dedupe → session event → append transcript |
| `activeListeningContext.ts` | Rolling transcript/media window for asks |
| `currentMomentContext.ts` | Listen-specific ask context + pause/stale |
| `activeListeningIntent.ts` | Interrupt intent classification |
| `activeListeningGuidance.ts` | Server-side ask prompt blocks |
| `listenMomentIntelligence.ts` | Moment detection + lifecycle |
| `listenMomentMaturity.ts` | Maturity scoring before surface |
| `listenMomentTiming.ts` | quiet / wait / save / surface / stale |
| `listenCardState.ts` | One-card surface decisions (pure) |
| `listenThoughtCards.ts` | Card copy / feed bodies (UI strings) |
| `listenInsightQuality.ts` | Grounded-thought validation gates |
| `listenModePersona.ts` | **Persona integration point** (proactive + interrupt + report tone) |
| `listenSegmentClassifier.ts` | ad / intro / sponsor / content |
| `listenReport.ts` | Final Listen Report markdown sections |
| `mediaContextExtract.ts` | Title / channel / URL from window |
| `listeningLimit.ts` | Max duration policy |
| `listenLiveHarness.ts` + `glass-qa-listen-live.mjs` | QA only |

**Main orchestration:** `main/index.ts` wires IPC, holds `listenModeRuntime`, calls moment pipeline after STT.

---

## File inventory (summary)

See tables in repo history / audit report. Key overlaps resolved:

| Conflict | Source of truth |
|----------|-----------------|
| Transcript dedupe | `transcriptDedupe.ts` (all append paths) |
| Proactive cards (Listen) | `processListenModeChunk` only; Copilot tick suppressed |
| One card | `listenCardState.ts` + `listenModeRuntime.activeCardId` |
| Listening limit | `listeningLimit.ts`; reset on start / Stop Everything |
| Ask context (Listen) | `buildCurrentMomentContext()` |
| Persona tone | `listenModePersona.ts` |

---

## Persona integration point

Call **`listenModePersona.ts`** from:

1. **Proactive thoughts** — `listenMomentIntelligence.generateListenThought()` → `buildListenProactiveThought()`
2. **Interrupt answers** — `activeListeningGuidance.buildActiveListeningGuidance()` → `buildListenInterruptPersonaGuidance()`
3. **Listen report** — (future) `listenReport.ts` → `buildListenReportPersonaGuidance()`

---

## Remaining work before full thought-partner persona

1. Author full persona prompt in `listenModePersona.ts`.
2. Sync server `activeListeningPrompt.ts`.
3. Live QA with BlackHole + YouTube.
4. Overlay card expand/CSS polish.

# Design to Code Pipeline

Multi-stage pipeline that turns a screenshot into code while preserving the command-bar wand + overlay card UX.

## Flow

```
Capture → Quality preflight → DesignCaptureCard
  → (optional) CodebaseStylePack after Allow
  → DesignScreenSpec (Haiku vision, no feed item)
  → Generation (submitCommand → response card)
  → Verification + max 1 repair (code actions only)
  → Structured refinement (reuses spec/pack/history)
```

Intermediate LLM stages use `askAnthropicHaikuVision` in the main process so spec and verify passes do not create extra feed cards. Only the user-facing generation uses `submitCommand`. Auto-repair uses `runDesignSilentVisualAsk` and updates the existing response card in-place (no second feed item).

## Modules

| Layer | Path | Role |
|-------|------|------|
| Types + prompts | `src/shared/design/` | `DesignScreenSpec`, `CodebaseStylePack`, prompt builders |
| Barrel | `src/shared/designToCode.ts` | Stable import path for renderer + tests |
| Capture | `src/main/design/designCaptureService.ts` | Screen capture, editor detection, quality |
| Quality | `src/main/design/designQualityAnalyzer.ts` | Heuristic preflight (no sharp) |
| Style pack | `src/main/design/designCodebaseStylePack.ts` | package.json, tailwind, siblings, imports |
| Screen spec | `src/main/design/designScreenSpecBuilder.ts` | Haiku JSON extraction |
| Generation | `src/main/design/designGenerationService.ts` | Orchestrates stages 2–5 |
| Verification | `src/main/design/designVerificationService.ts` | Fidelity check + one repair |
| Session | `src/main/design/designToCodeSessionStore.ts` | `state.designCaptures` helpers |
| UI | `src/renderer/overlay/DesignCaptureCard.tsx` | Warnings, recapture, phase labels |

## IPC

- `design-capture` — start session
- `design-recapture` — replace screenshot, clear spec/pack/history
- `design-ack-quality` — dismiss capture quality warning
- `design-generate` — run pipeline (permission gate for match-codebase)
- `design-grant-file-read` / `design-skip-file-read` — unchanged permission UX

Session state lives in `GlassState.designCaptures` keyed by capture feed item id.

## Phases

`ready` → `captured` → `awaiting_permission` (match-codebase) → `reading` → `analyzing` → `generating` → `verifying` → `done` | `failed`

Legacy `permission` maps to `awaiting_permission` in the session store.

# IIVO Glass boot sound

**Status:** Boot audio is **disabled** (`GLASS_BOOT_SOUND_ENABLED = false` in `shared/bootSound.ts`). Splash is silent until re-enabled.

**When enabled:** Web Audio synth in `glassBootSoundSynth.ts` — punchy **digital** boot (saw/square + noise + sub hits), not soft sine pads.

**Optional WAV:** drop a mastered file at `iivo-glass-boot.wav` and set `PREFER_BOOT_SYNTH = false` in `glassBootSound.ts`.

## Two sounds

1. **Boot (10s)** — engine rise, system pulse, emblem hit, tension climb.
2. **Finish** — sharp metallic “online” lock when splash hits 100%.

## Tune / preview

```bash
cd desktop-glass && npm run glass:sound-lab
```

Edit `scheduleIntelligentBoot()` and `playGlassBootCompleteSound()` in `glassBootSoundSynth.ts`.

## Disable

Set `GLASS_BOOT_SOUND_ENABLED = true` in `shared/bootSound.ts`, re-hook `useGlassBootSound()` in `LoadingBootScreen.tsx`, and use `bootSoundEnabled` / `?bootSound=1` as needed.

# IIVO Glass WIP integration plan

## WIP branch

**Branch:** `wip/glass-splash-dock-audio-panel`  
**Purpose:** Preserve experimental work without blocking stable Glass releases.

### What is inside

| Category | Contents |
|----------|----------|
| Splash / boot | `splash.html`, `src/renderer/splash/*`, boot WAV assets, boot sound scripts |
| Dock / chrome | `dockLabels.ts`, build icons, `electron.vite.config.ts`, splash entry HTML |
| Audio restore | `macAudioOutput.ts`, `startupAudioRestore.ts`, `audioRoutingReady.ts`, live meter |
| Panel redesign | `PermissionsPanel.tsx`, `PanelSection.tsx`, `DismissibleBanner.tsx` |
| Packaging | `electron-builder*.yml`, mac extend info, packaging helper scripts |
| Browser prototypes | Extension loading-screen HTML/CSS/assets |

### Must complete before merge to stable

1. **`glassSettings` fields** — `audioRoutingConfigured`, `savedMacOutputDeviceName`, panel tab model aligned with `types.ts`
2. **`main/index.ts` wiring** — audio restore hooks must compile without orphan imports
3. **Panel tab UX** — audio/setup tabs integrated with existing Panel (no broken typecheck)
4. **Splash gate** — boot screen must not block E2E; feature-flag or env skip for `IIVO_GLASS_E2E=1`
5. **Tests** — `audioRoutingReady.test.ts`, `chromeLayout.test.ts`, `glassAppIdentity.test.ts` pass on integration branch
6. **No WIP leakage** — cherry-pick one category at a time; validate after each

### Required validation before merge

```bash
npm run glass:typecheck
npm run glass:build
npm run glass:test
npm run glass:e2e:repeat
npm run glass:qa:auto
npm run glass:validate:clean -- --strict
npm run glass:git:guard:all
```

### Files / categories NOT allowed in stable commits

- `desktop-glass/release/`, `desktop-glass/out/`, `node_modules/`
- `.app`, `.dmg`, `.zip`, `.blockmap`
- Session exports, screenshots, audio recordings from QA
- `test-results/`, `playwright-report/` (unless debugging CI)

## Safe cherry-pick checklist

1. **Create integration branch from stable**
   ```bash
   git switch cleanup/focused-iivo-lens-core
   git pull origin cleanup/focused-iivo-lens-core
   git switch -c integrate/glass-splash   # one category per branch
   ```

2. **Cherry-pick one category only** (examples)
   - Splash: `src/renderer/splash/`, `splash.html`, related vite entries
   - Dock/chrome: `dockLabels.ts`, layout shared modules
   - Boot sound: scripts + `src/renderer/assets/*.wav` (if intentional)
   - Audio restore: `audioRoutingReady.ts`, `macAudioOutput.ts`, panel audio tab
   - Panel redesign: new panel components only

3. **Run validation** (see above)

4. **Guard**
   ```bash
   npm run glass:git:guard
   npm run glass:git:guard:all
   ```

5. **Commit focused category only** — never `git add .`

6. **Merge to stable only after validation** — open PR; do not merge WIP branch wholesale

## Commands

```bash
npm run glass:wip:status          # branch context + reminders
git switch wip/glass-splash-dock-audio-panel   # continue WIP work
```

See also: [GLASS_BRANCH_HYGIENE.md](./GLASS_BRANCH_HYGIENE.md)

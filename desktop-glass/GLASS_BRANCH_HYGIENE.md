# IIVO Glass branch hygiene

## Stable branch: `cleanup/focused-iivo-lens-core`

Ship-ready Glass core:

- Visual ask, microphone, system audio (BlackHole fallback)
- Session Copilot, listening limits, diagnostics
- E2E and unit tests green on a **clean** tree

**Never** run `git add .` on the stable branch. Stage files explicitly.

## WIP branch: `wip/glass-splash-dock-audio-panel`

Experimental work that must not block core releases:

- Splash / boot visuals and sound
- Dock and chrome layout redesign
- Audio restore / routing panel
- Panel redesign prototypes
- Browser-extension loading prototypes

Preserve WIP by committing on `wip/*`, not on the stable branch.

## Excluded from all commits

- `desktop-glass/release/`, `desktop-glass/out/`, `node_modules/`
- Packaged apps: `.app`, `.dmg`, `.zip`, `.blockmap`
- Session data, screenshots, audio recordings from manual QA
- `test-results/`, `playwright-report/` (unless debugging CI)

## Preserve WIP safely

```bash
git switch -c wip/my-feature
git add path/to/wip/files   # explicit paths only
git commit -m "WIP: …"
git push -u origin wip/my-feature
git switch cleanup/focused-iivo-lens-core
```

Backup patches are fine: `git diff > /tmp/glass-wip.patch`

## Validate a release-ready stable tree

```bash
git status --short          # should be empty
npm run glass:validate:clean
npm run glass:e2e:repeat
```

Strict mode fails on any dirty file:

```bash
npm run glass:validate:clean -- --strict
```

## Pre-commit guard (optional)

```bash
npm run glass:git:guard          # staged files only
npm run glass:git:guard:all      # staged + working tree (strict)
npm run glass:wip:status         # branch context reminders
```

See [WIP_INTEGRATION_PLAN.md](./WIP_INTEGRATION_PLAN.md) for safe WIP integration.

## Partial WIP and typecheck

A **dirty** tree with half-integrated modules (e.g. audio restore without settings fields) can fail `tsc`. That is expected:

1. Finish the feature on a WIP branch, or
2. Stash / commit WIP before validating stable, or
3. Run `npm run glass:validate:clean` only on a clean stable checkout

Normal local dev does **not** require a clean tree; release validation does.

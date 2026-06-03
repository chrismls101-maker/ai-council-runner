# Builder Workspace QA

Builder Mode v2 is a five-tab business asset workspace: **Compose**, **Inspect**, **Improve**, **Package**, **Execute**.

## Version persistence

- **Local:** `localStorage` key `iivo_artifact_versions_{artifactId}`
- **Server:** `data/artifact-versions/{artifactId}.json` via:
  - `GET /api/artifacts/:artifactId/versions`
  - `POST /api/artifacts/:artifactId/versions`
  - `PATCH /api/artifacts/:artifactId/versions/:versionId/restore`
- On Builder open, client merges server + local (dedupe by version id).
- Trace: `builder.versionPersistence` = `server` | `local` | `hybrid`

## Transform child artifacts

- `POST /api/artifacts/transform` returns `{ artifact, relationship }`
- **Does not** replace the parent artifact in chat or Builder focus by default.
- Child stored under `data/artifact-children/`; relationships under `data/artifact-relationships/`
- Execute tab shows success banner + Related Artifacts panel with Open / Open in Builder / Keep working on original

## Compare versions

- Improve tab → Version history → **Compare** opens modal with previous/current + line diff
- **Restore** and **Copy version** available

## Mock transform QA (no live API keys)

```bash
ARTIFACT_TRANSFORM_MOCK=1 npm run dev
npm run qa:builder:mock
```

Server uses fixtures from `mockArtifactTransforms.ts` when `ARTIFACT_TRANSFORM_MOCK=1` or `NODE_ENV=test`.

## Save / Share

- **Save:** `POST /api/artifacts/:artifactId/save` → `data/saved-artifacts/`
- **Share menu:** Copy summary, Copy export text, Copy artifact link (when `runId` exists; otherwise disabled with tooltip)

## Commands

```bash
npm run typecheck
npm run build
npm run test:builder
npm run test:builder-persistence
npm run qa:builder:mock
npm run qa:builder
```

Live visual QA (requires dev server + API keys for non-mock tests):

```bash
npm run dev
npm run qa:builder
```

Skip live provider:

```bash
ARTIFACT_QA_SKIP_LIVE=1 ARTIFACT_TRANSFORM_MOCK=1 npm run qa:builder:mock
```

## Selectors

- `builder-save`, `builder-share`, `builder-share-menu`, `share-copy-summary`
- `related-artifacts-panel`, `transform-success-banner`, `transform-open-child`, `transform-keep-original`
- `version-compare-modal`, `version-compare-{restore,copy}`
- `version-compare-{id}`, `version-restore-{id}`

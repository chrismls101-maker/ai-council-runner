# Builder Workspace QA

Builder Mode v2 is a five-tab business asset workspace: **Compose**, **Inspect**, **Improve**, **Package**, **Execute**.

## Workspace layout (Playwright)

The app has three primary surfaces QA must distinguish:

| Mode | DOM signal | How to reach |
|------|------------|--------------|
| **Landing** | `.chat-workspace.landing-mode`, region "Start a decision" | Fresh visit with no session thread |
| **Conversation** | `.chat-workspace.conversation-mode`, `.chat-thread-scroll`, `conversation-turn` | After a run or mock thread seed |
| **Builder** | `builder-canvas`, `builder-tabs`, `build-map-panel` | Click `open-in-builder` on an artifact |

Shared helpers: `tests/visual/workspaceLayoutHelpers.ts`

```ts
await bootstrapQaWorkspace(page);           // dismiss onboarding, Decision Console, composer
await seedMockConversationThread(page, []); // landing → conversation with mock artifact
await openBuilderFromTurn(page);            // conversation → builder
await navigateBuilderTab(page, "execute");  // builder tab navigation
await backToChatFromBuilder(page);
```

Boot checklist before mock QA:

1. Dismiss onboarding (`onboarding-modal` → Get started)
2. Ensure **Decision Console** sidebar (`decision-console`) — not a side panel
3. Seed `sessionStorage.iivo-conversation-thread` and reload
4. Assert **conversation-mode** (not landing hero)
5. Open Builder from artifact card (`open-in-builder`)

## Version persistence

- **Local:** `localStorage` key `iivo_artifact_versions_{artifactId}`
- **Server:** `data/artifact-versions/{artifactId}.json` via:
  - `GET /api/artifacts/:artifactId/versions`
  - `POST /api/artifacts/:artifactId/versions`
  - `PATCH /api/artifacts/:artifactId/versions/:versionId/restore` — returns `{ restoredVersion, section }` with **full section content**
- On Builder open, client merges server + local (dedupe by version id / contentHash / sectionId / createdAt).
- Trace: `builder.versionPersistence` = `server` | `local` | `hybrid`
- Trace: `builder.versionSnapshotMode` = `full` | `reference` | `metadata_only`
- Trace: `builder.versionCount`
- Restore prefers server snapshot; falls back to local if server restore fails.
- Large section snapshots (>512KB) stored in `data/artifact-version-blobs/` by reference; restore loads full content from blob.

## Compare versions (rich diff)

- Improve tab → Version history → **Compare** opens modal with previous/current
- **Table sections:** structured cell/row diff (`TableDiffView`) — added/removed rows, changed cells, totals
- **Checklist sections:** item diff (`ChecklistDiffView`) — added/removed/changed labels, checked state, notes
- **Other sections:** line/text diff fallback
- **Restore** and **Copy version** available

## Transform child artifacts

- `POST /api/artifacts/transform` returns `{ artifact, relationship }`
- **Does not** replace the parent artifact in chat or Builder focus by default.
- Child stored under `data/artifact-children/`; relationships under `data/artifact-relationships/`
- Execute tab shows success banner + Related Artifacts panel with Open / Open in Builder / Keep working on original
- **Chat thread:** `ConversationArtifactEvent` card (`child-artifact-event`) with Open / Open in Builder / Copy / Show relationship
- After transform in Builder, use **Back to Chat** to see the child artifact event in the conversation thread
- History persists child artifact references (by reference when large)

## Mock transform QA (no live API keys, no dev restart)

Mock transforms are allowed when **any** of:

- `ARTIFACT_TRANSFORM_MOCK=1` on the dev server, OR
- `NODE_ENV=test`, OR
- Request header `x-iivo-mock-transforms: 1` in local/dev (Playwright sets this automatically)

```bash
npm run dev                    # no ARTIFACT_TRANSFORM_MOCK required
npm run qa:builder:mock        # ARTIFACT_QA_SKIP_LIVE=1 + mock header via Playwright
```

Helper: `tests/visual/mockTransformHelpers.ts` → `installMockTransformHeaders(page)`

The mock header is **rejected in production** — it does not affect production behavior.

## Save / Share

- **Save:** `POST /api/artifacts/:artifactId/save` → `data/saved-artifacts/`
- **Share menu:**
  - **Create share link** — `POST /api/artifacts/:artifactId/share` → internal persistent link (`private_link` by default)
  - **Copy share link** / **Disable share link** — `GET/PATCH /api/artifacts/share/:shareId`
  - **Copy summary**, **Copy export text**
- Share links are labeled **Private link — anyone with the link may view if this app is accessible** (not public/indexed unless explicitly enabled)
- Stored under `data/artifact-shares/` with artifact snapshots in `data/artifact-share-blobs/`
- Opening `?share={shareId}` loads the artifact into conversation view (no existing session required)
- Optional public visibility: set `IIVO_ALLOW_PUBLIC_SHARE=1` on server and `VITE_IIVO_ALLOW_PUBLIC_SHARE=1` on client to show **Enable public visibility** in Share menu

## Commands

```bash
npm run typecheck
npm run build
npm run test:builder
npm run test:builder-persistence
npm run test:builder-polish
npm run qa:builder:mock
npm run qa:builder
npm run qa:daily -- --grep "@builder"
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

- `builder-save`, `builder-share`, `builder-share-menu`, `share-create-link`, `share-copy-link`, `share-copy-summary`
- `related-artifacts-panel`, `transform-success-banner`, `transform-open-child`, `transform-keep-original`
- `child-artifact-event`, `child-artifact-relationship`
- `version-compare-modal`, `version-compare-{restore,copy}`, `table-diff-view`, `checklist-diff-view`
- `version-compare-{id}`, `version-restore-{id}`

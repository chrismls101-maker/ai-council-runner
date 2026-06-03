# IIVO Image Studio QA

IIVO Image Studio is business-context visual generation inside Builder Mode — not a generic text-to-image box.

## Purpose

- Generate hero visuals, ad creatives, product renders, proposal covers, image packs, and more from the artifact you are building
- Build an editable image brief before any generation
- Store images by reference (`/api/images/:id/file`), not in session storage
- Optional visual QA when image vision is enabled and explicitly requested

## Environment

```bash
IMAGE_GENERATION_ENABLED=false   # mock provider used in dev/tests when live provider not configured
IMAGE_GENERATION_PROVIDER=openai # advanced provider selection
IMAGE_GENERATION_MODEL=          # e.g. dall-e-3 for OpenAI
IMAGE_GENERATION_CREDITS=3
OPENAI_API_KEY=                  # required for live OpenAI image generation

IMAGE_VISION_ENABLED=false       # optional visual QA for generated images
IMAGE_VISION_QA_CREDITS=1        # add-on credits when visual QA runs
IMAGE_VISION_QA_MOCK=1           # force mock visual QA in tests
```

Playwright sets `x-iivo-mock-images: 1` so mock generation works without restarting dev. Mock visual QA uses `x-iivo-mock-vision-qa: 1`.

Provider names appear only in Advanced / Configure settings — the product surface says **IIVO Image Studio**.

## Live provider setup

1. Set `IMAGE_GENERATION_ENABLED=true`
2. Set `IMAGE_GENERATION_PROVIDER=openai`
3. Provide `OPENAI_API_KEY`
4. Optional: set `IMAGE_GENERATION_MODEL=dall-e-3`
5. `GET /api/images/config` returns `configured: true` when ready

When enabled but not configured, the API reports `configured: false` with a reason and generation falls back to the IIVO mock provider in non-production.

Google, Replicate, Stability, and local providers return honest “not implemented / not configured” messages — they are not faked as working.

## Mock provider setup

- Default in dev when `IMAGE_GENERATION_ENABLED=false`
- Playwright header: `x-iivo-mock-images: 1`
- `NODE_ENV=test` always uses mock for unit tests

## Builder entry points

| Location | Signal |
|----------|--------|
| Builder tab | `builder-tab-visuals`, `builder-visuals-panel` |
| Single / pack modes | `image-studio-mode-single`, `image-studio-mode-pack` |
| Inline artifact | `generate-visual-inline` |
| Contextual actions | `image-action-*` buttons in Image Studio panel |
| Proposal cover | `image-action-proposal-cover` |

## Image pack workflow

1. Switch to **Image pack** mode (`image-pack-builder`)
2. Select pack type (product render, ad creative, social, hero variants, brand system)
3. Choose count 2–4, aspect ratio, style consistency
4. Edit shared brief and per-image variation notes (angle, background, lighting, composition, use case)
5. Click **Generate pack** explicitly
6. Use result grid actions: download, copy prompt, regenerate one, mark favorite, attach selected

Pack credits = count × `IMAGE_GENERATION_CREDITS` (+ optional visual QA add-on).

## Proposal cover QA

Daily Driver scenario: `vision-proposal-cover`

- Visual need: `proposal_cover`
- Generic consulting proposal prompts should not trigger IP warnings
- Mock generation, download, attach, and quality panel are expected

## Vision QA behavior

- Deterministic scoring always runs after generation
- Optional visual QA runs only when:
  - User checks “Optional visual QA” in UI, or `runVisionQa: true` in API
  - Vision is enabled (`IMAGE_VISION_ENABLED`) or mock header is set
  - Generated image file is available
- Trace fields: `visionQaRan`, `visionQaProvider`, `visionQaFindings`, `visionQaWarnings`
- UI: `image-visual-qa-section` inside `image-quality-panel`

## PDF with images

- `downloadArtifactPdf` embeds `preview` sections and `/api/images/.../file` references
- Respects aspect ratio within page bounds
- Includes caption / prompt metadata when available
- Missing images show placeholder: “Image could not be embedded.”
- Text-only artifacts still export normally

## IP guardrails

- Brief editor shows caution copy about copyrighted characters, logos, and brand replicas
- Risky prompts trigger `image-ip-warning`
- Server rewrites “in the style of …” into original descriptors via `imageIpGuard.ts`
- Competitor/product names are not used as IIVO feature names

## Credit behavior

- Estimate shown before Generate (`image-credit-estimate`, `image-pack-credit-estimate`)
- Single image: `IMAGE_GENERATION_CREDITS`
- Pack: count × credits per image
- Visual QA add-on: `IMAGE_VISION_QA_CREDITS` when it runs
- Insufficient credits → HTTP 402
- Credits deducted only after successful generation (failed provider calls do not deduct)

## Commands

```bash
npm run typecheck
npm run test:images
npm run qa:images
npm run qa:images:mock
npm run qa:images:live   # optional live provider smoke (IMAGE_QA_LIVE=1)
```

## Manual checklist

1. Open Builder on a cold email or landing page artifact
2. Open **Image Studio** tab
3. Confirm brief is generated with purpose, audience, style
4. Confirm credit estimate appears before Generate
5. Click **Generate visual** — result grid appears
6. Use Download PNG, Copy prompt, Attach to artifact
7. Switch to Image pack — generate 2–4 images, attach selected
8. Select Proposal cover — generate and verify quality panel
9. Export PDF on artifact with attached visual — no crash
10. Reload — conversation thread should not contain base64 image data
11. Enter a brand-copy prompt — IP warning appears

## Selectors

- `image-studio-panel`, `image-brief-editor`, `image-brief-prompt`
- `image-generate-button`, `image-credit-estimate`, `image-result-grid`
- `image-pack-builder`, `image-pack-count`, `image-pack-generate-button`, `image-pack-result-grid`
- `image-download-png`, `image-copy-prompt`, `image-attach-to-artifact`
- `image-ip-warning`, `image-quality-panel`, `image-visual-qa-section`
- `image-action-proposal-cover`, `image-provider-status`

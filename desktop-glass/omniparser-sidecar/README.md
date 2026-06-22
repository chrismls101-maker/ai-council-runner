# OmniParser sidecar (Spike 2 + 3)

Local HTTP service for **Companion UI region detection** using Microsoft OmniParser v2 weights.

**Architecture:** [`../GLASS_COMPANION_OMNIPARSER.md`](../GLASS_COMPANION_OMNIPARSER.md)

## User flow (recommended)

1. Open Glass **Panel → Installations**
2. Click **Install OmniParser**
3. Terminal opens → press **Enter** to confirm download
4. Toggle **Companion** on the strip — detection runs automatically

No `.env` flags needed after install. Companion works without this; OmniParser adds extra marks when Accessibility is sparse.

## Developer commands

```bash
cd desktop-glass/omniparser-sidecar
./install-models.sh      # one-time, non-interactive
./verify.sh              # automated health check
./start.sh               # manual sidecar (debug only)
```

Interactive install (same as Panel button):

```bash
./install-with-confirm.sh
```

## Disable

Add to `desktop-glass/.env`:

```
IIVO_COMPANION_OMNI_PARSER=0
IIVO_OMNIPARSER_SPAWN=0
```

## Performance

| Phase | Time |
|-------|------|
| First model load (after Companion ON) | ~20–30s |
| Warm parse | ~1.4s |

## License

Ultralytics YOLO (AGPL-3.0). Weights: [microsoft/OmniParser-v2.0](https://huggingface.co/microsoft/OmniParser-v2.0).

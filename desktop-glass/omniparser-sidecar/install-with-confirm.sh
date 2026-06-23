#!/usr/bin/env bash
# Interactive install — Glass terminal opens this; user presses Enter to proceed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  OmniParser v2 — Companion UI region detection"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  • Downloads ~80MB detection weights from Hugging Face"
echo "  • Installs Python deps into omniparser-sidecar/.venv"
echo "  • Takes a few minutes on first run"
echo ""
echo "  After install, Companion uses this automatically — no"
echo "  extra setup. Restart Glass if it was already running."
echo ""
printf "  Press Enter to install (Ctrl+C to cancel)... "
read -r
echo ""

cd "$ROOT"
chmod +x install-models.sh start.sh verify.sh 2>/dev/null || true
exec ./install-models.sh

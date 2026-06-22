#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${ROOT}/.venv"
WITH_CAPTION=0

for arg in "$@"; do
  case "$arg" in
    --caption) WITH_CAPTION=1 ;;
    --help|-h)
      echo "Usage: ./install-models.sh [--caption]"
      echo "  Downloads microsoft/OmniParser-v2.0 weights into omniparser-sidecar/models/"
      exit 0
      ;;
  esac
done

cd "$ROOT"

if [[ ! -d "$VENV" ]]; then
  echo "Creating sidecar venv…"
  python3 -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

python -m pip install -q -r requirements.txt

echo "Downloading OmniParser v2 detection weights…"
python download_models.py --detection

if [[ "$WITH_CAPTION" == "1" ]]; then
  echo "Downloading Florence caption weights (large, ~1GB+)…"
  python download_models.py --caption
fi

echo "Done. Weights in: ${ROOT}/models/"
echo "Start sidecar: ./start.sh"

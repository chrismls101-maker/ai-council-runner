#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${IIVO_OMNIPARSER_PORT:-8765}"
HOST="${IIVO_OMNIPARSER_HOST:-127.0.0.1}"
VENV="${ROOT}/.venv"

cd "$ROOT"

if [[ ! -d "$VENV" ]]; then
  echo "Creating sidecar venv…"
  python3 -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

if ! python -c "import fastapi, uvicorn, ultralytics" 2>/dev/null; then
  echo "Installing sidecar dependencies…"
  python -m pip install -r requirements.txt
fi

export MPLCONFIGDIR="${ROOT}/.matplotlib"
mkdir -p "$MPLCONFIGDIR"

echo "OmniParser sidecar → http://${HOST}:${PORT}"
if [[ -f "${ROOT}/models/icon_detect/model.pt" ]]; then
  echo "Mode: real detection (weights found; model loads in background)"
else
  echo "Mode: mock (run ./install-models.sh for real detection)"
fi
exec python -m uvicorn server:app --host "$HOST" --port "$PORT"

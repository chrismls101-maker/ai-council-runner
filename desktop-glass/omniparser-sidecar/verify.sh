#!/usr/bin/env bash
# End-to-end verification for the OmniParser sidecar (run from omniparser-sidecar/).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${IIVO_OMNIPARSER_PORT:-8765}"
HOST="${IIVO_OMNIPARSER_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}"
VENV="${ROOT}/.venv"

cd "$ROOT"

echo "== OmniParser sidecar verify =="

if [[ ! -d "$VENV" ]]; then
  echo "FAIL: .venv missing — run ./install-models.sh first"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

echo "1/4 Python unit tests…"
python -m unittest test_parser.py -v

echo "2/4 Model weights…"
if [[ -f "${ROOT}/models/icon_detect/model.pt" ]]; then
  echo "  ✓ detection weights present"
else
  echo "  ⚠ no weights (mock mode only) — run ./install-models.sh"
fi

echo "3/4 Start sidecar…"
lsof -ti:"${PORT}" | xargs kill -9 2>/dev/null || true
export MPLCONFIGDIR="${ROOT}/.matplotlib"
mkdir -p "$MPLCONFIGDIR"
./start.sh &
SIDECAR_PID=$!

cleanup() {
  kill "$SIDECAR_PID" 2>/dev/null || true
  wait "$SIDECAR_PID" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 20); do
  if curl -sf "${URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

HEALTH="$(curl -sf "${URL}/health")"
echo "  health: ${HEALTH}"

echo "4/4 POST /v1/parse…"
python3 <<'PY'
import base64, io, json, sys, time, urllib.request
from PIL import Image, ImageDraw

img = Image.new("RGB", (800, 600), color=(240, 240, 240))
draw = ImageDraw.Draw(img)
for x, y in [(50, 50), (300, 50), (550, 50), (50, 300)]:
    draw.rectangle([x, y, x + 120, y + 40], fill=(70, 130, 220), outline=(0, 0, 0))
buf = io.BytesIO()
img.save(buf, format="JPEG")
payload = json.dumps({
    "imageBase64": base64.b64encode(buf.getvalue()).decode(),
    "width": 800,
    "height": 600,
    "maxMarks": 24,
    "minConfidence": 0.15,
}).encode()

# First parse may wait for YOLO cold load.
deadline = time.time() + 60
last_err = None
while time.time() < deadline:
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8765/v1/parse",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read())
        print(f"  modelVersion: {data.get('modelVersion')}")
        print(f"  latencyMs: {data.get('latencyMs')}")
        print(f"  marks: {len(data.get('marks', []))}")
        if data.get("marks"):
            m = data["marks"][0]
            print(f"  sample: {m['id']} {m['label']} conf={m['confidence']}")
        sys.exit(0)
    except Exception as exc:
        last_err = exc
        time.sleep(2)

print(f"FAIL: parse did not succeed: {last_err}", file=sys.stderr)
sys.exit(1)
PY

echo ""
echo "✓ All checks passed"

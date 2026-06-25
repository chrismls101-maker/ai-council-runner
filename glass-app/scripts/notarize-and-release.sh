#!/usr/bin/env bash
# IIVO Glass — signed build, notarize, staple, latest-mac-{arch}.yml, GitHub release upload.
#
# Usage (from desktop-glass/):
#   ./scripts/notarize-and-release.sh 0.1.12           # arm64 + x64 (default)
#   ./scripts/notarize-and-release.sh 0.1.12 arm64     # arm64 only
#   ./scripts/notarize-and-release.sh 0.1.12 x64       # x64 only
#   ./scripts/notarize-and-release.sh 0.1.12 arm64 x64 # explicit both
#
# Prerequisites:
#   - macOS with Xcode CLT (codesign, notarytool, stapler)
#   - Developer ID cert in keychain
#   - notarytool profile: xcrun notarytool store-credentials iivo-notary ...
#   - gh auth login
#   - npm ci / deps installed

set -euo pipefail

VERSION="${1:-}"
shift || true

# Remaining args are the arches to build. Default: arm64 x64.
ARCHES=("$@")
if [[ ${#ARCHES[@]} -eq 0 ]]; then
  ARCHES=("arm64" "x64")
fi

NOTARY_PROFILE="${IIVO_NOTARY_PROFILE:-iivo-notary}"
GH_OWNER="${IIVO_GITHUB_OWNER:-chrismls101-maker}"
GH_REPO="${IIVO_GITHUB_REPO:-ai-council-runner}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLASS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$GLASS_ROOT/release"
BUILD_CONFIG="$GLASS_ROOT/electron-builder.release.tmp.yml"
ASSETS_TMP="$GLASS_ROOT/.release-assets.tmp"

die() {
  echo "ERROR: $*" >&2
  rm -f "$BUILD_CONFIG" "$ASSETS_TMP"
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

sha512_base64() {
  openssl dgst -sha512 -binary "$1" | openssl base64 -A
}

file_size() {
  stat -f%z "$1"
}

notarize_and_staple() {
  local artifact="$1"
  local label="$2"
  echo "==> Notarizing $label: $artifact"
  xcrun notarytool submit "$artifact" --keychain-profile "$NOTARY_PROFILE" --wait \
    || die "notarytool submit failed for $label ($artifact)"
  echo "==> Stapling $label"
  xcrun stapler staple "$artifact" \
    || die "stapler staple failed for $label ($artifact)"
  xcrun stapler validate "$artifact" \
    || die "stapler validate failed for $label ($artifact)"
}

generate_squirrel_blockmap() {
  local zip_path="$1"
  local blockmap_path="$2"
  echo "==> Generating blockmap for $(basename "$zip_path")"
  node -e "
    const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');
    buildBlockMap(process.argv[1], 'gzip', process.argv[2])
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); });
  " "$zip_path" "$blockmap_path" \
    || die "blockmap generation failed for $zip_path"
}

# Write latest-mac-{arch}.yml for a single arch.
# $1 = version, $2 = arch (arm64 | x64 | universal)
write_latest_mac_yml_arch() {
  local version="$1"
  local arch="$2"
  local zip_name="IIVO-Glass-${version}-${arch}-mac.zip"
  local dmg_name="IIVO-Glass-${version}-${arch}.dmg"
  local zip_path="$RELEASE_DIR/$zip_name"
  local dmg_path="$RELEASE_DIR/$dmg_name"
  local yml_path="$RELEASE_DIR/latest-mac-${arch}.yml"
  local zip_sha zip_size dmg_sha dmg_size release_date

  [[ -f "$zip_path" ]] || die "Missing zip for latest-mac-${arch}.yml: $zip_path"
  [[ -f "$dmg_path" ]] || die "Missing dmg for latest-mac-${arch}.yml: $dmg_path"

  zip_sha="$(sha512_base64 "$zip_path")"
  zip_size="$(file_size "$zip_path")"
  dmg_sha="$(sha512_base64 "$dmg_path")"
  dmg_size="$(file_size "$dmg_path")"
  release_date="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

  cat >"$yml_path" <<EOF
version: ${version}
files:
  - url: ${zip_name}
    sha512: ${zip_sha}
    size: ${zip_size}
  - url: ${dmg_name}
    sha512: ${dmg_sha}
    size: ${dmg_size}
path: ${zip_name}
sha512: ${zip_sha}
releaseDate: '${release_date}'
EOF

  echo "==> Wrote $yml_path"
}

verify_latest_mac_yml_arch() {
  local version="$1"
  local arch="$2"
  local zip_name="IIVO-Glass-${version}-${arch}-mac.zip"
  local zip_path="$RELEASE_DIR/$zip_name"
  local yml_path="$RELEASE_DIR/latest-mac-${arch}.yml"
  local zip_sha zip_size yml_sha yml_size yml_path_field

  [[ -f "$zip_path" ]] || die "Missing zip for verification: $zip_path"
  [[ -f "$yml_path" ]] || die "Missing latest-mac-${arch}.yml for verification: $yml_path"

  zip_sha="$(sha512_base64 "$zip_path")"
  zip_size="$(file_size "$zip_path")"
  yml_path_field="$(awk '/^path: / { print $2; exit }' "$yml_path")"
  yml_sha="$(awk '/^sha512: / { print $2; exit }' "$yml_path")"
  yml_size="$(awk '/^  - url: '"${zip_name}"'$/{found=1} found && /^    size: / { print $2; exit }' "$yml_path")"

  [[ "$yml_path_field" == "$zip_name" ]] \
    || die "latest-mac-${arch}.yml path must be ${zip_name} (got: ${yml_path_field:-<missing>})"
  [[ "$yml_sha" == "$zip_sha" ]] \
    || die "latest-mac-${arch}.yml sha512 mismatch for ${zip_name}"
  [[ "$yml_size" == "$zip_size" ]] \
    || die "latest-mac-${arch}.yml size mismatch for ${zip_name} (yml=${yml_size:-<missing>} zip=${zip_size})"

  echo "==> Verified latest-mac-${arch}.yml matches ${zip_name} (sha512 + size)"
}

assert_squirrel_zip_is_ditto_build() {
  local version="$1"
  local arch="$2"
  local squirrel_zip="$RELEASE_DIR/IIVO-Glass-${version}-${arch}-mac.zip"
  local space_zip="$RELEASE_DIR/IIVO Glass-${version}-${arch}-mac.zip"

  [[ -f "$squirrel_zip" ]] || die "Missing ditto Squirrel zip: $squirrel_zip"

  if [[ -f "$space_zip" ]]; then
    local squirrel_sha space_sha
    squirrel_sha="$(sha512_base64 "$squirrel_zip")"
    space_sha="$(sha512_base64 "$space_zip")"
    if [[ "$squirrel_sha" == "$space_sha" ]]; then
      die "Squirrel ${arch} zip bytes match electron-builder space zip — expected ditto-built zip at $squirrel_zip"
    fi
    echo "==> Confirmed Squirrel ${arch} zip differs from electron-builder space zip (ditto build OK)"
  fi
}

# Build, notarize, and produce all release artifacts for one arch.
# Appends asset paths to $ASSETS_TMP.
build_arch() {
  local arch="$1"
  echo ""
  echo "======================================================="
  echo "  Building IIVO Glass ${VERSION} — ${arch}"
  echo "======================================================="

  local SPACE_DMG="$RELEASE_DIR/IIVO Glass-${VERSION}-${arch}.dmg"
  # electron-builder outputs the native arch to release/mac/ (not release/mac-{arch}/)
  # Cross-compiled arches go to release/mac-{arch}/ as expected.
  local APP="$RELEASE_DIR/mac-${arch}/IIVO Glass.app"
  if [[ ! -d "$APP" ]] && [[ -d "$RELEASE_DIR/mac/IIVO Glass.app" ]]; then
    APP="$RELEASE_DIR/mac/IIVO Glass.app"
    echo "==> Note: app found at release/mac/ (native arch fallback for ${arch})"
  fi
  local HYPHEN_DMG="$RELEASE_DIR/IIVO-Glass-${VERSION}-${arch}.dmg"
  # Squirrel auto-update must use the notarized ditto zip (hyphenated) — never
  # the electron-builder space-named zip.
  local SQUIRREL_ZIP="$RELEASE_DIR/IIVO-Glass-${VERSION}-${arch}-mac.zip"
  local SQUIRREL_BLOCKMAP="${SQUIRREL_ZIP}.blockmap"
  local YML="$RELEASE_DIR/latest-mac-${arch}.yml"

  echo "==> electron-builder --${arch} (sign only; notarize via notarytool)"
  npx electron-builder --mac "--${arch}" --config "$BUILD_CONFIG" --publish never \
    || die "electron-builder failed for ${arch}"

  [[ -f "$SPACE_DMG" ]] || die "Expected DMG not found after build: $SPACE_DMG"
  [[ -d "$APP" ]] || die "Expected app bundle not found: $APP"

  echo "==> Copying DMG to hyphenated GitHub asset name"
  cp "$SPACE_DMG" "$HYPHEN_DMG"

  echo "==> Building Squirrel zip with ditto (hyphenated: $(basename "$SQUIRREL_ZIP"))"
  ditto -c -k --keepParent "$APP" "$SQUIRREL_ZIP" \
    || die "ditto failed to create $SQUIRREL_ZIP"

  notarize_and_staple "$HYPHEN_DMG" "DMG (${arch})"

  echo "==> Notarizing Squirrel zip (${arch})"
  xcrun notarytool submit "$SQUIRREL_ZIP" --keychain-profile "$NOTARY_PROFILE" --wait \
    || die "notarytool submit failed for zip (${arch})"

  # Staple the notarization ticket to the .app directly, then recreate the zip
  # so Gatekeeper can verify offline (without internet). Without this step,
  # ShipIt errors with a code-signature failure and Squirrel falls back to DMG.
  echo "==> Stapling notarization ticket to .app (${arch})"
  xcrun stapler staple "$APP" \
    || die "stapler staple failed for app (${arch})"
  xcrun stapler validate "$APP" \
    || die "stapler validate failed for app (${arch})"

  echo "==> Recreating Squirrel zip with stapled .app (${arch})"
  rm -f "$SQUIRREL_ZIP"
  ditto -c -k --keepParent "$APP" "$SQUIRREL_ZIP" \
    || die "ditto failed to recreate $SQUIRREL_ZIP after stapling"

  generate_squirrel_blockmap "$SQUIRREL_ZIP" "$SQUIRREL_BLOCKMAP"

  write_latest_mac_yml_arch "$VERSION" "$arch"
  verify_latest_mac_yml_arch "$VERSION" "$arch"
  assert_squirrel_zip_is_ditto_build "$VERSION" "$arch"

  # Accumulate release assets.
  printf '%s\n' "$SQUIRREL_ZIP" "$SQUIRREL_BLOCKMAP" "$HYPHEN_DMG" "$YML" >> "$ASSETS_TMP"
  echo "==> ${arch} complete"
}

# ── Validation ───────────────────────────────────────────────────────────────

[[ -n "$VERSION" ]] || die "Usage: $0 <version> [arch...]
  e.g. $0 0.1.12
       $0 0.1.12 arm64
       $0 0.1.12 arm64 x64"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] \
  || die "Invalid version: $VERSION (expected semver like 0.1.12)"

for arch in "${ARCHES[@]}"; do
  [[ "$arch" == "arm64" || "$arch" == "x64" || "$arch" == "universal" ]] \
    || die "Unknown arch '$arch' — supported values: arm64  x64  universal"
done

need_cmd npm
need_cmd npx
need_cmd node
need_cmd gh
need_cmd xcrun
need_cmd openssl
need_cmd stat

echo "==> Checking gh auth"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"

echo "==> Building arches: ${ARCHES[*]}"

cd "$GLASS_ROOT"

# Pull SENTRY_DSN from root .env if present (don't fail if missing).
SENTRY_DSN_VAL="$(grep SENTRY_DSN "$(dirname "$0")/../../.env" 2>/dev/null | cut -d '=' -f2- || true)"
export SENTRY_DSN="$SENTRY_DSN_VAL"

echo "==> Setting package.json version to $VERSION"
node -e "
const fs = require('fs');
const p = 'package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.version = process.argv[1];
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
" "$VERSION"

echo "==> Building renderer + main (electron-vite)"
npm run build || die "npm run build failed"

echo "==> Preparing electron-builder config (code-sign only; notarize via notarytool below)"
cp "$GLASS_ROOT/electron-builder.signed.yml" "$BUILD_CONFIG"
if grep -q 'notarize: true' "$BUILD_CONFIG"; then
  sed -i '' 's/notarize: true/notarize: false/' "$BUILD_CONFIG"
fi

# Reset accumulator.
rm -f "$ASSETS_TMP"
touch "$ASSETS_TMP"

# ── Per-arch build + notarize loop ────────────────────────────────────────────
for ARCH in "${ARCHES[@]}"; do
  build_arch "$ARCH"
done

rm -f "$BUILD_CONFIG"

# ── Backward-compat latest-mac.yml ───────────────────────────────────────────
# electron-updater on arm64 Macs prefers latest-mac-arm64.yml but falls back to
# latest-mac.yml. Keep latest-mac.yml = arm64 so existing auto-update clients
# (all currently arm64) are not disrupted by this release.
# If this is an x64-only release, skip the backward-compat copy.
if printf '%s\n' "${ARCHES[@]}" | grep -qx 'arm64'; then
  echo ""
  echo "==> Copying latest-mac-arm64.yml → latest-mac.yml (backward-compat)"
  cp "$RELEASE_DIR/latest-mac-arm64.yml" "$RELEASE_DIR/latest-mac.yml"
  echo "$RELEASE_DIR/latest-mac.yml" >> "$ASSETS_TMP"
fi

# ── Update manifests ──────────────────────────────────────────────────────────
echo ""
echo "==> Writing glass-update-manifest.json"
node scripts/write-glass-update-manifest.mjs || die "write-glass-update-manifest.mjs failed"

# ── GitHub release ────────────────────────────────────────────────────────────
TAG="v${VERSION}"
ARCH_LABEL="$(IFS=+; echo "${ARCHES[*]}")"
RELEASE_TITLE="IIVO Glass ${VERSION} — ${ARCH_LABEL}"
RELEASE_NOTES="IIVO Glass v${VERSION} signed, notarized, and stapled for macOS (${ARCH_LABEL})."

# Read accumulated asset paths (bash 3 compatible — no mapfile).
RELEASE_ASSETS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && RELEASE_ASSETS+=("$line")
done < "$ASSETS_TMP"
rm -f "$ASSETS_TMP"

echo ""
echo "==> Publishing GitHub release ${TAG} (arches: ${ARCH_LABEL})"
for asset in "${RELEASE_ASSETS[@]}"; do
  [[ -f "$asset" ]] || die "Missing release asset before upload: $asset"
  echo "    - $(basename "$asset")"
done

if gh release view "$TAG" --repo "${GH_OWNER}/${GH_REPO}" >/dev/null 2>&1; then
  echo "    Release $TAG exists — uploading (--clobber)"
  gh release upload "$TAG" \
    --repo "${GH_OWNER}/${GH_REPO}" \
    --clobber \
    "${RELEASE_ASSETS[@]}" \
    || die "gh release upload failed"
else
  gh release create "$TAG" \
    --repo "${GH_OWNER}/${GH_REPO}" \
    --title "$RELEASE_TITLE" \
    --notes "$RELEASE_NOTES" \
    "${RELEASE_ASSETS[@]}" \
    || die "gh release create failed"
fi

RELEASE_URL="https://github.com/${GH_OWNER}/${GH_REPO}/releases/tag/${TAG}"
echo ""
echo "SUCCESS: IIVO Glass v${VERSION} released (${ARCH_LABEL})"
echo "  ${RELEASE_URL}"
for asset in "${RELEASE_ASSETS[@]}"; do
  echo "  $(basename "$asset")"
done

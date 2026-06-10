#!/usr/bin/env bash
# IIVO Glass — signed build, notarize, staple, latest-mac.yml, GitHub release upload.
#
# Usage (from desktop-glass/):
#   ./scripts/notarize-and-release.sh 0.1.12
#
# Prerequisites:
#   - macOS with Xcode CLT (codesign, notarytool, stapler)
#   - Developer ID cert in keychain
#   - notarytool profile: xcrun notarytool store-credentials iivo-notary ...
#   - gh auth login
#   - npm ci / deps installed

set -euo pipefail

VERSION="${1:-}"
NOTARY_PROFILE="${IIVO_NOTARY_PROFILE:-iivo-notary}"
GH_OWNER="${IIVO_GITHUB_OWNER:-chrismls101-maker}"
GH_REPO="${IIVO_GITHUB_REPO:-ai-council-runner}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLASS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$GLASS_ROOT/release"
BUILD_CONFIG="$GLASS_ROOT/electron-builder.release.tmp.yml"

die() {
  echo "ERROR: $*" >&2
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

verify_latest_mac_yml() {
  local version="$1"
  local zip_name="IIVO-Glass-${version}-arm64-mac.zip"
  local zip_path="$RELEASE_DIR/$zip_name"
  local yml_path="$RELEASE_DIR/latest-mac.yml"
  local zip_sha zip_size yml_sha yml_size yml_path_field

  [[ -f "$zip_path" ]] || die "Missing Squirrel zip for verification: $zip_path"
  [[ -f "$yml_path" ]] || die "Missing latest-mac.yml for verification: $yml_path"

  zip_sha="$(sha512_base64 "$zip_path")"
  zip_size="$(file_size "$zip_path")"
  yml_path_field="$(awk '/^path: / { print $2; exit }' "$yml_path")"
  yml_sha="$(awk '/^sha512: / { print $2; exit }' "$yml_path")"
  yml_size="$(awk '/^  - url: '"${zip_name}"'$/{found=1} found && /^    size: / { print $2; exit }' "$yml_path")"

  [[ "$yml_path_field" == "$zip_name" ]] \
    || die "latest-mac.yml path must be ${zip_name} (got: ${yml_path_field:-<missing>})"
  [[ "$yml_sha" == "$zip_sha" ]] \
    || die "latest-mac.yml sha512 mismatch for ${zip_name}"
  [[ "$yml_size" == "$zip_size" ]] \
    || die "latest-mac.yml size mismatch for ${zip_name} (yml=${yml_size:-<missing>} zip=${zip_size})"

  echo "==> Verified latest-mac.yml matches ${zip_name} (sha512 + size)"
}

assert_squirrel_zip_is_ditto_build() {
  local version="$1"
  local squirrel_zip="$RELEASE_DIR/IIVO-Glass-${version}-arm64-mac.zip"
  local space_zip="$RELEASE_DIR/IIVO Glass-${version}-arm64-mac.zip"

  [[ -f "$squirrel_zip" ]] || die "Missing ditto Squirrel zip: $squirrel_zip"

  if [[ -f "$space_zip" ]]; then
    local squirrel_sha space_sha
    squirrel_sha="$(sha512_base64 "$squirrel_zip")"
    space_sha="$(sha512_base64 "$space_zip")"
    if [[ "$squirrel_sha" == "$space_sha" ]]; then
      die "Squirrel zip bytes match electron-builder space zip — expected ditto-built zip at $squirrel_zip"
    fi
    echo "==> Confirmed Squirrel zip differs from electron-builder space zip (ditto build OK)"
  fi
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

notarize_and_staple() {
  local artifact="$1"
  local label="$2"
  echo "==> Notarizing $label: $artifact"
  xcrun notarytool submit "$artifact" --keychain-profile "$NOTARY_PROFILE" --wait \
    || die "notarytool submit failed for $label ($artifact)"
  echo "==> Stapling $label"
  if xcrun stapler staple "$artifact"; then
    xcrun stapler validate "$artifact" \
      || die "stapler validate failed for $label ($artifact)"
  else
    die "stapler staple failed for $label ($artifact)"
  fi
}

write_latest_mac_yml() {
  local version="$1"
  local zip_name="IIVO-Glass-${version}-arm64-mac.zip"
  local dmg_name="IIVO-Glass-${version}-arm64.dmg"
  local zip_path="$RELEASE_DIR/$zip_name"
  local dmg_path="$RELEASE_DIR/$dmg_name"
  local yml_path="$RELEASE_DIR/latest-mac.yml"
  local zip_sha zip_size dmg_sha dmg_size release_date

  [[ -f "$zip_path" ]] || die "Missing zip for latest-mac.yml: $zip_path"
  [[ -f "$dmg_path" ]] || die "Missing dmg for latest-mac.yml: $dmg_path"

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

[[ -n "$VERSION" ]] || die "Usage: $0 <version>   e.g. $0 0.1.12"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] \
  || die "Invalid version: $VERSION (expected semver like 0.1.12)"

need_cmd npm
need_cmd npx
need_cmd node
need_cmd gh
need_cmd xcrun
need_cmd openssl
need_cmd stat

echo "==> Checking gh auth"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"

cd "$GLASS_ROOT"

export SENTRY_DSN=$(grep SENTRY_DSN "$(dirname "$0")/../../.env" | cut -d '=' -f2-)

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

echo "==> Preparing electron-builder config (sign only; notarize via notarytool)"
cp "$GLASS_ROOT/electron-builder.signed.yml" "$BUILD_CONFIG"
if grep -q 'notarize: true' "$BUILD_CONFIG"; then
  sed -i '' 's/notarize: true/notarize: false/' "$BUILD_CONFIG"
fi

echo "==> Packaging signed macOS dmg + zip (no auto-publish — upload is explicit below)"
npx electron-builder --mac --config "$BUILD_CONFIG" --publish never \
  || die "electron-builder failed"

rm -f "$BUILD_CONFIG"

SPACE_DMG="$RELEASE_DIR/IIVO Glass-${VERSION}-arm64.dmg"
SPACE_ZIP="$RELEASE_DIR/IIVO Glass-${VERSION}-arm64-mac.zip"
APP="$RELEASE_DIR/mac-arm64/IIVO Glass.app"
HYPHEN_DMG="$RELEASE_DIR/IIVO-Glass-${VERSION}-arm64.dmg"
# Squirrel auto-update must use the notarized ditto zip (hyphenated) — never the
# electron-builder space-named zip (IIVO Glass-…-arm64-mac.zip).
SQUIRREL_ZIP="$RELEASE_DIR/IIVO-Glass-${VERSION}-arm64-mac.zip"
SQUIRREL_BLOCKMAP="$RELEASE_DIR/IIVO-Glass-${VERSION}-arm64-mac.zip.blockmap"

[[ -f "$SPACE_DMG" ]] || die "Expected dmg not found: $SPACE_DMG"
[[ -d "$APP" ]] || die "Expected app bundle not found: $APP"

echo "==> Copying release artifacts to GitHub asset names (hyphenated)"
cp "$SPACE_DMG" "$HYPHEN_DMG"

echo "==> Building Squirrel zip with ditto (hyphenated: $(basename "$SQUIRREL_ZIP"))"
ditto -c -k --keepParent "$APP" "$SQUIRREL_ZIP" \
  || die "ditto failed to create $SQUIRREL_ZIP"

if [[ -f "$SPACE_ZIP" ]]; then
  echo "    (electron-builder zip $(basename "$SPACE_ZIP") is not uploaded — Squirrel uses ditto zip only)"
fi

notarize_and_staple "$HYPHEN_DMG" "DMG"

echo "==> Notarizing ZIP: $SQUIRREL_ZIP"
xcrun notarytool submit "$SQUIRREL_ZIP" --keychain-profile "$NOTARY_PROFILE" --wait \
  || die "notarytool submit failed for ZIP ($SQUIRREL_ZIP)"

generate_squirrel_blockmap "$SQUIRREL_ZIP" "$SQUIRREL_BLOCKMAP"

echo "==> Writing latest-mac.yml (SHA512 of notarized ditto zip: $(basename "$SQUIRREL_ZIP"))"
write_latest_mac_yml "$VERSION"
verify_latest_mac_yml "$VERSION"
assert_squirrel_zip_is_ditto_build "$VERSION"

echo "==> Writing glass-update-manifest.json"
node scripts/write-glass-update-manifest.mjs || die "write-glass-update-manifest.mjs failed"

TAG="v${VERSION}"
RELEASE_TITLE="IIVO Glass ${VERSION} — Apple Silicon Beta"
RELEASE_NOTES="IIVO Glass v${VERSION} signed, notarized, and stapled for macOS auto-update."

# GitHub upload: hyphenated ditto zip only — never "IIVO Glass-…-arm64-mac.zip" (electron-builder).
RELEASE_ASSETS=(
  "$SQUIRREL_ZIP"
  "$SQUIRREL_BLOCKMAP"
  "$HYPHEN_DMG"
  "$RELEASE_DIR/latest-mac.yml"
)

echo "==> Publishing GitHub release ${TAG}"
echo "    Squirrel zip: $(basename "$SQUIRREL_ZIP") (ditto + notarized)"
for asset in "${RELEASE_ASSETS[@]}"; do
  [[ -f "$asset" ]] || die "Missing release asset: $asset"
  echo "    - $(basename "$asset")"
done

if gh release view "$TAG" --repo "${GH_OWNER}/${GH_REPO}" >/dev/null 2>&1; then
  echo "    Release $TAG exists — uploading assets (--clobber)"
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
echo "SUCCESS: IIVO Glass v${VERSION} released"
echo "  ${RELEASE_URL}"
echo "  DMG:  ${HYPHEN_DMG}"
echo "  ZIP:  ${SQUIRREL_ZIP}"
echo "  YML:  ${RELEASE_DIR}/latest-mac.yml"

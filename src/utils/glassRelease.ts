/**
 * glassRelease.ts — Single source of truth for the current public Glass release.
 *
 * Update GLASS_LATEST_VERSION when a new build is published to GitHub Releases.
 * Both the landing page and install guide import from this file — one bump covers all.
 *
 * GitHub release asset naming convention (from notarize-and-release.sh):
 *   IIVO-Glass-{version}-arm64.dmg   — Apple Silicon
 *   IIVO-Glass-{version}-x64.dmg     — Intel
 */

export const GLASS_LATEST_VERSION = "0.5.0";

const RELEASES_BASE =
  `https://github.com/chrismls101-maker/ai-council-runner/releases/download/v${GLASS_LATEST_VERSION}`;

/** Apple Silicon (arm64) DMG — default for most current Mac users. */
export const GLASS_DMG_ARM64_DOWNLOAD_URL =
  `${RELEASES_BASE}/IIVO-Glass-${GLASS_LATEST_VERSION}-arm64.dmg`;

/** Intel (x64) DMG — for older Mac hardware. */
export const GLASS_DMG_X64_DOWNLOAD_URL =
  `${RELEASES_BASE}/IIVO-Glass-${GLASS_LATEST_VERSION}-x64.dmg`;

/**
 * Default download URL — Apple Silicon.
 * @deprecated prefer GLASS_DMG_ARM64_DOWNLOAD_URL or GLASS_DMG_X64_DOWNLOAD_URL
 */
export const GLASS_DMG_DOWNLOAD_URL = GLASS_DMG_ARM64_DOWNLOAD_URL;

/** Link to the GitHub Releases page (fallback / "see all versions"). */
export const GLASS_RELEASES_PAGE_URL =
  "https://github.com/chrismls101-maker/ai-council-runner/releases";

/**
 * BlackHole 2ch version bundled with this release of IIVO Glass.
 *
 * When ExistentialAudio ships a new release, bump this version string.
 * The installer in desktop-glass/src/main/blackHoleInstaller.ts imports
 * this value — one bump here covers the download URL automatically.
 *
 * Check for new releases at:
 *   https://github.com/ExistentialAudio/BlackHole/releases
 */
export const BLACKHOLE_PKG_VERSION = "0.6.0";

export const BLACKHOLE_PKG_URL =
  `https://github.com/ExistentialAudio/BlackHole/releases/download/v${BLACKHOLE_PKG_VERSION}/BlackHole2ch.v${BLACKHOLE_PKG_VERSION}.pkg`;

/**
 * glassRelease.ts — Public Glass download entry points for the IIVO web app.
 *
 * Download buttons use stable server redirects that always resolve to the latest
 * GitHub release (see /api/glass/download/*). No manual version bump needed
 * when a new DMG is published.
 */

/** Stable redirect — server resolves latest arm64 DMG from GitHub Releases. */
export const GLASS_DMG_ARM64_DOWNLOAD_URL = "/api/glass/download/arm64";

/** Stable redirect — server resolves latest x64 DMG from GitHub Releases. */
export const GLASS_DMG_X64_DOWNLOAD_URL = "/api/glass/download/x64";

/**
 * Default download URL — Apple Silicon.
 * @deprecated prefer GLASS_DMG_ARM64_DOWNLOAD_URL or GLASS_DMG_X64_DOWNLOAD_URL
 */
export const GLASS_DMG_DOWNLOAD_URL = GLASS_DMG_ARM64_DOWNLOAD_URL;

/** Link to the GitHub Releases page (fallback / "see all versions"). */
export const GLASS_RELEASES_PAGE_URL =
  "https://github.com/chrismls101-maker/ai-council-runner/releases";

/**
 * Fallback version label when /api/glass/download/latest is unavailable (offline dev).
 * Bump only if you need accurate copy without hitting the API.
 */
export const GLASS_LATEST_VERSION = "0.8.2";

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

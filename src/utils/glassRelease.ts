/**
 * glassRelease.ts — Single source of truth for the current public Glass release.
 *
 * Update GLASS_LATEST_VERSION and GLASS_DMG_DOWNLOAD_URL here when a new
 * build is published to GitHub Releases. Both the landing page and install
 * guide import from this file — one edit covers both.
 */

export const GLASS_LATEST_VERSION = "0.1.16";

export const GLASS_DMG_DOWNLOAD_URL =
  `https://github.com/chrismls101-maker/ai-council-runner/releases/download/v${GLASS_LATEST_VERSION}/IIVO.Glass-${GLASS_LATEST_VERSION}-arm64.dmg`;

/** Link to the GitHub Releases page (fallback / "see all versions"). */
export const GLASS_RELEASES_PAGE_URL =
  "https://github.com/chrismls101-maker/ai-council-runner/releases";

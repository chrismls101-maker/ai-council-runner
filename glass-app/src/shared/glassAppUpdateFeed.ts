/** GitHub Releases feed for packaged Glass auto-update (electron-updater / Squirrel.Mac). */
export const GLASS_GITHUB_UPDATE_OWNER = "chrismls101-maker";
export const GLASS_GITHUB_UPDATE_REPO = "ai-council-runner";

export function glassGitHubUpdateFeedUrl(): string {
  return `https://api.github.com/repos/${GLASS_GITHUB_UPDATE_OWNER}/${GLASS_GITHUB_UPDATE_REPO}/releases/latest`;
}

/** Public DMG on GitHub Releases — fallback when Squirrel install fails (e.g. unnotarized build). */
export function glassGitHubReleaseDmgUrl(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${GLASS_GITHUB_UPDATE_OWNER}/${GLASS_GITHUB_UPDATE_REPO}/releases/download/${tag}/IIVO-Glass-${version}-arm64.dmg`;
}

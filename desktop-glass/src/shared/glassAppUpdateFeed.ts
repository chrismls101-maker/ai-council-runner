/** GitHub Releases feed for packaged Glass auto-update (electron-updater / Squirrel.Mac). */
export const GLASS_GITHUB_UPDATE_OWNER = "chrismls101-maker";
export const GLASS_GITHUB_UPDATE_REPO = "ai-council-runner";

export function glassGitHubUpdateFeedUrl(): string {
  return `https://api.github.com/repos/${GLASS_GITHUB_UPDATE_OWNER}/${GLASS_GITHUB_UPDATE_REPO}/releases/latest`;
}

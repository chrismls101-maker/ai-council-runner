/**
 * OmniParser sidecar install status (shared main + renderer).
 */

export interface OmniParserInstallState {
  /** Detection weights on disk (models/icon_detect/model.pt). */
  weightsPresent: boolean;
  /** Sidecar source tree found (server.py). */
  sidecarPresent: boolean;
  /** Companion will use OmniParser (auto when weights present). */
  enabled: boolean;
  /** Human-readable status for the Installations panel. */
  statusLabel: "ready" | "not_installed" | "unavailable";
  /** Absolute path to sidecar root, when found. */
  sidecarPath: string | null;
}

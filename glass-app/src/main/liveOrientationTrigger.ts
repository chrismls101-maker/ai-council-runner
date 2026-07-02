/**
 * Glass Guide — app focus trigger evaluation.
 */

import {
  DEFAULT_ORIENTATION_PRIVACY_APPS,
  isGlassOrientationApp,
  isOrientationPrivacyApp,
  ORIENTATION_APP_FOCUS_MIN_MS,
  shouldTriggerOrientation,
  type OrientationTriggerReason,
} from "../shared/liveOrientationTypes.ts";
import {
  getAppProficiencyProfile,
  type AppProficiencyProfile,
} from "./liveOrientationMemory.ts";
import type { FrontmostAppIdentity } from "./appIdentity.ts";
import { isOrientationSessionActive } from "./liveOrientationPresenter.ts";

export type OrientationTriggerDecision = {
  shouldFire: boolean;
  reason: OrientationTriggerReason | null;
  profile: AppProficiencyProfile | null;
  partialReorient: boolean;
  /** True when auto-orientation is waiting for the 8s focus gate. */
  blockedByFocusGate?: boolean;
  /** Ms until focus gate opens (only when blockedByFocusGate). */
  focusGateRemainingMs?: number;
};

const appFocusStartedAt = new Map<string, number>();

export function trackAppFocusStart(bundleId: string, now = Date.now()): void {
  if (!appFocusStartedAt.has(bundleId)) {
    appFocusStartedAt.set(bundleId, now);
  }
}

export function clearAppFocusTracking(bundleId?: string): void {
  if (bundleId) appFocusStartedAt.delete(bundleId);
  else appFocusStartedAt.clear();
}

export function evaluateOrientationTrigger(input: {
  identity: FrontmostAppIdentity;
  now?: number;
  manual?: boolean;
  stuck?: boolean;
  screenCaptureReady?: boolean;
  privacyApps?: readonly string[];
}): OrientationTriggerDecision {
  const now = input.now ?? Date.now();
  const privacyApps = input.privacyApps ?? DEFAULT_ORIENTATION_PRIVACY_APPS;

  if (isOrientationSessionActive()) {
    return { shouldFire: false, reason: null, profile: null, partialReorient: false };
  }

  if (
    !input.manual
    && !input.stuck
    && !input.screenCaptureReady
    && process.env.IIVO_GLASS_E2E !== "1"
  ) {
    return { shouldFire: false, reason: null, profile: null, partialReorient: false };
  }

  if (isGlassOrientationApp(input.identity.appName)) {
    return { shouldFire: false, reason: null, profile: null, partialReorient: false };
  }

  if (isOrientationPrivacyApp(input.identity.appName, privacyApps)) {
    return { shouldFire: false, reason: null, profile: null, partialReorient: false };
  }

  trackAppFocusStart(input.identity.bundleId, now);
  const focusStarted = appFocusStartedAt.get(input.identity.bundleId) ?? now;
  const focusElapsed = now - focusStarted;
  if (!input.manual && !input.stuck && focusElapsed < ORIENTATION_APP_FOCUS_MIN_MS) {
    return {
      shouldFire: false,
      reason: null,
      profile: null,
      partialReorient: false,
      blockedByFocusGate: true,
      focusGateRemainingMs: ORIENTATION_APP_FOCUS_MIN_MS - focusElapsed,
    };
  }

  const profile = getAppProficiencyProfile(input.identity.bundleId);
  const { trigger, reason } = shouldTriggerOrientation({
    profile,
    now,
    currentVersion: input.identity.appVersion,
    manual: input.manual,
    stuck: input.stuck,
  });

  const partialReorient = reason === "version_change";

  return {
    shouldFire: trigger,
    reason,
    profile,
    partialReorient,
  };
}

export function onAppFocusChanged(
  previousBundleId: string | null,
  nextIdentity: FrontmostAppIdentity,
): void {
  if (previousBundleId && previousBundleId !== nextIdentity.bundleId) {
    clearAppFocusTracking(previousBundleId);
  }
  trackAppFocusStart(nextIdentity.bundleId);
}

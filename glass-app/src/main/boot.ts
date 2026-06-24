/**
 * Glass boot sequence — log sanitizer + activation gates.
 */

import { installLogSanitizer } from "./logSanitizer.ts";
import { ensureAnthropicKeyActivated } from "./activationWindow.ts";

export {
  isFirstRun,
  markOnboardingComplete,
  prepareBootOnboarding,
  type BootOnboardingPrepareResult,
} from "./bootOnboarding.ts";

/**
 * Boot order:
 * 1. First run → onboarding (Sorting Hat; markOnboardingComplete when done)
 * 2. No Anthropic key → activation window
 * 3. Normal Glass overlay
 */
export async function runBootSequence(launch: () => Promise<void>): Promise<void> {
  installLogSanitizer();
  await launch();
}

/** Gate activation for returning users (onboarding already complete). */
export async function gateActivationForReturningUser(
  needsSortingHat: boolean,
): Promise<boolean> {
  if (needsSortingHat) return true;
  return ensureAnthropicKeyActivated();
}

/** Gate activation immediately after Sorting Hat completes. */
export async function gateActivationAfterOnboarding(): Promise<boolean> {
  return ensureAnthropicKeyActivated();
}

export { ensureAnthropicKeyActivated };

/**
 * Abort scope for Aletheia companion operations (Phase 3 runners).
 * One active operation at a time; stop/deactivate/cancel aborts in-flight agent work.
 */

let activeOperation: AbortController | null = null;

export function startAletheiaCompanionOperation(): AbortController {
  activeOperation?.abort();
  const controller = new AbortController();
  activeOperation = controller;
  return controller;
}

export function finishAletheiaCompanionOperation(controller: AbortController): void {
  if (activeOperation === controller) {
    activeOperation = null;
  }
}

export function abortAletheiaCompanionOperation(): void {
  activeOperation?.abort();
  activeOperation = null;
}

export function getAletheiaCompanionAbortSignal(): AbortSignal | undefined {
  return activeOperation?.signal;
}

export function isAletheiaCompanionOperationAborted(signal?: AbortSignal): boolean {
  const active = signal ?? getAletheiaCompanionAbortSignal();
  return active?.aborted === true;
}

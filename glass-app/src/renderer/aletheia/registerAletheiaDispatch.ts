import { send } from "../useGlassState.ts";

/** Register sealed renderer dispatch hook used by dispatchAletheiaCommand(). Idempotent. */
export function ensureAletheiaDispatchRegistered(): void {
  if (typeof window === "undefined" || window.__aletheiaDispatch) return;
  Object.defineProperty(window, "__aletheiaDispatch", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: (command: string, payload?: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      send({ type: command, ...payload } as any);
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

if (typeof window !== "undefined") {
  ensureAletheiaDispatchRegistered();
}

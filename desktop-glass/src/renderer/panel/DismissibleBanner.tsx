import type { ReactNode } from "react";
import { send } from "../useGlassState.ts";
import type { GlassCommand } from "../../shared/ipc.ts";

export function DismissibleBanner({
  children,
  variant,
  dismissCommand,
  testId,
}: {
  children: ReactNode;
  variant: "notice" | "error";
  dismissCommand: "clear-last-notice" | "clear-last-error";
  testId: string;
}): JSX.Element {
  const className = variant === "error" ? "error-banner" : "notice-banner";
  return (
    <div className={`${className} dismissible-banner`} data-testid={testId}>
      <div className="dismissible-banner__content">{children}</div>
      <button
        type="button"
        className="dismissible-banner__close gbtn gbtn--ghost"
        data-testid={`${testId}-close`}
        aria-label="Dismiss"
        onClick={() => send({ type: dismissCommand } as GlassCommand)}
      >
        ✕
      </button>
    </div>
  );
}

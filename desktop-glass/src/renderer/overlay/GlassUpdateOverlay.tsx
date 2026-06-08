import { useEffect } from "react";
import type { GlassAppUpdateState } from "../../shared/glassAppUpdate.ts";
import { send } from "../useGlassState.ts";

type Props = {
  appUpdate: GlassAppUpdateState;
  enterInteractive: () => void;
  leaveInteractive: () => void;
};

export function GlassUpdateOverlay({
  appUpdate,
  enterInteractive,
  leaveInteractive,
}: Props): JSX.Element | null {
  const visible = appUpdate.phase === "available" || appUpdate.phase === "installing";

  useEffect(() => {
    if (!visible) return;
    enterInteractive();
    return () => leaveInteractive();
  }, [visible, enterInteractive, leaveInteractive]);

  if (!visible) return null;

  const title = appUpdate.title ?? "NEW SYSTEM UPDATE";
  const installing = appUpdate.phase === "installing";

  return (
    <div
      className="glass-update-overlay"
      data-testid="glass-update-overlay"
      onPointerDown={enterInteractive}
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      <div className="glass-update-overlay__scrim" aria-hidden="true" />
      <article className="glass-update-card" role="dialog" aria-labelledby="glass-update-title">
        <p className="glass-update-card__eyebrow">IIVO Glass</p>
        <h1 id="glass-update-title" className="glass-update-card__title">
          {title}
        </h1>
        {appUpdate.latestVersion ? (
          <p className="glass-update-card__version">
            v{appUpdate.currentVersion} → v{appUpdate.latestVersion}
          </p>
        ) : null}
        {appUpdate.releaseNotes?.trim() ? (
          <p className="glass-update-card__notes">{appUpdate.releaseNotes.trim()}</p>
        ) : (
          <p className="glass-update-card__notes">
            A newer build is ready. Update now to get the latest fixes and features.
          </p>
        )}
        {appUpdate.error ? (
          <p className="glass-update-card__error" data-testid="glass-update-error">
            {appUpdate.error}
          </p>
        ) : null}
        <div className="glass-update-card__actions">
          <button
            type="button"
            className="gbtn gbtn--primary gbtn--glass-update"
            data-testid="glass-update-apply"
            disabled={installing}
            onClick={() => send({ type: "glass-update-apply" })}
          >
            {installing ? "Opening installer…" : "Update"}
          </button>
          {!installing ? (
            <button
              type="button"
              className="gbtn gbtn--ghost gbtn--glass-update-later"
              data-testid="glass-update-dismiss"
              onClick={() => send({ type: "glass-update-dismiss" })}
            >
              Later
            </button>
          ) : null}
        </div>
      </article>
    </div>
  );
}

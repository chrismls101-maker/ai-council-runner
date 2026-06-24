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
  const visible =
    appUpdate.phase === "available" ||
    appUpdate.phase === "downloading" ||
    appUpdate.phase === "installing";

  useEffect(() => {
    if (!visible) return;
    enterInteractive();
    return () => leaveInteractive();
  }, [visible, enterInteractive, leaveInteractive]);

  if (!visible) return null;

  const title = appUpdate.title ?? "NEW SYSTEM UPDATE";
  const downloading = appUpdate.phase === "downloading";
  const installing = appUpdate.phase === "installing";
  const busy = downloading || installing;
  const updateButtonLabel = downloading
    ? appUpdate.downloadPercent != null && appUpdate.downloadPercent > 0
      ? `Downloading… ${Math.round(appUpdate.downloadPercent)}%`
      : "Downloading…"
    : installing
      ? "Installing…"
      : "Update";

  return (
    <div
      className="glass-update-backdrop"
      data-testid="glass-update-overlay"
      onPointerDown={enterInteractive}
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
    >
      <article className="glass-update-card" role="dialog" aria-labelledby="glass-update-title">
        <h1 id="glass-update-title" className="glass-update-card__title">
          {title}
        </h1>
        {appUpdate.latestVersion ? (
          <p className="glass-update-card__version">
            v{appUpdate.currentVersion} → v{appUpdate.latestVersion}
          </p>
        ) : null}
        {appUpdate.error ? (
          <p className="glass-update-card__error" data-testid="glass-update-error">
            {appUpdate.error}
          </p>
        ) : null}
        <div className="glass-update-card__actions">
          <button
            type="button"
            className="glass-update-card__btn-update"
            data-testid="glass-update-apply"
            disabled={busy}
            onClick={() => send({ type: "glass-update-apply" })}
          >
            {updateButtonLabel}
          </button>
          {!busy ? (
            <button
              type="button"
              className="glass-update-card__btn-later"
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

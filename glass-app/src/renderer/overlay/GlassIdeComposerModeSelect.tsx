import { useCallback, useEffect, useRef, useState } from "react";
import {
  GLASS_CODER_COMPOSER_MODES,
  parseGlassCoderComposerMode,
  type GlassCoderComposerMode,
} from "../../shared/glassComposerMode.ts";
import { ensureOverlayInteractive } from "../glassTextInteraction.ts";
import { GlassHoverTooltip } from "../components/GlassHoverTooltip.tsx";
import { send } from "../useGlassState.ts";

interface GlassIdeComposerModeSelectProps {
  mode: GlassCoderComposerMode;
  disabled?: boolean;
}

export function GlassIdeComposerModeSelect({
  mode,
  disabled = false,
}: GlassIdeComposerModeSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = parseGlassCoderComposerMode(mode);
  const activeDef = GLASS_CODER_COMPOSER_MODES.find((def) => def.id === active)
    ?? GLASS_CODER_COMPOSER_MODES[0];

  const selectMode = useCallback((id: GlassCoderComposerMode): void => {
    send({ type: "set-glass-coder-settings", patch: { coderComposerMode: id } });
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  return (
    <div className="gide-composer-mode-select" ref={rootRef} data-testid="glass-ide-composer-mode">
      <GlassHoverTooltip label={activeDef.tooltip} placement="top">
        <button
          type="button"
          className="gide-composer-mode-select__trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onPointerDown={ensureOverlayInteractive}
        >
          <span className="gide-composer-mode-select__label">{activeDef.label}</span>
          <span className="gide-composer-mode-select__chevron" aria-hidden="true">▾</span>
        </button>
      </GlassHoverTooltip>
      {open ? (
        <div className="gide-composer-mode-select__menu" role="listbox" aria-label="Composer mode">
          <ul className="gide-composer-mode-select__list">
            {GLASS_CODER_COMPOSER_MODES.map((def) => {
              const selected = def.id === active;
              return (
                <li key={def.id} role="option" aria-selected={selected}>
                  <GlassHoverTooltip label={def.tooltip} placement="top">
                    <button
                      type="button"
                      className={`gide-composer-mode-select__option${selected ? " gide-composer-mode-select__option--active" : ""}`}
                      onClick={() => selectMode(def.id)}
                      onPointerDown={ensureOverlayInteractive}
                    >
                      <span className="gide-composer-mode-select__option-label">{def.label}</span>
                      <span className="gide-composer-mode-select__option-desc">
                        {def.id === "agent"
                          ? "Apply edits with approval"
                          : "Read-only implementation plan"}
                      </span>
                    </button>
                  </GlassHoverTooltip>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

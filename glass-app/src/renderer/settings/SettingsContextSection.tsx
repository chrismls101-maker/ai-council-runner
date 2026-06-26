import { Eye, EyeOff, Laptop, LayoutPanelLeft, MousePointer2, Monitor, PanelTop } from "lucide-react";
import type { GlassState } from "../../shared/ipc.ts";
import {
  formatDisplayTargetLabel,
  GLASS_HOTKEY_PRESETS,
  type GlassDisplayTarget,
  type GlassHotkeyPreset,
} from "../../shared/glassSettings.ts";
import { send } from "../useGlassState.ts";
import { SettingsChoiceCard, SettingsChoiceGrid } from "./SettingsChoiceCard.tsx";

type SettingsContextSectionProps = {
  state: GlassState;
  screenContextEnabled: boolean;
  onScreenContextToggle: (enabled: boolean) => void;
};

function resolveDisplayTarget(settings: GlassState["glassSettings"]): GlassDisplayTarget {
  return settings.displayTarget ?? "primary";
}

export function SettingsContextSection({
  state,
  screenContextEnabled,
  onScreenContextToggle,
}: SettingsContextSectionProps): JSX.Element {
  const settings = state.glassSettings;
  const currentTarget = resolveDisplayTarget(settings);
  const connected = state.connectedDisplays.length
    ? state.connectedDisplays
    : state.availableDisplayIds.map((id, index) => ({
        id,
        label: `Display ${index + 1}`,
        isPrimary: index === 0,
      }));
  const externalDisplays = connected.filter((d) => !d.isPrimary);
  const primaryDisplay = connected.find((d) => d.isPrimary);
  const externalTarget = externalDisplays.find((d) => d.id === currentTarget)
    ?? externalDisplays[0];
  const externalSelected =
    typeof currentTarget === "number" && externalDisplays.some((d) => d.id === currentTarget);

  const hotkeyOptions = (Object.keys(GLASS_HOTKEY_PRESETS) as GlassHotkeyPreset[]).map(
    (preset) => ({
      preset,
      label: GLASS_HOTKEY_PRESETS[preset].label,
    }),
  );

  const selectDisplay = (target: GlassDisplayTarget): void => {
    send({ type: "set-glass-display", target });
  };

  const cycleExternalDisplay = (): void => {
    if (externalDisplays.length === 0) return;
    if (!externalSelected) {
      selectDisplay(externalDisplays[0]!.id);
      return;
    }
    const idx = externalDisplays.findIndex((d) => d.id === currentTarget);
    const next = externalDisplays[(idx + 1) % externalDisplays.length]!;
    selectDisplay(next.id);
  };

  return (
    <div className="glass-settings__context" data-testid="glass-settings-context">
      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Screen context</p>
        <SettingsChoiceGrid className="glass-settings__choice-grid--2">
          <SettingsChoiceCard
            icon={<Eye size={28} strokeWidth={1.75} />}
            label="On"
            description="Glass reads your screen for live IIVO context"
            selected={screenContextEnabled}
            status={screenContextEnabled ? "ok" : "idle"}
            testId="glass-settings-screen-context-on"
            onClick={() => onScreenContextToggle(true)}
          />
          <SettingsChoiceCard
            icon={<EyeOff size={28} strokeWidth={1.75} />}
            label="Off"
            description="No automatic screen reading"
            selected={!screenContextEnabled}
            status={!screenContextEnabled ? "idle" : "ok"}
            testId="glass-settings-screen-context-off"
            onClick={() => onScreenContextToggle(false)}
          />
        </SettingsChoiceGrid>
        <p className="glass-settings__block-hint">
          Screen content is never stored or sent to AI without your action.
        </p>
      </section>

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Glass display</p>
        <p className="glass-settings__block-sub">
          Where the overlay, dock, and command bar appear
          {connected.length > 1
            ? ` · active: ${formatDisplayTargetLabel(currentTarget, state.availableDisplayIds)}`
            : ""}
        </p>
        <SettingsChoiceGrid>
          <SettingsChoiceCard
            icon={<Laptop size={28} strokeWidth={1.75} />}
            label="Primary"
            description={primaryDisplay?.label ?? "Built-in display"}
            selected={currentTarget === "primary"}
            testId="glass-settings-display-primary"
            onClick={() => selectDisplay("primary")}
          />
          <SettingsChoiceCard
            icon={<Monitor size={28} strokeWidth={1.75} />}
            label="External"
            description={
              externalDisplays.length
                ? externalTarget?.label ?? "HDMI / monitor"
                : "No external display detected"
            }
            selected={externalSelected}
            disabled={externalDisplays.length === 0}
            testId="glass-settings-display-external"
            onClick={cycleExternalDisplay}
          />
          <SettingsChoiceCard
            icon={<MousePointer2 size={28} strokeWidth={1.75} />}
            label="Follow mouse"
            description="Moves with your cursor across displays"
            selected={currentTarget === "follow_mouse"}
            testId="glass-settings-display-follow-mouse"
            onClick={() => selectDisplay("follow_mouse")}
          />
        </SettingsChoiceGrid>
        {externalDisplays.length > 1 && externalSelected ? (
          <p className="glass-settings__block-hint">
            Tap External again to switch between{" "}
            {externalDisplays.map((d) => d.label).join(" · ")}.
          </p>
        ) : null}
        <button
          type="button"
          className="gbtn gbtn--ghost glass-settings__inline-btn"
          onClick={() => send({ type: "refresh-glass-layout" })}
        >
          Refresh display layout
        </button>
      </section>

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Dock</p>
        <SettingsChoiceGrid className="glass-settings__choice-grid--2">
          <SettingsChoiceCard
            icon={<LayoutPanelLeft size={28} strokeWidth={1.75} />}
            label="Left rail"
            description="Vertical icon strip on the left"
            selected={(settings.dockPlacement ?? "left-rail") === "left-rail"}
            testId="glass-settings-dock-left-rail"
            onClick={() => send({ type: "set-dock-placement", placement: "left-rail" })}
          />
          <SettingsChoiceCard
            icon={<PanelTop size={28} strokeWidth={1.75} />}
            label="Top pill"
            description="Floating dock along the top"
            selected={settings.dockPlacement === "top"}
            testId="glass-settings-dock-top"
            onClick={() => send({ type: "set-dock-placement", placement: "top" })}
          />
        </SettingsChoiceGrid>
        <label className="glass-settings__toggle-card">
          <input
            type="checkbox"
            data-testid="glass-dock-lock-toggle"
            checked={settings.chromeLayoutLocked !== false}
            onChange={(e) => send({ type: "set-chrome-layout-locked", locked: e.target.checked })}
          />
          <span>
            <strong>Lock dock position</strong>
            <small>Uncheck to drag the dock, then lock again</small>
          </span>
        </label>
      </section>

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Command bar hotkey</p>
        <div className="glass-settings__pill-row">
          {hotkeyOptions.map((opt) => (
            <button
              key={opt.preset}
              type="button"
              className={`glass-settings__pill${settings.hotkeyPreset === opt.preset ? " glass-settings__pill--active" : ""}`}
              onClick={() => send({ type: "set-glass-hotkey", preset: opt.preset })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-settings__block glass-settings__block--compact">
        <p className="glass-settings__block-label">Capture privacy</p>
        <label className="glass-settings__toggle-card">
          <input
            type="checkbox"
            checked={settings.saveVisualAsksToSession !== false}
            onChange={(e) => send({ type: "set-save-visual-asks-to-session", enabled: e.target.checked })}
          />
          <span>
            <strong>Save visual asks to session</strong>
          </span>
        </label>
        <label className="glass-settings__toggle-card">
          <input
            type="checkbox"
            checked={settings.autoUploadCapturesToContext === true}
            onChange={(e) =>
              send({ type: "set-auto-upload-captures-to-context", enabled: e.target.checked })
            }
          />
          <span>
            <strong>Auto-upload captures to IIVO Context</strong>
          </span>
        </label>
      </section>
    </div>
  );
}

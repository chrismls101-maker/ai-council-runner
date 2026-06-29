import { useCallback, useEffect, useState } from "react";
import { send, useGlassState } from "../useGlassState.ts";
import { SettingsContextSection } from "../settings/SettingsContextSection.tsx";
import { SettingsComponentsSection } from "../settings/SettingsComponentsSection.tsx";
import { displayAgentOutputFolder } from "../../shared/agentOutputFolder.ts";

/** Display, dock, components, and agent paths — from the former Settings window. */
export function PanelPreferencesTab(): JSX.Element {
  const state = useGlassState();
  const [screenContextEnabled, setScreenContextEnabled] = useState(true);
  const outputFolder = displayAgentOutputFolder(state.glassSettings);

  useEffect(() => {
    setScreenContextEnabled(state.glassSettings.screenContextEnabled !== false);
    return () => {};
  }, [state.glassSettings.screenContextEnabled]);

  const handleScreenContextToggle = useCallback((enabled: boolean): void => {
    setScreenContextEnabled(enabled);
    send({
      type: "set-glass-coder-settings",
      patch: { screenContextEnabled: enabled },
    });
  }, []);

  return (
    <div className="panel-preferences-tab glass-settings__context" data-testid="glass-panel-preferences-tab">
      <SettingsContextSection
        state={state}
        screenContextEnabled={screenContextEnabled}
        onScreenContextToggle={handleScreenContextToggle}
      />

      <section className="glass-settings__block">
        <p className="glass-settings__block-label">Agent files</p>
        <p className="glass-settings__block-sub">
          Research and Writing agents save reports to this folder on your Mac.
        </p>
        <div className="glass-settings__audio-actions">
          <button
            type="button"
            className="gbtn gbtn--ghost glass-settings__path-btn"
            onClick={() => void window.glass.agentPickOutputFolder()}
          >
            {outputFolder}
          </button>
        </div>
      </section>

      <SettingsComponentsSection />
    </div>
  );
}

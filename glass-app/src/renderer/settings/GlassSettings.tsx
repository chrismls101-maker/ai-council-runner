import { useCallback, useEffect, useState } from "react";
import type { GlassSettingsSection } from "../../shared/panelTabRouting.ts";
import { useGlassState } from "../useGlassState.ts";
import { ServerUrlEditor } from "../panel/PanelSetupSections.tsx";
import { SettingsAudioSection } from "../panel/SettingsAudioSection.tsx";
import { SettingsContextSection } from "./SettingsContextSection.tsx";
import { SettingsProvidersSection } from "./SettingsProvidersSection.tsx";
import { SettingsAccountSection } from "./SettingsAccountSection.tsx";
import { SettingsComponentsSection } from "./SettingsComponentsSection.tsx";

const IS_DEV = process.env.NODE_ENV !== "production";

const NAV_SECTIONS: { id: GlassSettingsSection; label: string; devOnly?: boolean }[] = [
  { id: "providers", label: "Providers" },
  { id: "context", label: "Context" },
  { id: "audio", label: "Audio" },
  { id: "components", label: "Components" },
  { id: "account", label: "Account" },
  { id: "dev", label: "Dev", devOnly: true },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

const SECTION_PAGE_TITLE: Record<GlassSettingsSection, string> = {
  providers: "Providers",
  context: "Context",
  audio: "Audio",
  components: "Components",
  account: "Account",
  dev: "Developer",
  shortcuts: "Shortcuts",
  about: "About",
};

export function GlassSettings(): JSX.Element {
  const glassState = useGlassState();
  const [section, setSection] = useState<GlassSettingsSection>("providers");
  const [screenContextEnabled, setScreenContextEnabled] = useState(true);
  const [appVersion, setAppVersion] = useState("—");

  useEffect(() => {
    void window.glass.getSettingsInitialSection().then(setSection);
  }, []);

  useEffect(() => {
    void window.glass.getAppVersion().then(setAppVersion);
    void window.glass.getState().then((state) => {
      setScreenContextEnabled(state.glassSettings.screenContextEnabled !== false);
    });
    return window.glass.onState((state) => {
      setScreenContextEnabled(state.glassSettings.screenContextEnabled !== false);
    });
  }, []);

  const handleScreenContextToggle = useCallback((enabled: boolean): void => {
    setScreenContextEnabled(enabled);
    window.glass.send({
      type: "set-glass-coder-settings",
      patch: { screenContextEnabled: enabled },
    });
  }, []);

  const handleClose = useCallback((): void => {
    window.glass.closeSettings();
  }, []);

  const visibleSections = NAV_SECTIONS.filter((s) => !s.devOnly || IS_DEV);
  const pageTitle = SECTION_PAGE_TITLE[section];

  return (
    <div className="panel glass-settings" data-testid="glass-settings">
      <header className="panel__header">
        <div className="panel__brand">
          <span className="dock__logo" />
          <div>
            <div className="panel__title">Settings</div>
            <div className="panel__subtitle">Glass preferences</div>
          </div>
        </div>
        <button
          type="button"
          className="gbtn gbtn--ghost panel__close"
          aria-label="Close settings"
          data-testid="glass-settings-close"
          onClick={handleClose}
        >
          ✕
        </button>
      </header>

      <div className="panel__shell">
        <nav className="panel__nav" aria-label="Settings sections">
          {visibleSections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`panel__nav-tab${section === item.id ? " panel__nav-tab--active" : ""}`}
              data-testid={`glass-settings-nav-${item.id}`}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="panel__stage glass-settings__stage">
          <header className="glass-settings__page-head">
            <h1 className="glass-settings__page-title">{pageTitle}</h1>
          </header>
          <div className="panel__body panel-tab-view glass-settings__page-body">
            {section === "providers" ? (
              <SettingsProvidersSection state={glassState} />
            ) : null}

            {section === "context" ? (
              <SettingsContextSection
                state={glassState}
                screenContextEnabled={screenContextEnabled}
                onScreenContextToggle={handleScreenContextToggle}
              />
            ) : null}

            {section === "audio" ? <SettingsAudioSection state={glassState} /> : null}

            {section === "components" ? <SettingsComponentsSection /> : null}

            {section === "account" ? <SettingsAccountSection state={glassState} /> : null}

            {section === "dev" && IS_DEV ? (
              <>
                <ServerUrlEditor state={glassState} />
                {glassState.operationDiagnostics.displayInfo ? (
                  <p className="hint panel__display-diag">
                    {glassState.operationDiagnostics.displayInfo}
                  </p>
                ) : null}
              </>
            ) : null}

            {section === "shortcuts" ? (
              <>
                <p className="hint">Coming soon: editable shortcuts</p>
                <ul className="glass-settings__shortcut-list">
                  <li>
                    <kbd>⌘⇧Space</kbd>
                    <span>Open command bar</span>
                  </li>
                  <li>
                    <kbd>⌘⇧D</kbd>
                    <span>Open dashboard</span>
                  </li>
                </ul>
              </>
            ) : null}

            {section === "about" ? (
              <>
                <div className="glass-settings__about-row">
                  <span className="glass-settings__about-label">App</span>
                  <span>Glass</span>
                </div>
                <div className="glass-settings__about-row">
                  <span className="glass-settings__about-label">Version</span>
                  <span>{appVersion}</span>
                </div>
                <div className="glass-settings__about-links">
                  <button
                    type="button"
                    className="gbtn gbtn--ghost glass-settings__link-btn"
                    onClick={() =>
                      void window.glass.settingsOpenExternal("https://console.anthropic.com")
                    }
                  >
                    console.anthropic.com
                  </button>
                  <button
                    type="button"
                    className="gbtn gbtn--ghost glass-settings__link-btn"
                    onClick={() => void window.glass.settingsOpenExternal("https://iivo.ai/privacy")}
                  >
                    Privacy Policy
                  </button>
                </div>
                <button
                  type="button"
                  className="gbtn gbtn--danger glass-settings__quit"
                  onClick={() => window.glass.send({ type: "glass-quit" })}
                >
                  Quit Glass
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

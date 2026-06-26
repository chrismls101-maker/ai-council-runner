import type { ReactNode } from "react";

export type SettingsChoiceCardProps = {
  icon: ReactNode;
  label: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  connected?: boolean;
  status?: "ok" | "warn" | "idle" | "error";
  onClick?: () => void;
  testId?: string;
};

export function SettingsChoiceCard({
  icon,
  label,
  description,
  selected = false,
  disabled = false,
  connected,
  status,
  onClick,
  testId,
}: SettingsChoiceCardProps): JSX.Element {
  return (
    <button
      type="button"
      className={`glass-settings__choice-card${selected ? " glass-settings__choice-card--selected" : ""}${disabled ? " glass-settings__choice-card--disabled" : ""}`}
      disabled={disabled}
      data-testid={testId}
      data-connected={connected == null ? undefined : connected ? "true" : "false"}
      aria-pressed={selected}
      onClick={onClick}
    >
      {status ? (
        <span
          className={`glass-settings__choice-status glass-settings__choice-status--${status}`}
          aria-hidden="true"
        />
      ) : null}
      <span className="glass-settings__choice-icon">{icon}</span>
      <span className="glass-settings__choice-label">{label}</span>
      {description ? (
        <span className="glass-settings__choice-desc">{description}</span>
      ) : null}
    </button>
  );
}

export function SettingsChoiceGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`glass-settings__choice-grid${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

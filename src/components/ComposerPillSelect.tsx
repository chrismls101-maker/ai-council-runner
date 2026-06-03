import { useEffect, useId, useRef, useState } from "react";

export interface PillSelectOption {
  value: string;
  label: string;
  description: string;
}

interface ComposerPillSelectProps {
  value: string;
  options: PillSelectOption[];
  onChange: (value: string) => void;
  icon: string;
  ariaLabel: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerTestId?: string;
  variant?: "default" | "minimal";
  hideIcon?: boolean;
}

export default function ComposerPillSelect({
  value,
  options,
  onChange,
  icon,
  ariaLabel,
  disabled,
  open: openControlled,
  onOpenChange,
  triggerTestId,
  variant = "default",
  hideIcon = false,
}: ComposerPillSelectProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openControlled ?? openInternal;
  const setOpen = (next: boolean) => {
    if (openControlled === undefined) setOpenInternal(next);
    onOpenChange?.(next);
  };

  const selected = options.find((o) => o.value === value) ?? options[0];
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setHoveredValue(null);
      return;
    }
    setHoveredValue(value);
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, value]);

  return (
    <div
      className={`pill-segment pill-select-custom${variant === "minimal" ? " pill-select-minimal" : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className="pill-select-trigger"
        onClick={() => !disabled && setOpen(!open)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={open ? undefined : selected?.description}
        disabled={disabled}
        data-testid={triggerTestId}
      >
        {!hideIcon && (
          <span className="pill-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="pill-select-label">{selected?.label ?? value}</span>
        <svg className="pill-select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="pill-select-dropdown" role="listbox" aria-label={ariaLabel}>
          <ul
            className="pill-select-list"
            onMouseLeave={() => setHoveredValue(value)}
          >
            {options.map((opt) => {
              const isHovered = hoveredValue === opt.value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    aria-describedby={isHovered ? `${uid}-desc-${opt.value}` : undefined}
                    className={`pill-select-option${opt.value === value ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
                    onMouseEnter={() => setHoveredValue(opt.value)}
                    onFocus={() => setHoveredValue(opt.value)}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="pill-option-label">{opt.label}</span>
                    {isHovered && (
                      <span className="pill-option-desc" id={`${uid}-desc-${opt.value}`}>
                        {opt.description}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

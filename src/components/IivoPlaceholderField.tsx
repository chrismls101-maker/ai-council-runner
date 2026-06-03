import type { ReactNode } from "react";
import IivoWordmark from "./IivoWordmark";

interface IivoPlaceholderFieldProps {
  /** Show the branded overlay (typically when the field value is empty). */
  show: boolean;
  before?: string;
  after?: string;
  variant?: "composer" | "memory";
  className?: string;
  children: ReactNode;
}

/**
 * Wraps an input/textarea so "IIVO" in the placeholder uses the Michroma wordmark.
 * Native placeholders cannot mix fonts — this overlay mimics the placeholder visually.
 */
export default function IivoPlaceholderField({
  show,
  before = "",
  after = "",
  variant = "composer",
  className = "",
  children,
}: IivoPlaceholderFieldProps) {
  return (
    <div
      className={[
        "iivo-placeholder-field",
        `iivo-placeholder-field--${variant}`,
        show ? "is-empty" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      {show && (
        <span className="iivo-placeholder-overlay" aria-hidden="true">
          {before}
          <IivoWordmark className="iivo-placeholder-wordmark" />
          {after}
        </span>
      )}
    </div>
  );
}

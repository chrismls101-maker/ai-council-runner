import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type GlassButtonBaseProps = {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "ghost" | "default";
};

type GlassButtonAsLink = GlassButtonBaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type GlassButtonAsButton = GlassButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export type GlassButtonProps = GlassButtonAsLink | GlassButtonAsButton;

function variantClass(variant: GlassButtonBaseProps["variant"]): string {
  if (variant === "primary") return "glass-cup-btn--primary";
  if (variant === "ghost") return "glass-cup-btn--ghost";
  return "";
}

export default function GlassButton(props: GlassButtonProps) {
  const { children, className = "", variant = "default", ...rest } = props;
  const classes = ["glass-cup-btn", variantClass(variant), className].filter(Boolean).join(" ");

  if ("href" in props && props.href) {
    const { href, ...linkRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    return (
      <a href={href} className={classes} {...linkRest}>
        <span className="glass-cup-btn__label">{children}</span>
      </a>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      <span className="glass-cup-btn__label">{children}</span>
    </button>
  );
}

import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type GlassButtonBaseProps = {
  children: React.ReactNode;
  className?: string;
};

type GlassButtonAsLink = GlassButtonBaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type GlassButtonAsButton = GlassButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export type GlassButtonProps = GlassButtonAsLink | GlassButtonAsButton;

export default function GlassButton(props: GlassButtonProps) {
  const { children, className = "", ...rest } = props;
  const classes = ["glass-button", className].filter(Boolean).join(" ");

  if ("href" in props && props.href) {
    const { href, ...linkRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    return (
      <a href={href} className={classes} {...linkRest}>
        <span className="glass-button__label">{children}</span>
      </a>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      <span className="glass-button__label">{children}</span>
    </button>
  );
}

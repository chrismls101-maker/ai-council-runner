import type { HTMLAttributes } from "react";

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "article";
}

export default function GlassCard({
  as: Tag = "article",
  className = "",
  children,
  ...rest
}: GlassCardProps) {
  return (
    <Tag className={["glass-card", className].filter(Boolean).join(" ")} {...rest}>
      <p className="glass-card__text">{children}</p>
    </Tag>
  );
}

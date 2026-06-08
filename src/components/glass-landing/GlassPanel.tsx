import type { HTMLAttributes } from "react";

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
}

export default function GlassPanel({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <Tag className={["glass-panel", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}

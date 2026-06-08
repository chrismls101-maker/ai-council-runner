import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";

type IivoWordmarkProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children?: ReactNode;
};

/** Stylized IIVO logotype (Michroma) — use wherever the product name appears as branding. */
export default function IivoWordmark({
  as: Tag = "span",
  className = "",
  children,
  ...rest
}: IivoWordmarkProps) {
  return createElement(
    Tag,
    {
      className: ["iivo-wordmark", className].filter(Boolean).join(" "),
      ...rest,
    },
    children ?? "IIVO",
  );
}

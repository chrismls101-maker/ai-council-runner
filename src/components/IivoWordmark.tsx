import type { ElementType, HTMLAttributes } from "react";

type IivoWordmarkProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
};

/** Stylized IIVO logotype (Michroma) — use wherever the product name appears as branding. */
export default function IivoWordmark({
  as: Tag = "span",
  className = "",
  children,
  ...rest
}: IivoWordmarkProps) {
  return (
    <Tag className={["iivo-wordmark", className].filter(Boolean).join(" ")} {...rest}>
      {children ?? "IIVO"}
    </Tag>
  );
}

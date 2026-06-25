import type { ReactNode } from "react";
import { useScrollReveal } from "./useScrollReveal.ts";

type RevealSectionProps = {
  id?: string;
  className?: string;
  children: ReactNode;
  immediate?: boolean;
  "data-glass-section"?: string;
  "data-glass-scroll-zone"?: boolean;
};

export function RevealSection({
  id,
  className = "",
  children,
  immediate = false,
  ...rest
}: RevealSectionProps): React.JSX.Element {
  const { ref, visible } = useScrollReveal<HTMLElement>();
  const shown = immediate || visible;

  return (
    <section
      id={id}
      ref={immediate ? undefined : ref}
      className={["gl-reveal", shown ? "is-visible" : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </section>
  );
}

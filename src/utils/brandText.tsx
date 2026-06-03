import { Fragment, type ReactNode } from "react";
import IivoWordmark from "../components/IivoWordmark";

/** Wraps each "IIVO" occurrence in the Michroma wordmark for inline UI copy. */
export function withIivoWordmark(text: string, keyPrefix = "brand"): ReactNode {
  if (!text.includes("IIVO")) return text;
  const parts = text.split("IIVO");
  return parts.map((part, index) => (
    <Fragment key={`${keyPrefix}-${index}`}>
      {part}
      {index < parts.length - 1 ? <IivoWordmark /> : null}
    </Fragment>
  ));
}

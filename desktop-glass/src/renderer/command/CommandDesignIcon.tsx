import { Wand2 } from "lucide-react";

/** Design-to-Code button icon — magic wand (capture design → generate code). */
export function CommandDesignIcon(): JSX.Element {
  return (
    <Wand2
      className="command-design-btn__icon"
      size={18}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useCopyToClipboard } from "../useCopyToClipboard.ts";

type CopyButtonProps = {
  text: string;
  children?: ReactNode;
  copiedLabel?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">;

/** Button that copies text and briefly shows copied feedback. */
export function CopyButton({
  text,
  children = "Copy",
  copiedLabel = "Copied",
  disabled,
  ...rest
}: CopyButtonProps): JSX.Element {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      disabled={disabled ?? !text.trim()}
      onClick={() => void copy(text)}
      {...rest}
    >
      {copied ? copiedLabel : children}
    </button>
  );
}

import { useCallback, useState } from "react";

/** Write text to the system clipboard — Electron main process fallback when the web API fails. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      return await window.glass.writeClipboard(value);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    }
  }
}

/** Copy helper with short-lived "Copied" feedback for buttons. */
export function useCopyToClipboard(resetMs = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}

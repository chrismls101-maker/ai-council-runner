import { useCallback, useState } from "react";

type RememberState = "idle" | "saving" | "saved" | "failed";

export function RememberThisButton({
  content,
  prompt,
  runId,
}: {
  content: string;
  prompt?: string;
  runId?: string;
}): JSX.Element | null {
  const [state, setState] = useState<RememberState>("idle");
  const trimmed = content.trim();

  const save = useCallback(async () => {
    if (!trimmed || state === "saving" || state === "saved") return;
    setState("saving");
    try {
      const result = await window.glass.saveGlassMemory({ content: trimmed, prompt, runId });
      setState(result.ok ? "saved" : "failed");
    } catch {
      setState("failed");
    }
  }, [trimmed, prompt, runId, state]);

  if (!trimmed) return null;

  const label =
    state === "saved"
      ? "Saved"
      : state === "failed"
        ? "Failed — tap to retry"
        : state === "saving"
          ? "Saving…"
          : "Remember this";

  return (
    <button
      type="button"
      className={`overlay-feed-card__remember${state === "saved" ? " overlay-feed-card__remember--saved" : ""}${state === "failed" ? " overlay-feed-card__remember--failed" : ""}`}
      data-testid="glass-remember-this"
      disabled={state === "saved" || state === "saving"}
      onClick={() => void save()}
    >
      {label}
    </button>
  );
}

import { useEffect, useMemo } from "react";
import { useTypewriterReveal } from "../hooks/useTypewriterReveal";
import { cleanDisplayText } from "../utils/cleanDisplayText";
import MarkdownContent from "./MarkdownContent";

export interface TypewriterAnswerProps {
  content: string;
  animate: boolean;
  resetKey: string;
  className?: string;
  /** Strip ## ** and council heading noise (default true). */
  sanitizeDisplay?: boolean;
  onTypingChange?: (typing: boolean) => void;
  onRevealProgress?: () => void;
  onRegisterSkip?: (skip: (() => void) | null) => void;
}

export default function TypewriterAnswer({
  content,
  animate,
  resetKey,
  className,
  sanitizeDisplay = true,
  onTypingChange,
  onRevealProgress,
  onRegisterSkip,
}: TypewriterAnswerProps) {
  const displayContent = useMemo(
    () => (sanitizeDisplay ? cleanDisplayText(content, { preserveCodeBlocks: true }) : content),
    [content, sanitizeDisplay],
  );

  const { visibleText, isTyping, isComplete, skip } = useTypewriterReveal(displayContent, {
    enabled: animate,
    resetKey,
  });

  useEffect(() => {
    onTypingChange?.(isTyping);
  }, [isTyping, onTypingChange]);

  useEffect(() => {
    if (isTyping) {
      onRevealProgress?.();
    }
  }, [visibleText, isTyping, onRevealProgress]);

  useEffect(() => {
    if (animate && isTyping) {
      onRegisterSkip?.(skip);
      return () => onRegisterSkip?.(null);
    }
    onRegisterSkip?.(null);
    return undefined;
  }, [animate, isTyping, skip, onRegisterSkip]);

  if (!displayContent.trim()) return null;

  return (
    <div className="typewriter-answer" data-testid="final-answer">
      {isComplete ? (
        <MarkdownContent content={displayContent} className={className} />
      ) : (
        <div className={`typewriter-plain message-body assistant-body ${className ?? ""}`.trim()}>
          <span className="typewriter-plain-text">{visibleText}</span>
          <span className="typewriter-cursor" aria-hidden="true" />
        </div>
      )}
      {isTyping && (
        <button
          type="button"
          className="btn ghost small typewriter-skip-btn"
          onClick={skip}
        >
          Show full answer
        </button>
      )}
    </div>
  );
}

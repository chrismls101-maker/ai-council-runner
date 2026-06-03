import type { AnchorHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export interface MarkdownContentProps {
  content: string;
  className?: string;
  compact?: boolean;
}

function SafeLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (!href) return <span {...rest}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="md-link"
      {...rest}
    >
      {children}
    </a>
  );
}

export default function MarkdownContent({
  content,
  className,
  compact = false,
}: MarkdownContentProps) {
  if (!content.trim()) return null;

  const classes = [
    "markdown-content",
    className,
    compact ? "markdown-content-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: SafeLink,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

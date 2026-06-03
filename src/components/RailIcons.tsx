interface RailIconProps {
  name: string;
  size?: number;
}

export default function RailIcon({ name, size = 20 }: RailIconProps) {
  const s = size;
  const stroke = 1.75;

  switch (name) {
    case "history":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={stroke} />
          <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "learning":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
          <path d="M6 11v4.5c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5V11" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
        </svg>
      );
    case "benchmark":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19V5M10 19V9M16 19V12M22 19V7" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "memory":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "context":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path d="M14 3v5h5M10 13h4M10 17h4" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "research":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "plans":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            strokeWidth={stroke}
          />
        </svg>
      );
    case "trust":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

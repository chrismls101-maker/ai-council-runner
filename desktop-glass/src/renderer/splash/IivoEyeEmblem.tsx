/** Vector IIVO eye emblem — scales cleanly, no PNG transparency artifacts. */
export function IivoEyeEmblem({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      role="img"
      aria-label="IIVO"
    >
      <defs>
        <linearGradient id="frameOuter" x1="18%" y1="8%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="#f8fcff" />
          <stop offset="20%" stopColor="#d4e0ec" />
          <stop offset="45%" stopColor="#9aafc4" />
          <stop offset="68%" stopColor="#647a90" />
          <stop offset="100%" stopColor="#3e5166" />
        </linearGradient>
        <linearGradient id="frameInner" x1="30%" y1="15%" x2="70%" y2="85%">
          <stop offset="0%" stopColor="#eef6fc" />
          <stop offset="40%" stopColor="#b0c2d4" />
          <stop offset="100%" stopColor="#5a7088" />
        </linearGradient>
        <radialGradient id="irisWell" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#142030" />
          <stop offset="70%" stopColor="#0a121c" />
          <stop offset="100%" stopColor="#050810" />
        </radialGradient>
        <linearGradient id="bladeMetal" x1="50%" y1="5%" x2="50%" y2="95%">
          <stop offset="0%" stopColor="#f0f6fc" />
          <stop offset="12%" stopColor="#c5d4e4" />
          <stop offset="38%" stopColor="#8fa3b8" />
          <stop offset="65%" stopColor="#5e748a" />
          <stop offset="100%" stopColor="#42566a" />
        </linearGradient>
        <radialGradient id="coreLens" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="12%" stopColor="#e8fbff" />
          <stop offset="35%" stopColor="#6ee4ff" />
          <stop offset="62%" stopColor="#28b8e8" />
          <stop offset="100%" stopColor="#0d4a6e" />
        </radialGradient>
        <radialGradient id="ambientGlow" cx="50%" cy="50%" r="50%">
          <stop offset="50%" stopColor="rgba(56,225,255,0)" />
          <stop offset="85%" stopColor="rgba(56,225,255,0.28)" />
          <stop offset="100%" stopColor="rgba(56,225,255,0.5)" />
        </radialGradient>
        <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="rimGlow">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <path
          id="blade"
          d="M256 256 L256 138 C284 142 336 178 352 228 C360 256 348 286 318 304 C290 318 256 308 256 256 Z"
        />
        <path
          id="almondInner"
          d="M256 104 C162 118 98 178 92 256 C98 334 162 394 256 408 C350 394 414 334 420 256 C414 178 350 118 256 104 Z"
        />
      </defs>

      <ellipse cx="256" cy="256" rx="220" ry="155" fill="url(#ambientGlow)" />

      <path
        fill="url(#frameOuter)"
        fillRule="evenodd"
        d="M256 68 C385 86 466 172 472 256 C466 340 385 426 256 444 C127 426 46 340 40 256 C46 172 127 86 256 68 Z M256 104 C162 118 98 178 92 256 C98 334 162 394 256 408 C350 394 414 334 420 256 C414 178 350 118 256 104 Z"
      />

      <use href="#almondInner" fill="none" stroke="#4de8ff" strokeWidth="2.8" strokeOpacity="0.8" filter="url(#rimGlow)" />

      <ellipse cx="256" cy="258" rx="168" ry="118" fill="url(#frameInner)" opacity="0.95" />

      <circle cx="256" cy="256" r="122" fill="url(#frameInner)" stroke="#7eb0c8" strokeWidth="1.5" />
      <circle
        cx="256"
        cy="256"
        r="122"
        fill="none"
        stroke="#38e1ff"
        strokeWidth="2.2"
        strokeOpacity="0.7"
        filter="url(#rimGlow)"
      />

      <circle cx="256" cy="256" r="100" fill="url(#irisWell)" />

      <g fill="url(#bladeMetal)" stroke="rgba(15,28,42,0.5)" strokeWidth="0.9" strokeLinejoin="round">
        <use href="#blade" transform="rotate(0 256 256)" />
        <use href="#blade" transform="rotate(60 256 256)" />
        <use href="#blade" transform="rotate(120 256 256)" />
        <use href="#blade" transform="rotate(180 256 256)" />
        <use href="#blade" transform="rotate(240 256 256)" />
        <use href="#blade" transform="rotate(300 256 256)" />
      </g>

      <g fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.4">
        <use href="#blade" transform="rotate(0 256 256)" />
        <use href="#blade" transform="rotate(60 256 256)" />
        <use href="#blade" transform="rotate(120 256 256)" />
        <use href="#blade" transform="rotate(180 256 256)" />
        <use href="#blade" transform="rotate(240 256 256)" />
        <use href="#blade" transform="rotate(300 256 256)" />
      </g>

      <circle cx="256" cy="256" r="36" fill="url(#coreLens)" filter="url(#cyanGlow)" />
      <circle cx="256" cy="256" r="36" fill="none" stroke="rgba(160,235,255,0.55)" strokeWidth="1.2" />

      <ellipse cx="242" cy="240" rx="11" ry="8" fill="#fff" opacity="0.95" transform="rotate(-20 242 240)" />
      <ellipse cx="250" cy="250" rx="20" ry="14" fill="rgba(255,255,255,0.1)" />

      <path
        fill="none"
        stroke="#b8f4ff"
        strokeWidth="5"
        strokeLinecap="round"
        filter="url(#rimGlow)"
        opacity="0.85"
        d="M188 194 C214 172 246 164 278 166 C298 168 312 176 324 186"
      />

      <path
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="4"
        strokeLinecap="round"
        d="M132 162 C176 122 220 106 264 100"
        opacity="0.65"
      />
    </svg>
  );
}

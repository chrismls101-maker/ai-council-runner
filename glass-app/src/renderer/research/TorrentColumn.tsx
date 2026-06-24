/**
 * TorrentColumn -- Canvas 2D live log renderer
 * Bottom-anchored, lines appear at bottom and scroll up.
 * Newest lines glow bright (LED effect), fade as they age.
 * Production-grade: tabular numerals, antialiased, DPR-correct.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { LineType } from './phaseContent';

export interface TorrentColumnHandle {
  push: (text: string, type?: LineType) => void;
  clear: () => void;
  restore: (lines: Array<{ text: string; type: LineType }>) => void;
}

interface Line {
  text: string;
  type: LineType;
  addedAt: number;
}

interface TorrentColumnProps {
  label: string;
}

const FLASH_MS = 900;
const FS = 10;
const LH = 17;
const PAD = 14;
const MASK_H = 52; // height of the invisible top mask

const TYPE_COLORS: Record<string, string> = {
  hit:    '96,165,250',   // blue
  signal: '34,197,94',    // green
  warn:   '251,191,36',   // amber
  normal: '255,255,255',
  dim:    '255,255,255',
  blank:  '255,255,255',
};

const TYPE_OPACITY: Record<string, number> = {
  hit:    0.85,
  signal: 0.85,
  warn:   0.85,
  normal: 0.55,
  dim:    0.28,
  blank:  0,
};

export const TorrentColumn = forwardRef<TorrentColumnHandle, TorrentColumnProps>(
  ({ label }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const linesRef  = useRef<Line[]>([]);
    const rafRef    = useRef<number>(0);
    const labelRef  = useRef(label);
    labelRef.current = label;

    // Imperative API
    useImperativeHandle(ref, () => ({
      push: (text: string, type: LineType = 'normal') => {
        linesRef.current.push({ text, type, addedAt: performance.now() });
      },
      clear: () => {
        linesRef.current = [];
      },
      restore: (lines: Array<{ text: string; type: LineType }>) => {
        const now = performance.now();
        linesRef.current = lines.map((line, index) => ({
          text: line.text,
          type: line.type,
          addedAt: now - (lines.length - index) * 120,
        }));
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      const resize = () => {
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();

      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      const draw = () => {
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        const now = performance.now();

        ctx.clearRect(0, 0, W, H);

        // Font -- monospace, antialiased via CSS, tabular via variant
        ctx.font = `${FS}px "JetBrains Mono","Fira Code","Menlo","Courier New",monospace`;
        ctx.textBaseline = 'top';

        const maxRows = Math.floor((H - MASK_H - 8) / LH);
        const visible = linesRef.current.slice(-maxRows);
        const startY  = H - visible.length * LH - 8;

        // Clip to column -- prevent text bleed
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, MASK_H, W, H - MASK_H);
        ctx.clip();

        visible.forEach((line, i) => {
          const y = startY + i * LH;
          if (y < MASK_H) return; // behind mask, skip

          const type   = line.type || 'normal';
          const rgb    = TYPE_COLORS[type] || TYPE_COLORS.normal;
          const alpha  = TYPE_OPACITY[type] ?? 0.55;
          const ageSec = (now - line.addedAt) / 1000;
          const fresh  = Math.max(0, 1 - ageSec / (FLASH_MS / 1000));

          if (type === 'blank') return;

          // LED glow for hit/signal/warn lines
          if ((type === 'hit' || type === 'signal' || type === 'warn') && fresh > 0.05) {
            const glow = fresh * 0.9;
            // Truncate text to fit column
            let display = line.text;
            while (display.length > 0 && ctx.measureText(display).width > W - PAD * 2 - 12) {
              display = display.slice(0, -1);
            }
            const textW = Math.min(ctx.measureText(display).width + 8, W - PAD - 8);

            // Background wash
            ctx.fillStyle = `rgba(${rgb},${fresh * 0.06})`;
            ctx.fillRect(PAD - 3, y - 1, textW, LH + 1);

            // LED borders
            ctx.save();
            ctx.shadowColor = `rgba(${rgb},${glow * 0.8})`;
            ctx.shadowBlur  = 5;
            ctx.fillStyle   = `rgba(${rgb},${glow * 0.95})`;
            ctx.fillRect(PAD - 3, y - 1,       textW, 1); // top
            ctx.fillRect(PAD - 3, y + LH - 1,  textW, 1); // bottom
            ctx.restore();
          }

          // Brightness boost for very fresh lines
          const brightBoost = fresh > 0.5 ? 0.25 * fresh : 0;

          // Truncate text to fit column width
          let display = line.text;
          while (display.length > 0 && ctx.measureText(display).width > W - PAD * 2) {
            display = display.slice(0, -1);
          }

          ctx.fillStyle = `rgba(${rgb},${Math.min(1, alpha + brightBoost)})`;
          ctx.fillText(display, PAD, y);
        });

        ctx.restore();

        rafRef.current = requestAnimationFrame(draw);
      };

      rafRef.current = requestAnimationFrame(draw);

      return () => {
        cancelAnimationFrame(rafRef.current);
        ro.disconnect();
      };
    }, []);

    return (
      <div className="torrent-column">
        <div className="torrent-label">{label}</div>
        <div className="torrent-mask" />
        <canvas
          ref={canvasRef}
          className="torrent-canvas"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    );
  }
);

TorrentColumn.displayName = 'TorrentColumn';

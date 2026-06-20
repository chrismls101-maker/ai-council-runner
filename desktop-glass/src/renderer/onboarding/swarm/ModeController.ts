// ModeController
// --------------
// Drives the BUILD clock that draws each form on. One unified, fast cadence for
// every form so transitions feel consistent:
//   erase : build 1 -> 0, current form un-draws (reverse), then mode switches
//   build : build 0 -> 1, the new form draws itself on, line by line
// Shared live fields the rest of the scene reads:
//   grow  : reasoning EXPANSION (grows while thinking -> bloom enlarges, camera
//           pulls back). Decoupled from build so the draw-on stays fast/consistent.
//   amber : status tint when the AI hits an error / is unsure
//   green : status tint when it resolves

const DURATION = 7.5;   // unified construction speed — slow, deliberate, intentional
const ERASE = 1.1;      // unified transition (un-draw) speed
const FLASH_FADE = 1.7; // completion burst fade (substrate / atom)

/** Exported for Sorting Hat — wait until first form finishes before speech. */
export const MANIFEST_BUILD_DURATION_S = DURATION;
export const MANIFEST_FLASH_FADE_S = FLASH_FADE;

type Phase = 'build' | 'erase';

export class ModeController {
  mode: number;
  pending: number;
  build: number;
  phase: Phase;
  grow: number;    // reasoning expansion (driven by thinking time)
  amber: number;   // status: error / unsure
  green: number;   // status: resolved
  flash: number;   // completion crystallization burst (1 -> 0)
  flashed: boolean;

  constructor(initial = 0) {
    this.mode = initial;
    this.pending = initial;
    this.build = 0;
    this.phase = 'build';
    this.grow = 0;
    this.amber = 0;
    this.green = 0;
    this.flash = 0;
    this.flashed = false;
  }

  /** Animated transition — erases current form then builds the new one (used for substrate). */
  setMode(id: number): void {
    this.pending = id;
    this.phase = 'erase';
    this.flashed = false; // allow the next completed form to flash
  }

  /**
   * Instant transition — snaps directly to the new mode, fully formed (build = 1).
   * Use for transient states like speaking (waveform) and listening (aperture) so
   * the focus form appears immediately without the 7.5 s draw-on construction.
   */
  setModeInstant(id: number): void {
    this.mode = id;
    this.pending = id;
    this.build = 1;
    this.phase = 'build';
    this.flash = 0;
    this.flashed = false;
  }

  tick(dt: number): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / FLASH_FADE); // fade the burst
    if (this.phase === 'erase') {
      this.build -= dt / ERASE;
      if (this.build <= 0) {
        this.build = 0;
        this.mode = this.pending;
        this.phase = 'build';
      }
    } else if (this.build < 1) {
      this.build = Math.min(1, this.build + dt / DURATION);
      // only the ATOM (mode 0) gets the completion ignition — it is the home state
      if (this.build >= 1 && !this.flashed && this.mode === 0) {
        this.flash = 1;
        this.flashed = true;
      }
    }
  }

  uniforms(): { mode: number; build: number } {
    return { mode: this.mode, build: this.build };
  }
}

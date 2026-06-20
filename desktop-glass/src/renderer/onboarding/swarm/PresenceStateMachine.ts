// PresenceStateMachine
// --------------------
// idle / manifesting / listening / thinking / speaking / dissolving.
// Each state defines TARGET scalars the SwarmMotionController eases toward.
//   resolve - how converged into the face (0 cloud .. 1 face)
//   turb    - curl-flow amplitude multiplier
//   mouth   - speech mouth motion
//   think   - outward thinking ripple
// Principle: stillness = intelligence. Resolved states are calm; only idle and
// dissolving are loose.

export type StateName = 'idle' | 'manifesting' | 'listening' | 'thinking' | 'speaking' | 'dissolving';

export const STATES: StateName[] = ['idle', 'manifesting', 'listening', 'thinking', 'speaking', 'dissolving'];

interface StateTargets {
  resolve: number;
  turb: number;
  mouth: number;
  think: number;
}

const TARGETS: Record<StateName, StateTargets> = {
  idle:        { resolve: 0.06, turb: 1.0,  mouth: 0, think: 0 },
  manifesting: { resolve: 1.0,  turb: 0.7,  mouth: 0, think: 0 },
  listening:   { resolve: 1.0,  turb: 0.30, mouth: 0, think: 0 },
  thinking:    { resolve: 0.93, turb: 0.55, mouth: 0, think: 1 },
  speaking:    { resolve: 1.0,  turb: 0.34, mouth: 1, think: 0 },
  dissolving:  { resolve: 0.0,  turb: 1.15, mouth: 0, think: 0 },
};

export class PresenceStateMachine {
  name: StateName;
  private _subs: Set<(name: StateName) => void>;

  constructor() {
    this.name = 'idle';
    this._subs = new Set();
  }

  set(name: StateName): void {
    if (!STATES.includes(name) || name === this.name) return;
    this.name = name;
    this._subs.forEach((fn) => fn(name));
  }

  targets(): StateTargets {
    return TARGETS[this.name];
  }

  isSpeaking(): boolean {
    return this.name === 'speaking';
  }

  subscribe(fn: (name: StateName) => void): () => void {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }
}

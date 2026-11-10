// The playback clock (PRD "Playback"). One number, the current day, drives
// the globe, the camera and the UI. It knows three things about time:
//   - the base rate (1 day per 0.5 s) and the person's speed (0.25x to 8x),
//   - pacing: stretches where nothing comes into view run faster,
//   - land ho: slow-motion moments ease time almost to a stop and hold.

export const BASE_RATE = 2; // days per second at 1x
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
export const HOLD_SECONDS = 7;
const RELEASE_SECONDS = 1.6;
const HISTORY_SECONDS = 5;

export interface ClockMoment {
  day: number;
  slowMotion?: boolean;
}

export type ClockEvent =
  | { type: 'moment'; index: number }
  | { type: 'landho'; index: number }
  | { type: 'resume' }
  | { type: 'end' };

/**
 * Per-day playback multiplier: 1 near anything worth seeing (new land, a
 * moment), rising to `max` across empty stretches.
 */
export function computePace(interest: number[], moments: ClockMoment[], max: number): Float32Array {
  const n = interest.length;
  const score = new Float32Array(n);
  for (let d = 0; d < n; d++) score[d] = interest[d];
  for (const m of moments) {
    const d = Math.round(m.day);
    for (let k = d - 1; k <= d + 1; k++) if (k >= 0 && k < n) score[k] = Math.max(score[k], 1);
  }
  const pace = new Float32Array(n);
  for (let d = 0; d < n; d++) {
    // Look further ahead than behind, so the slowdown starts before land appears.
    let near = 0;
    for (let k = d - 2; k <= d + 4; k++) if (k >= 0 && k < n) near = Math.max(near, score[k]);
    const quiet = 1 - smoothstep(0.0, 0.06, near);
    pace[d] = 1 + (max - 1) * quiet;
  }
  // Smooth so the counter speeds up and slows down rather than jumping.
  const out = new Float32Array(n);
  for (let d = 0; d < n; d++) {
    let s = 0;
    let w = 0;
    for (let k = d - 2; k <= d + 2; k++) {
      if (k < 0 || k >= n) continue;
      s += pace[k];
      w++;
    }
    out[d] = s / w;
  }
  return out;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Phase = { kind: 'run' } | { kind: 'hold'; index: number; t: number } | { kind: 'release'; t: number };

export class Clock {
  day = 0;
  speed = 1;
  playing = false;
  phase: Phase = { kind: 'run' };
  /** Wall-clock seconds since the clock was created; advances only in tick(). */
  now = 0;
  private hist: { t: number; day: number }[] = [];
  private next = 0;

  constructor(
    readonly days: number,
    readonly moments: ClockMoment[],
    readonly pace: Float32Array,
    readonly baseRate = BASE_RATE,
    /** Days per entry in `pace`. */
    readonly paceStep = 1,
  ) {
    this.seek(0);
  }

  get holding(): boolean {
    return this.phase.kind === 'hold';
  }

  paceAt(day: number): number {
    const n = this.pace.length;
    if (!n) return 1;
    const i = Math.max(0, Math.min(n - 1, day / this.paceStep));
    const a = Math.floor(i);
    const b = Math.min(n - 1, a + 1);
    return this.pace[a] + (this.pace[b] - this.pace[a]) * (i - a);
  }

  /** Days per second right now. */
  rate(): number {
    let r = this.baseRate * this.speed * this.paceAt(this.day);
    if (this.phase.kind === 'hold') return this.baseRate * 0.01;
    if (this.phase.kind === 'release') r *= Math.max(0.01, smoothstep(0, RELEASE_SECONDS, this.phase.t));
    const m = this.nextSlow();
    if (m && this.phase.kind === 'run') {
      const approach = this.baseRate * this.speed * 0.9;
      const dist = m.day - this.day;
      if (dist < approach) r *= 0.06 + 0.94 * smoothstep(0, approach, dist);
    }
    return r;
  }

  private nextSlow(): (ClockMoment & { index: number }) | null {
    for (let i = this.next; i < this.moments.length; i++) if (this.moments[i].slowMotion) return { ...this.moments[i], index: i };
    return null;
  }

  tick(dt: number): ClockEvent[] {
    const events: ClockEvent[] = [];
    dt = Math.min(dt, 0.1);
    // Paused time stands still, ink included: a paused reveal stays a drawing.
    if (!this.playing) return events;
    this.now += dt;
    {
      if (this.phase.kind === 'hold') {
        this.phase.t += dt;
        if (this.phase.t >= HOLD_SECONDS) {
          this.phase = { kind: 'release', t: 0 };
          events.push({ type: 'resume' });
        }
      } else if (this.phase.kind === 'release') {
        this.phase.t += dt;
        if (this.phase.t >= RELEASE_SECONDS) this.phase = { kind: 'run' };
      }
      const target = Math.min(this.days, this.day + this.rate() * dt);
      // Fire every moment crossed on the way; a land ho stops the clock at its day.
      while (this.next < this.moments.length && this.moments[this.next].day <= target) {
        const m = this.moments[this.next];
        if (m.slowMotion && this.phase.kind !== 'hold') {
          this.day = Math.max(this.day, m.day);
          this.phase = { kind: 'hold', index: this.next, t: 0 };
          events.push({ type: 'landho', index: this.next });
          this.next++;
          this.record();
          return events;
        }
        events.push({ type: 'moment', index: this.next });
        this.next++;
      }
      this.day = target;
      if (this.day >= this.days) {
        this.playing = false;
        this.phase = { kind: 'run' };
        events.push({ type: 'end' });
      }
    }
    this.record();
    return events;
  }

  /** Ends a land ho early (a tap). */
  resume() {
    if (this.phase.kind === 'hold') this.phase = { kind: 'release', t: 0 };
  }

  /** Jumps to a day. Everything already seen by then shows at once, in colour. */
  seek(day: number) {
    this.day = Math.max(0, Math.min(this.days, day));
    this.next = this.moments.findIndex((m) => m.day > this.day + 1e-6);
    if (this.next < 0) this.next = this.moments.length;
    this.phase = { kind: 'run' };
    this.hist = [{ t: this.now - HISTORY_SECONDS - 1, day: this.day }];
    this.record();
  }

  private record() {
    this.hist.push({ t: this.now, day: this.day });
    while (this.hist.length > 2 && this.hist[1].t < this.now - HISTORY_SECONDS) this.hist.shift();
  }

  /** The day `seconds` ago. */
  dayAgo(seconds: number): number {
    const t = this.now - seconds;
    const h = this.hist;
    if (t <= h[0].t) return h[0].day;
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1];
        const b = h[i];
        const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return a.day + (b.day - a.day) * k;
      }
    }
    return h[0].day;
  }

  /** History for the shader: the day 0, 0.5, ... 4 s ago. */
  history(out: number[]): number[] {
    for (let k = 0; k < 9; k++) out[k] = this.dayAgo(k * 0.5);
    return out;
  }
}

// Geometry for screen-space ribbons (shaders/line.vert): each segment is a
// quad of four vertices, two at each end, pushed sideways in the shader.

import { toVec } from './geo';

export interface Ribbon {
  position: Float32Array;
  other: Float32Array;
  side: Float32Array;
  t: Float32Array;
  dist: Float32Array;
  flag: Float32Array;
  index: Uint32Array;
}

export const LIFT = 1.0012;
const CROSS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export class RibbonBuilder {
  private pos: number[] = [];
  private oth: number[] = [];
  private sid: number[] = [];
  private tt: number[] = [];
  private dd: number[] = [];
  private ff: number[] = [];
  private idx: number[] = [];
  private n = 0;

  constructor(private readonly lift = LIFT) {}

  /** One segment from a to b. t, dist and flag are per end. */
  segment(a: [number, number], b: [number, number], ta: number, tb: number, da: number, db: number, flag: number) {
    const va = toVec(a[0], a[1]).map((x) => x * this.lift);
    const vb = toVec(b[0], b[1]).map((x) => x * this.lift);
    const base = this.n;
    // Two vertices at a, two at b. |side| 2 marks the b end, whose `other` is a,
    // so the shader reverses the direction there; the sign is the physical side.
    for (const [p, o, s, t, d] of [
      [va, vb, -1, ta, da],
      [va, vb, 1, ta, da],
      [vb, va, 2, tb, db],
      [vb, va, -2, tb, db],
    ] as const) {
      this.pos.push(p[0], p[1], p[2]);
      this.oth.push(o[0], o[1], o[2]);
      this.sid.push(s);
      this.tt.push(t);
      this.dd.push(d);
      this.ff.push(flag);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.n += 4;
  }

  build(): Ribbon {
    return {
      position: new Float32Array(this.pos),
      other: new Float32Array(this.oth),
      side: new Float32Array(this.sid),
      t: new Float32Array(this.tt),
      dist: new Float32Array(this.dd),
      flag: new Float32Array(this.ff),
      index: new Uint32Array(this.idx),
    };
  }
}

/**
 * Coastline and river segments a voyage reveals. A vertex counts as seen on
 * the earliest day its texel or one of its four neighbours was seen: enough
 * to ink a coast glimpsed from the sea, without lines running into the fog.
 */
export function buildCoastRibbon(lines: Float32Array, seen: Uint16Array, W: number, H: number, ticksPerDay: number, never: number): Ribbon {
  const b = new RibbonBuilder();
  const seenAt = (lon: number, lat: number) => {
    const x = Math.floor(((lon + 180) / 360) * W);
    const y = Math.floor(((90 - lat) / 180) * H);
    let best = never;
    for (const [dx, dy] of CROSS) {
      const yy = Math.min(H - 1, Math.max(0, y + dy));
      const v = seen[yy * W + ((((x + dx) % W) + W) % W)];
      if (v < best) best = v;
    }
    return best;
  };
  for (let k = 0; k < lines.length; ) {
    const n = lines[k];
    const kind = lines[k + 1];
    let prev: [number, number] | null = null;
    let prevSeen = never;
    for (let j = 0; j < n; j++) {
      const p: [number, number] = [lines[k + 2 + j * 2], lines[k + 3 + j * 2]];
      const s = seenAt(p[0], p[1]);
      if (prev && (s !== never || prevSeen !== never)) {
        const ta = prevSeen === never ? 1e9 : prevSeen / ticksPerDay;
        const tb = s === never ? 1e9 : s / ticksPerDay;
        b.segment(prev, p, ta, tb, 0, 0, kind);
      }
      prev = p;
      prevSeen = s;
    }
    k += 2 + n * 2;
  }
  return b.build();
}

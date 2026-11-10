// Questions about a baked route: where were they on day d, which way were
// they heading, and what does the whole path cover.

import type { BakedRoute, Mode } from '../data/types';
import { slerp, toLonLat, toVec, type Vec3 } from '../data/geo';

export const MODES: Mode[] = ['sea', 'river', 'land', 'ice'];

export interface PathPoint {
  lon: number;
  lat: number;
  day: number;
  dashed: boolean;
  mode: Mode;
  leg: number;
}

export function unpackPath(path: number[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i + 3 < path.length; i += 4) {
    const f = path[i + 3];
    out.push({ lon: path[i], lat: path[i + 1], day: path[i + 2], dashed: (f & 1) === 1, mode: MODES[(f >> 1) & 3], leg: f >> 3 });
  }
  return out;
}

export interface Vessel {
  leg: number;
  mode: Mode;
  vessel?: string;
  pos: Vec3;
  /** A point a little further along, for heading. */
  ahead: Vec3;
}

export class RouteIndex {
  readonly legs: PathPoint[][];

  constructor(
    readonly route: Pick<BakedRoute, 'legs'>,
    points: PathPoint[],
  ) {
    this.legs = route.legs.map(() => []);
    for (const p of points) this.legs[p.leg]?.push(p);
  }

  private at(leg: PathPoint[], day: number): Vec3 {
    if (day <= leg[0].day) return toVec(leg[0].lon, leg[0].lat);
    const last = leg[leg.length - 1];
    if (day >= last.day) return toVec(last.lon, last.lat);
    let lo = 0;
    let hi = leg.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (leg[mid].day <= day) lo = mid;
      else hi = mid;
    }
    const a = leg[lo];
    const b = leg[hi];
    const t = b.day > a.day ? (day - a.day) / (b.day - a.day) : 1;
    return slerp(toVec(a.lon, a.lat), toVec(b.lon, b.lat), t);
  }

  /** Every party under way (or waiting) on this day. Legs that have ended show nothing, except the last. */
  vessels(day: number): Vessel[] {
    const out: Vessel[] = [];
    let lastEnded = -1;
    this.route.legs.forEach((info, i) => {
      const pts = this.legs[i];
      if (!pts.length) return;
      if (day < info.startDay) return;
      if (day > info.endDay) {
        if (lastEnded < 0 || info.endDay >= this.route.legs[lastEnded].endDay) lastEnded = i;
        return;
      }
      out.push(this.vesselOn(i, day));
    });
    if (!out.length && lastEnded >= 0) out.push(this.vesselOn(lastEnded, day));
    return out;
  }

  private vesselOn(i: number, day: number): Vessel {
    const info = this.route.legs[i];
    const pts = this.legs[i];
    const pos = this.at(pts, day);
    let ahead = this.at(pts, day + 0.6);
    if (dist(ahead, pos) < 1e-5) {
      const behind = this.at(pts, day - 0.6);
      ahead = [2 * pos[0] - behind[0], 2 * pos[1] - behind[1], 2 * pos[2] - behind[2]];
    }
    return { leg: i, mode: info.mode, vessel: info.vessel, pos, ahead };
  }

  /** The leading party, for the camera: the first leg under way. */
  lead(day: number): Vessel | null {
    return this.vessels(day)[0] ?? null;
  }
}

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Centre and angular radius (radians) of a set of points, for framing the ending. */
export function spread(points: { lon: number; lat: number }[]): { center: Vec3; radius: number } {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const v = toVec(p.lon, p.lat);
    x += v[0];
    y += v[1];
    z += v[2];
  }
  const n = Math.hypot(x, y, z);
  if (n < 1e-6 * points.length) return { center: toVec(0, 0), radius: Math.PI };
  const c: Vec3 = [x / n, y / n, z / n];
  let r = 0;
  for (const p of points) {
    const v = toVec(p.lon, p.lat);
    r = Math.max(r, Math.acos(Math.max(-1, Math.min(1, v[0] * c[0] + v[1] * c[1] + v[2] * c[2]))));
  }
  return { center: c, radius: r };
}

export { toLonLat };

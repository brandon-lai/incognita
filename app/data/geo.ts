// Sphere math shared by the bake and the globe. Unit sphere, y up, with the
// same orientation as three.js SphereGeometry's UVs: lon -180 at -X, lon 0 at
// +X, lon 90 at -Z.

export const EARTH_KM = 6371;
const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

export function toVec(lon: number, lat: number): Vec3 {
  const p = lat * RAD;
  const l = lon * RAD;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

export function toLonLat(v: Vec3): [number, number] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [Math.atan2(-v[2], v[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, v[1] / n))) / RAD];
}

/** Great-circle distance in km. */
export function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point a fraction t along the great circle between two points. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return [a[0], a[1], a[2]];
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

export function interpolate(lon1: number, lat1: number, lon2: number, lat2: number, t: number): [number, number] {
  return toLonLat(slerp(toVec(lon1, lat1), toVec(lon2, lat2), t));
}

/** Wraps a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Horizon distance in km for an eye (or a summit) h metres up: about 3.57 * sqrt(h). */
export function horizonKm(h: number): number {
  return 3.57 * Math.sqrt(Math.max(0, h));
}

// The camera: always looking at the globe's centre from a point above
// `center`, north up. It follows the expedition with a gentle lag; a drag
// takes over until "Back to the voyage".

import type { Vec3 } from '../data/geo';

export const MIN_DISTANCE = 1.06;
export const MAX_DISTANCE = 4.2;

const norm = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class Orbit {
  center: Vec3 = [1, 0, 0];
  distance = 3;
  target: Vec3 = [1, 0, 0];
  targetDistance = 3;
  /** Seconds for the camera to close most of the gap to its target. */
  lag = 1.1;
  follow = true;
  up: Vec3 = [0, 1, 0];
  /** The person's zoom while following: multiplies the follow altitude. */
  userZoom = 1;
  /** Spin around the polar axis, radians per second (landing globe, wide endings). */
  spin = 0;

  constructor(readonly fovDeg = 40) {}

  /** North-up frame at the current centre. */
  frame(): { up: Vec3; right: Vec3 } {
    const c = this.center;
    let up: Vec3 = [-c[0] * c[1], 1 - c[1] * c[1], -c[2] * c[1]];
    if (Math.hypot(up[0], up[1], up[2]) < 1e-4) up = this.up;
    up = norm(up);
    this.up = up;
    const right = norm(cross([-c[0], -c[1], -c[2]], up));
    return { up, right };
  }

  update(dt: number) {
    if (this.spin) {
      const a = this.spin * dt;
      const [x, y, z] = this.target;
      this.target = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
    }
    const k = 1 - Math.exp(-dt / Math.max(0.01, this.lag));
    const c = this.center;
    const t = this.target;
    const d = Math.max(-1, Math.min(1, dot(c, t)));
    if (d < 0.999999) {
      const w = Math.acos(d) * k;
      // Rotate c toward t by w.
      const axis = norm(cross(c, t));
      const ortho = cross(axis, c);
      this.center = norm([c[0] * Math.cos(w) + ortho[0] * Math.sin(w), c[1] * Math.cos(w) + ortho[1] * Math.sin(w), c[2] * Math.cos(w) + ortho[2] * Math.sin(w)]);
    } else {
      this.center = t;
    }
    this.distance += (this.targetDistance - this.distance) * k;
  }

  /** Radians of globe per screen pixel at the centre. */
  private perPixel(heightPx: number) {
    const span = 2 * Math.max(0.02, this.distance - 1) * Math.tan((this.fovDeg * Math.PI) / 360);
    return span / Math.max(1, heightPx);
  }

  drag(dx: number, dy: number, heightPx: number) {
    this.follow = false;
    this.spin = 0;
    const a = this.perPixel(heightPx);
    const { up, right } = this.frame();
    const c = this.center;
    let n = norm([c[0] - right[0] * dx * a + up[0] * dy * a, c[1] - right[1] * dx * a + up[1] * dy * a, c[2] - right[2] * dx * a + up[2] * dy * a]);
    // Keep the poles reachable but never exactly under the camera.
    if (Math.abs(n[1]) > 0.9995) n = norm([n[0] + 1e-3, Math.sign(n[1]) * 0.9995, n[2]]);
    this.center = n;
    this.target = n;
  }

  zoom(factor: number) {
    this.userZoom = Math.max(0.12, Math.min(5, this.userZoom * factor));
    const alt = Math.max(MIN_DISTANCE - 1, Math.min(MAX_DISTANCE - 1, (this.targetDistance - 1) * factor));
    this.targetDistance = 1 + alt;
    this.distance = 1 + Math.max(MIN_DISTANCE - 1, Math.min(MAX_DISTANCE - 1, (this.distance - 1) * factor));
  }

  /** Altitude scaled by the person's zoom, clamped to the allowed range. */
  zoomed(distance: number): number {
    return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, 1 + (distance - 1) * this.userZoom));
  }

  /** Camera distance that fits points within `radius` radians of the centre on screen. */
  fitDistance(radius: number, aspect: number): number {
    if (radius > 1.25) return 3.3;
    const half = (Math.min(1, aspect) * this.fovDeg * Math.PI) / 360;
    const a = Math.max(0.05, half * 0.8);
    return Math.max(1.25, Math.min(3.3, Math.cos(radius) + Math.sin(radius) / Math.tan(a)));
  }

  position(): Vec3 {
    return [this.center[0] * this.distance, this.center[1] * this.distance, this.center[2] * this.distance];
  }
}

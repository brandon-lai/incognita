import { describe, expect, it } from 'vitest';
import { toLonLat } from '../data/geo';
import { RouteIndex, spread, unpackPath } from './route';

// Two legs that run in parallel from day 10 (Lewis and Clark's split).
const path = [
  // leg 0: day 0 to 20, solid
  0, 0, 0, 0,
  10, 0, 10, 0 | (2 << 1),
  20, 0, 20, 0 | (2 << 1),
  // leg 1: day 10 to 20, dashed, river
  10, 0, 10, 1 | (1 << 1) | (1 << 3),
  10, 10, 20, 1 | (1 << 1) | (1 << 3),
];
const legs = [
  { mode: 'sea' as const, startDay: 0, endDay: 20 },
  { mode: 'river' as const, startDay: 10, endDay: 20 },
];

describe('route', () => {
  it('unpacks the flags', () => {
    const pts = unpackPath(path);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toMatchObject({ dashed: false, mode: 'sea', leg: 0 });
    expect(pts[1]).toMatchObject({ mode: 'land', leg: 0 });
    expect(pts[3]).toMatchObject({ dashed: true, mode: 'river', leg: 1 });
  });

  it('finds every party under way', () => {
    const r = new RouteIndex({ legs }, unpackPath(path));
    expect(r.vessels(5)).toHaveLength(1);
    expect(r.vessels(15)).toHaveLength(2);
    const [lon, lat] = toLonLat(r.vessels(5)[0].pos);
    expect(lon).toBeCloseTo(5, 3);
    expect(lat).toBeCloseTo(0, 3);
  });

  it('keeps showing the last party after the route ends', () => {
    const r = new RouteIndex({ legs }, unpackPath(path));
    expect(r.vessels(25)).toHaveLength(1);
  });

  it('frames a set of points', () => {
    const s = spread([
      { lon: -10, lat: 0 },
      { lon: 10, lat: 0 },
    ]);
    const [lon] = toLonLat(s.center);
    expect(lon).toBeCloseTo(0, 6);
    expect(s.radius).toBeCloseTo((10 * Math.PI) / 180, 6);
  });
});

import { describe, expect, it } from 'vitest';
import { distanceKm, horizonKm, interpolate, toLonLat, toVec, wrapLon } from './geo';

describe('sphere', () => {
  it('matches three.js SphereGeometry orientation', () => {
    expect(toVec(0, 0).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([1, 0, -0]);
    expect(toVec(90, 0)[2]).toBeCloseTo(-1);
    expect(toVec(-180, 0)[0]).toBeCloseTo(-1);
    expect(toVec(0, 90)[1]).toBeCloseTo(1);
  });

  it('round-trips longitude and latitude', () => {
    for (const [lon, lat] of [
      [-74.5, 24.05],
      [144.6, 13.28],
      [-163.8, -78.55],
      [179.9, -10],
    ]) {
      const [a, b] = toLonLat(toVec(lon, lat));
      expect(a).toBeCloseTo(lon, 6);
      expect(b).toBeCloseTo(lat, 6);
    }
  });

  it('measures great circles', () => {
    expect(distanceKm(-0.1276, 51.5072, 2.3522, 48.8566)).toBeCloseTo(344, -1);
    expect(distanceKm(0, 0, 180, 0)).toBeCloseTo(Math.PI * 6371, 0);
  });

  it('interpolates across the antimeridian the short way', () => {
    const [lon, lat] = interpolate(170, 0, -170, 0, 0.5);
    expect(Math.abs(lon)).toBeCloseTo(180, 4);
    expect(lat).toBeCloseTo(0, 6);
  });

  it('wraps longitudes', () => {
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
  });

  it('gives a 25 m masthead about 18 km of horizon', () => {
    expect(horizonKm(25)).toBeCloseTo(17.85, 2);
  });
});

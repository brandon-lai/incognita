import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decode, encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import type { BakedRoute, Voyage } from '../../app/data/types';
import { NEVER_SEEN, TICKS_PER_DAY } from '../../app/data/types';
import { distanceKm } from '../../app/data/geo';
import { BAKED, VOYAGES } from './paths';
import { addCoverage, fillGeometry } from './raster';
import { halve, sampleLeg, validate } from './voyage';

const voyages = readdirSync(VOYAGES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, v: JSON.parse(readFileSync(join(VOYAGES, f), 'utf8')) as Voyage }));

describe('voyage data', () => {
  it.each(voyages.map((x) => [x.file, x.v] as const))('%s passes validation', (file, v) => {
    expect(validate(v, file)).toEqual([]);
  });

  it.each(voyages.map((x) => [x.file, x.v] as const))('%s follows the accuracy rules', (_file, v) => {
    // Rule 1: nothing is presented as reviewed until a person has reviewed it.
    expect(['draft', 'placeholder']).toContain(v.status);
    // Rule 5: say what the source is.
    expect(v.sourceNote.length).toBeGreaterThan(40);
    // Two sentences on the card.
    expect(v.summary.split(/(?<=[.!?])\s+/).filter(Boolean)).toHaveLength(2);
    for (const m of v.moments) {
      // Rule 4: quotes only from public-domain sources, kept short.
      if (m.isQuote) {
        expect(v.sources.find((s) => s.id === m.sourceId)?.publicDomain).toBe(true);
        expect(m.text.length).toBeLessThan(240);
      }
    }
    // Every point carries a confidence; documented points name their source.
    for (const leg of v.legs)
      for (const p of leg.points) {
        expect(['documented', 'reconstructed', 'interpolated']).toContain(p.confidence);
        if (p.confidence === 'documented') expect(p.sourceId).toBeTruthy();
      }
  });

  it('rejects bad data', () => {
    const v = structuredClone(voyages[0].v);
    v.legs[0].points[1].date = '1400-01-01';
    v.moments[0].sourceId = 'nobody';
    v.moments[1].isQuote = true;
    v.sources.find((s) => s.id === v.moments[1].sourceId)!.publicDomain = false;
    const problems = validate(v, 'x.json');
    expect(problems.some((p) => p.includes('comes before'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown source nobody'))).toBe(true);
    expect(problems.some((p) => p.includes('public-domain'))).toBe(true);
  });

  it('sleeps no ship through a moment: every moment falls inside its voyage', () => {
    for (const { v } of voyages) {
      const route = JSON.parse(readFileSync(join(BAKED, v.id, 'route.json'), 'utf8')) as BakedRoute;
      for (const m of route.moments) {
        expect(m.day).toBeGreaterThanOrEqual(0);
        expect(m.day).toBeLessThanOrEqual(route.days);
      }
    }
  });
});

describe('sampling', () => {
  it('samples legs evenly and interpolates days by distance', () => {
    const leg = {
      mode: 'sea' as const,
      points: [
        { date: '1492-08-03', lat: 0, lon: 0, confidence: 'documented' as const, sourceId: 'x' },
        { date: '1492-08-13', lat: 0, lon: 1, confidence: 'interpolated' as const },
      ],
    };
    const s = sampleLeg(leg, 0, '1492-08-03', 'julian', 4);
    for (let i = 1; i < s.length; i++) expect(distanceKm(s[i - 1].lon, s[i - 1].lat, s[i].lon, s[i].lat)).toBeLessThanOrEqual(4.01);
    expect(s[0].day).toBe(0);
    expect(s[s.length - 1].day).toBe(10);
    expect(s[Math.floor(s.length / 2)].day).toBeCloseTo(5, 0);
    expect(s[1].dashed).toBe(true);
  });
});

describe('raster', () => {
  it('fills polygons by pixel centre, with holes', () => {
    const grid = { width: 360, height: 180 };
    const seen = new Set<number>();
    fillGeometry(
      {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
          [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
        ],
      },
      grid,
      (x, y) => seen.add(y * 360 + x),
    );
    expect(seen.size).toBe(100 - 36);
  });

  it('wraps polygons that cross the antimeridian', () => {
    const grid = { width: 360, height: 180 };
    const xs = new Set<number>();
    fillGeometry({ type: 'Polygon', coordinates: [[[175, 0], [185, 0], [185, 1], [175, 1], [175, 0]]] }, grid, (x) => xs.add(x));
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 355, 356, 357, 358, 359]);
  });

  it('adds fractional coverage at span ends', () => {
    const cov = new Float32Array(10);
    addCoverage(cov, 10, 0, 1.5, 3.25, 1);
    expect([...cov.slice(0, 5)]).toEqual([0, 0.5, 1, 0.25, 0]);
  });
});

describe('first-seen textures', () => {
  it('store day numbers losslessly in 16 bits, past 255', () => {
    const data = new Uint16Array([0, 1, 255, 256, 1082 * TICKS_PER_DAY, NEVER_SEEN]);
    const png = decode(encode({ width: 6, height: 1, data, channels: 1, depth: 16 }));
    expect([...(png.data as Uint16Array)]).toEqual([...data]);
  });

  it('keep the earliest day when halved', () => {
    const seen = new Uint16Array([5, 9, 7, NEVER_SEEN, NEVER_SEEN, NEVER_SEEN, NEVER_SEEN, 3]);
    expect([...halve(seen, 4, 2)]).toEqual([5, 3]);
  });

  it.each(voyages.map((x) => [x.v.id] as const))('are baked for %s', (id) => {
    for (const size of [8192, 4096]) {
      const path = join(BAKED, id, `firstseen-${size}.png`);
      expect(existsSync(path)).toBe(true);
      const png = decode(readFileSync(path));
      expect(png.width).toBe(size);
      expect(png.depth).toBe(16);
    }
  });
});

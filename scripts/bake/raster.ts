// Polygon rasterising on an equirectangular grid (x = lon, y = -lat), with
// even-odd filling so holes work. Longitudes may run past ±180 (a hand-drawn
// polygon that crosses the antimeridian); spans wrap around the grid.

import type { Geometry, Position } from '../../app/data/types';

export interface Grid {
  width: number;
  height: number;
}

export const lonToX = (lon: number, W: number) => ((lon + 180) / 360) * W;
export const latToY = (lat: number, H: number) => ((90 - lat) / 180) * H;

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Calls span(y, xa, xb) for every horizontal span inside the polygon at sub-row centres. */
export function scanPolygon(
  rings: Position[][],
  grid: Grid,
  subRows: number,
  span: (row: number, xa: number, xb: number) => void,
) {
  const { width: W, height: H } = grid;
  const S = H * subRows;
  const edges: Edge[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const y0 = latToY(a[1], S);
      const y1 = latToY(b[1], S);
      if (y0 === y1) continue;
      edges.push({ x0: lonToX(a[0], W), y0, x1: lonToX(b[0], W), y1 });
      minY = Math.min(minY, y0, y1);
      maxY = Math.max(maxY, y0, y1);
    }
  }
  if (!edges.length) return;
  // Bucket edges by the first sub-row whose centre they cross.
  const r0 = Math.max(0, Math.floor(minY - 0.5));
  const r1 = Math.min(S - 1, Math.ceil(maxY + 0.5));
  const buckets: Edge[][] = Array.from({ length: r1 - r0 + 1 }, () => []);
  for (const e of edges) {
    const lo = Math.min(e.y0, e.y1);
    const first = Math.max(r0, Math.ceil(lo - 0.5));
    if (first <= r1) buckets[first - r0].push(e);
  }
  let active: Edge[] = [];
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const yc = r + 0.5;
    active = active.filter((e) => Math.max(e.y0, e.y1) > yc);
    for (const e of buckets[r - r0]) if (Math.max(e.y0, e.y1) > yc) active.push(e);
    xs.length = 0;
    for (const e of active) {
      const lo = Math.min(e.y0, e.y1);
      if (yc < lo) continue;
      xs.push(e.x0 + ((yc - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = Math.floor(r / subRows);
    for (let i = 0; i + 1 < xs.length; i += 2) span(row, xs[i], xs[i + 1]);
  }
}

export function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** Adds fractional coverage of [xa, xb) on one row, wrapping around the grid. */
export function addCoverage(cov: Float32Array, W: number, row: number, xa: number, xb: number, weight: number) {
  if (xb <= xa) return;
  if (xb - xa >= W) {
    for (let i = 0; i < W; i++) cov[row * W + i] += weight;
    return;
  }
  const shift = Math.floor(xa / W) * W;
  xa -= shift;
  xb -= shift;
  if (xb > W) {
    addCoverage(cov, W, row, xa, W, weight);
    addCoverage(cov, W, row, 0, xb - W, weight);
    return;
  }
  const base = row * W;
  const ia = Math.floor(xa);
  const ib = Math.floor(xb);
  if (ia === ib) {
    cov[base + ia] += (xb - xa) * weight;
    return;
  }
  cov[base + ia] += (ia + 1 - xa) * weight;
  for (let i = ia + 1; i < ib; i++) cov[base + i] += weight;
  if (ib < W) cov[base + ib] += (xb - ib) * weight;
}

/** Calls fn(x, y) for every pixel whose centre is inside the polygons. */
export function fillGeometry(g: Geometry, grid: Grid, fn: (x: number, y: number) => void) {
  const W = grid.width;
  for (const rings of polygonsOf(g)) {
    scanPolygon(rings, grid, 1, (row, xa, xb) => {
      const a = Math.ceil(xa - 0.5);
      const b = Math.ceil(xb - 0.5);
      for (let x = a; x < b; x++) fn(((x % W) + W) % W, row);
    });
  }
}

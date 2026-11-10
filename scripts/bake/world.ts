// Shared world assets, baked once for every voyage:
//   public/imagery/earth-{8192,4096}.jpg      Blue Marble, stitched from the GIBS tiles
//   public/baked/world/coast-{8192,4096}.png  R: land coverage, G: distance from land at sea (km * 4)
//   public/baked/world/coastlines.bin         Natural Earth coastlines + major rivers as polylines
//   .cache/land-8192.bin                      land coverage for the voyage bakes

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encode } from 'fast-png';
import sharp from 'sharp';
import type { FeatureCollection, Position } from '../../app/data/types';
import { distanceKm } from './edt';
import { IMAGERY_TILES } from './fetch';
import { BAKED, CACHE, ROOT } from './paths';
import { addCoverage, polygonsOf, scanPolygon } from './raster';

const W = 8192;
const H = 4096;
const SUB = 4;

const readGeo = (name: string) => JSON.parse(readFileSync(join(CACHE, name), 'utf8')) as FeatureCollection & {
  features: { properties: Record<string, unknown> | null }[];
};

async function imagery() {
  const out = join(ROOT, 'public', 'imagery');
  mkdirSync(out, { recursive: true });
  const T = 2048;
  const composite = IMAGERY_TILES.map((t) => ({ input: join(CACHE, t.name), left: t.col * T, top: t.row * T }));
  const full = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite(composite)
    .removeAlpha() // composite adds an alpha channel; the raw buffer below is RGB
    .raw()
    .toBuffer();
  const img = () => sharp(full, { raw: { width: W, height: H, channels: 3 } });
  await img().jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, 'earth-8192.jpg'));
  await img().resize(4096, 2048, { kernel: 'lanczos3' }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(out, 'earth-4096.jpg'));
  await img().resize(2048, 1024, { kernel: 'lanczos3' }).jpeg({ quality: 85, mozjpeg: true }).toFile(join(out, 'earth-2048.jpg'));
}

function landCoverage(): Float32Array {
  const cov = new Float32Array(W * H);
  const add = (name: string, weight: number, keep: (p: Record<string, unknown> | null) => boolean = () => true) => {
    for (const f of readGeo(name).features) {
      if (!keep(f.properties)) continue;
      for (const rings of polygonsOf(f.geometry)) {
        scanPolygon(rings, { width: W, height: H }, SUB, (row, xa, xb) => addCoverage(cov, W, row, xa, xb, weight / SUB));
      }
    }
  };
  add('ne_10m_land.geojson', 1);
  add('ne_10m_minor_islands.geojson', 1);
  add('ne_10m_antarctic_ice_shelves_polys.geojson', 1);
  for (let i = 0; i < cov.length; i++) cov[i] = Math.min(1, cov[i]);
  // Large lakes read as water on a chart.
  const lakes = new Float32Array(W * H);
  for (const f of readGeo('ne_10m_lakes.geojson').features) {
    if (Number(f.properties?.scalerank ?? 99) > 2) continue;
    for (const rings of polygonsOf(f.geometry)) {
      scanPolygon(rings, { width: W, height: H }, SUB, (row, xa, xb) => addCoverage(lakes, W, row, xa, xb, 1 / SUB));
    }
  }
  for (let i = 0; i < cov.length; i++) cov[i] = Math.max(0, cov[i] - Math.min(1, lakes[i]));
  return cov;
}

function coastTexture(cov: Float32Array, w: number, h: number): Uint8Array {
  const dist = distanceKm((i) => cov[i] >= 0.5, w, h, 20015 / h);
  const out = new Uint8Array(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    out[i * 2] = Math.round(cov[i] * 255);
    out[i * 2 + 1] = Math.min(255, Math.round(dist[i] * 4));
  }
  return out;
}

function downsample(cov: Float32Array): Float32Array {
  const w = W / 2;
  const h = H / 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * 2 * W + x * 2;
      out[y * w + x] = (cov[i] + cov[i + 1] + cov[i + W] + cov[i + W + 1]) / 4;
    }
  return out;
}

/** Douglas–Peucker in degrees, with longitude scaled by cos(latitude). */
function simplify(line: Position[], tol: number): Position[] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const k = Math.cos((line[a][1] * Math.PI) / 180);
    const ax = line[a][0] * k;
    const ay = line[a][1];
    const bx = line[b][0] * k;
    const by = line[b][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const px = line[i][0] * k - ax;
      const py = line[i][1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Polylines as one Float32Array: [count, kind, lon, lat, lon, lat, ...] per line. kind 0 coast, 1 river. */
function coastlines(): { data: Float32Array; vertices: number } {
  const parts: number[] = [];
  let vertices = 0;
  const push = (line: Position[], kind: number) => {
    if (line.length < 2) return;
    parts.push(line.length, kind);
    for (const [lon, lat] of line) parts.push(lon, lat);
    vertices += line.length;
  };
  const linesOf = (g: { type: string; coordinates: unknown }): Position[][] =>
    g.type === 'LineString' ? [g.coordinates as Position[]] : g.type === 'MultiLineString' ? (g.coordinates as Position[][]) : [];
  for (const f of readGeo('ne_10m_coastline.geojson').features)
    for (const l of linesOf(f.geometry)) push(simplify(l, 0.012), 0);
  for (const f of readGeo('ne_10m_rivers_lake_centerlines.geojson').features) {
    if (Number(f.properties?.scalerank ?? 99) > 6) continue;
    for (const l of linesOf(f.geometry)) push(simplify(l, 0.02), 1);
  }
  return { data: new Float32Array(parts), vertices };
}

async function main() {
  const t0 = Date.now();
  const log = (s: string) => process.stdout.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}\n`);
  const outDir = join(BAKED, 'world');
  mkdirSync(outDir, { recursive: true });

  if (!existsSync(join(ROOT, 'public', 'imagery', 'earth-8192.jpg')) || process.argv.includes('--force')) {
    await imagery();
    log('imagery');
  }

  const cov = landCoverage();
  writeFileSync(join(CACHE, 'land-8192.bin'), Buffer.from(Uint8Array.from(cov, (v) => Math.round(v * 255))));
  log('land coverage');

  writeFileSync(join(outDir, 'coast-8192.png'), encode({ width: W, height: H, data: coastTexture(cov, W, H), channels: 2, depth: 8 }));
  const half = downsample(cov);
  writeFileSync(join(outDir, 'coast-4096.png'), encode({ width: W / 2, height: H / 2, data: coastTexture(half, W / 2, H / 2), channels: 2, depth: 8 }));
  log('coast textures');

  const lines = coastlines();
  writeFileSync(join(outDir, 'coastlines.bin'), Buffer.from(lines.data.buffer));
  log(`coastlines: ${lines.vertices} vertices, ${(lines.data.byteLength / 1e6).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// pnpm bake [voyage-id ...]
//
// Bakes every voyage in data/voyages (or the ones named) into
// public/baked/<id>/, then the world-uncovering timeline from all of them.
// Run `pnpm fetch-data` and `pnpm tsx scripts/bake/world.ts` first.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encode } from 'fast-png';
import type { BakedRoute, GeoJSON, Voyage } from '../../app/data/types';
import { NEVER_SEEN, TICKS_PER_DAY } from '../../app/data/types';
import { toJdn } from '../../app/data/dates';
import { loadDem } from './dem';
import { bakeDetail } from './detail';
import { BAKED, CACHE, ROOT, VOYAGES } from './paths';
import { fillGeometry } from './raster';
import { H, W, bakeVoyage, halve, loadVoyage, round, startDate, validate } from './voyage';

/** World mode counts in ticks of 8 days from 1 January 1000 (Julian). */
export const WORLD_EPOCH = '1000-01-01';
export const WORLD_TICK_DAYS = 8;

function writeSeen(dir: string, seen: Uint16Array) {
  writeFileSync(join(dir, 'firstseen-8192.png'), encode({ width: W, height: H, data: seen, channels: 1, depth: 16 }));
  writeFileSync(join(dir, 'firstseen-4096.png'), encode({ width: W / 2, height: H / 2, data: halve(seen, W, H), channels: 1, depth: 16 }));
}

async function main() {
  const t0 = Date.now();
  const log = (s: string) => process.stdout.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}\n`);
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  const landPath = join(CACHE, 'land-8192.bin');
  if (!existsSync(landPath)) throw new Error('run `pnpm tsx scripts/bake/world.ts` first');
  const land = new Uint8Array(readFileSync(landPath));
  const coastBuf = readFileSync(join(BAKED, 'world', 'coastlines.bin'));
  const coast = new Float32Array(coastBuf.buffer, coastBuf.byteOffset, coastBuf.byteLength / 4);
  const dem = await loadDem();
  log('terrain loaded');

  const files = readdirSync(VOYAGES).filter((f) => f.endsWith('.json')).sort();
  const voyages: Voyage[] = [];
  const problems: string[] = [];
  for (const f of files) {
    const v = loadVoyage(join(VOYAGES, f));
    problems.push(...validate(v, f));
    voyages.push(v);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  const index: ReturnType<typeof entry>[] = [];
  const baked = new Map<string, { route: BakedRoute; seen: Uint16Array }>();
  for (const v of voyages) {
    const dir = join(BAKED, v.id);
    const routePath = join(dir, 'route.json');
    if (only.length && !only.includes(v.id)) {
      if (existsSync(routePath)) {
        const route = JSON.parse(readFileSync(routePath, 'utf8')) as BakedRoute;
        index.push(entry(v, route));
      }
      continue;
    }
    const t = Date.now();
    const out = bakeVoyage(v, dem, land, coast);
    const detail = await bakeDetail(v.id);
    if (detail) out.route.detail = { west: detail.west, east: detail.east, south: detail.south, north: detail.north };
    mkdirSync(dir, { recursive: true });
    writeSeen(dir, out.seen);
    writeFileSync(routePath, JSON.stringify(out.route));
    // The app needs the voyage text too; ship it beside the bake so one fetch gets both.
    writeFileSync(join(dir, 'voyage.json'), JSON.stringify(v));
    baked.set(v.id, out);
    index.push(entry(v, out.route));
    const unique = [...new Map(out.warnings.map((w) => [w.replace(/, e\.g\. at .*$/, ''), w])).values()];
    log(`${v.id}: ${out.route.days} days, ${out.route.distanceKm} km, ${((Date.now() - t) / 1000).toFixed(1)}s${unique.length ? `\n  ${unique.slice(0, 60).join('\n  ')}${unique.length > 60 ? `\n  ...and ${unique.length - 60} more` : ''}` : ''}`);
  }
  index.sort((a, b) => a.years[0] - b.years[0]);
  writeFileSync(join(BAKED, 'index.json'), JSON.stringify(index, null, 1));

  if (!only.length || process.argv.includes('--world')) {
    await bakeWorld(voyages.filter((v) => v.status !== 'placeholder'), baked);
    log('world timeline');
  }
}

function entry(v: Voyage, route: BakedRoute) {
  return { id: v.id, title: v.title, explorer: v.explorer, years: v.years, summary: v.summary, sourceNote: v.sourceNote, status: v.status, home: v.home, days: route.days };
}

/**
 * World uncovering: every voyage on one clock. A pixel's value is the
 * earliest world tick at which any voyage saw it, or at which it entered a
 * voyage's known world (that voyage's departure). The base is the known
 * world of around 1000.
 */
async function bakeWorld(voyages: Voyage[], baked: Map<string, { route: BakedRoute; seen: Uint16Array }>) {
  const epoch = toJdn(WORLD_EPOCH, 'julian');
  const seen = new Uint16Array(W * H).fill(NEVER_SEEN);
  const base = JSON.parse(readFileSync(join(ROOT, 'data', 'world', 'known-1000.json'), 'utf8')) as GeoJSON;
  for (const f of base.features) fillGeometry(f.geometry, { width: W, height: H }, (x, y) => (seen[y * W + x] = 0));

  const timeline: { id: string; title: string; explorer: string; startDay: number; endDay: number; path: number[] }[] = [];
  for (const v of voyages) {
    const b = baked.get(v.id);
    if (!b) throw new Error(`world mode needs every voyage baked in the same run; ${v.id} was skipped`);
    const offset = toJdn(startDate(v), v.calendar) - epoch;
    const scale = 1 / (TICKS_PER_DAY * WORLD_TICK_DAYS);
    const s = b.seen;
    for (let i = 0; i < s.length; i++) {
      const t = s[i];
      if (t === NEVER_SEEN) continue;
      const wt = Math.max(1, Math.round(offset / WORLD_TICK_DAYS + t * scale));
      if (wt < seen[i]) seen[i] = wt;
    }
    const p = b.route.path;
    const path: number[] = [];
    for (let i = 0; i < p.length; i += 4) path.push(p[i], p[i + 1], round(offset + p[i + 2], 2), p[i + 3]);
    timeline.push({ id: v.id, title: v.title, explorer: v.explorer, startDay: offset, endDay: offset + b.route.days, path });
  }
  timeline.sort((a, b) => a.startDay - b.startDay);
  const dir = join(BAKED, 'world');
  writeSeen(dir, seen);
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify({ epoch: WORLD_EPOCH, tickDays: WORLD_TICK_DAYS, endDay: toJdn('1912-12-31', 'gregorian') - epoch, voyages: timeline }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

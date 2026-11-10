// Turns one voyage JSON into a first-seen texture and a route file
// (PRD "The first seen texture"). Every pixel holds the tick (day * 16) on
// which the expedition first saw it: 0 inside the known world, NEVER_SEEN if
// never.

import { readFileSync } from 'node:fs';
import type { BakedRoute, Leg, Mode, Voyage } from '../../app/data/types';
import { NEVER_SEEN, TICKS_PER_DAY } from '../../app/data/types';
import { dayNumber } from '../../app/data/dates';
import { distanceKm, interpolate } from '../../app/data/geo';
import type { Dem } from './dem';
import { fillGeometry } from './raster';
import { groundSight, seaSight, type Raster } from './sight';

export const W = 8192;
export const H = 4096;
const KM_PER_DEG = 111.195;
const RAD = Math.PI / 180;

/** Distance between sight samples along the route, km. */
const SIGHT_STEP: Record<Mode, number> = { sea: 4, river: 3, land: 3, ice: 3 };
/** Distance between drawn path samples, km. */
const PATH_STEP = 12;

export function validate(v: Voyage, file: string): string[] {
  const problems: string[] = [];
  const ids = new Set(v.sources.map((s) => s.id));
  const check = (cond: boolean, msg: string) => cond || problems.push(`${file}: ${msg}`);
  check(/^[a-z0-9-]+$/.test(v.id), `bad id ${v.id}`);
  check(['placeholder', 'draft', 'reviewed'].includes(v.status), 'status must be placeholder, draft or reviewed');
  check(v.legs.length > 0, 'no legs');
  for (const [li, leg] of v.legs.entries()) {
    check(leg.points.length >= 2, `leg ${li} has fewer than two points`);
    for (let i = 1; i < leg.points.length; i++) {
      const a = leg.points[i - 1];
      const b = leg.points[i];
      check(dayNumber(a.date, b.date, v.calendar) >= 0, `leg ${li}: ${b.date} comes before ${a.date}`);
    }
    for (const p of leg.points) {
      check(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 360, `leg ${li}: bad position ${p.lat},${p.lon}`);
      check(!p.sourceId || ids.has(p.sourceId), `leg ${li}: unknown source ${p.sourceId}`);
      check(p.confidence !== 'documented' || !!p.sourceId, `leg ${li} ${p.date}: documented point without a source`);
    }
  }
  for (const m of v.moments) {
    check(ids.has(m.sourceId), `moment "${m.title}": unknown source ${m.sourceId}`);
    if (m.isQuote) {
      const src = v.sources.find((s) => s.id === m.sourceId);
      check(!!src?.publicDomain, `moment "${m.title}": quotes must come from public-domain sources (rule 4)`);
      check(m.text.length <= 240, `moment "${m.title}": keep quotes short (rule 4)`);
    }
  }
  return problems;
}

export function loadVoyage(path: string): Voyage {
  return JSON.parse(readFileSync(path, 'utf8')) as Voyage;
}

export function startDate(v: Voyage): string {
  let best = v.legs[0].points[0].date;
  for (const leg of v.legs) if (dayNumber(best, leg.points[0].date, v.calendar) < 0) best = leg.points[0].date;
  return best;
}

export interface Sample {
  lon: number;
  lat: number;
  day: number;
  dashed: boolean;
  mode: Mode;
  leg: number;
  /** Index of the waypoint this sample's segment starts at. */
  seg: number;
}

/** Samples along a leg no more than stepKm apart, with days interpolated by distance between dated waypoints. */
export function sampleLeg(leg: Leg, legIndex: number, start: string, calendar: Voyage['calendar'], stepKm: number): Sample[] {
  const out: Sample[] = [];
  const pts = leg.points;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const da = dayNumber(start, a.date, calendar);
    const db = dayNumber(start, b.date, calendar);
    const dashed = !(a.confidence === 'documented' && b.confidence === 'documented');
    const km = distanceKm(a.lon, a.lat, b.lon, b.lat);
    const n = Math.max(1, Math.ceil(km / stepKm));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const [lon, lat] = interpolate(a.lon, a.lat, b.lon, b.lat, t);
      out.push({ lon, lat, day: da + (db - da) * t, dashed, mode: leg.mode, leg: legIndex, seg: i });
    }
  }
  const last = pts[pts.length - 1];
  out.push({ lon: last.lon, lat: last.lat, day: dayNumber(start, last.date, calendar), dashed: false, mode: leg.mode, leg: legIndex, seg: pts.length - 1 });
  return out;
}

function makeRaster(seen: Uint16Array, land: Uint8Array, tick: { value: number }): Raster {
  const rowLat = new Float64Array(H);
  const rowSin = new Float64Array(H);
  const rowCos = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    rowLat[y] = 90 - ((y + 0.5) / H) * 180;
    rowSin[y] = Math.sin(rowLat[y] * RAD);
    rowCos[y] = Math.cos(rowLat[y] * RAD);
  }
  const colLon = new Float64Array(W);
  for (let x = 0; x < W; x++) colLon[x] = ((x + 0.5) / W) * 360 - 180;
  const set = (i: number) => {
    if (tick.value < seen[i]) seen[i] = tick.value;
  };
  return {
    width: W,
    height: H,
    mark(lon, lat) {
      const x = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
      const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
      set(y * W + x);
    },
    each(lon, lat, radiusKm, fn) {
      const dLat = radiusKm / KM_PER_DEG;
      const y0 = Math.max(0, Math.floor(((90 - (lat + dLat)) / 180) * H));
      const y1 = Math.min(H - 1, Math.floor(((90 - (lat - dLat)) / 180) * H));
      const sinA = Math.sin(lat * RAD);
      const cosA = Math.cos(lat * RAD);
      const cosR = Math.cos(radiusKm / 6371);
      for (let y = y0; y <= y1; y++) {
        const c = rowCos[y];
        const span = c < 1e-3 ? 180 : radiusKm / (KM_PER_DEG * c);
        const n = span >= 180 ? W : Math.ceil((span / 360) * W) + 1;
        const cx = Math.floor(((lon + 180) / 360) * W);
        const xa = n >= W ? 0 : cx - n;
        const xb = n >= W ? W - 1 : cx + n;
        for (let xx = xa; xx <= xb; xx++) {
          const x = ((xx % W) + W) % W;
          const cosD = sinA * rowSin[y] + cosA * c * Math.cos((colLon[x] - lon) * RAD);
          if (cosD < cosR) continue;
          const i = y * W + x;
          const km = Math.acos(Math.min(1, cosD)) * 6371;
          if (fn(colLon[x], rowLat[y], km, i)) set(i);
        }
      }
    },
    isLand: (i) => land[i] >= 128,
  };
}

export interface Baked {
  route: BakedRoute;
  seen: Uint16Array;
  warnings: string[];
}

export function bakeVoyage(v: Voyage, dem: Dem, land: Uint8Array, coast: Float32Array): Baked {
  const warnings: string[] = [];
  const start = startDate(v);
  const seen = new Uint16Array(W * H).fill(NEVER_SEEN);
  const tick = { value: 0 };
  const raster = makeRaster(seen, land, tick);

  // The known world is visible from the start, less any regions marked unknown.
  const grid = { width: W, height: H };
  for (const f of v.knownWorld.features) if (!f.properties?.unknown) fillGeometry(f.geometry, grid, (x, y) => (seen[y * W + x] = 0));
  for (const f of v.knownWorld.features) if (f.properties?.unknown) fillGeometry(f.geometry, grid, (x, y) => (seen[y * W + x] = NEVER_SEEN));

  // Walk each leg in sight-sized steps, earliest days first so min() is cheap to reason about.
  let lastGround: [number, number] | null = null;
  const sightSamples = v.legs.flatMap((leg, li) => sampleLeg(leg, li, start, v.calendar, SIGHT_STEP[leg.mode]));
  sightSamples.sort((a, b) => a.day - b.day);
  for (const s of sightSamples) {
    tick.value = Math.max(1, Math.round(s.day * TICKS_PER_DAY));
    if (s.mode === 'sea') {
      seaSight(raster, dem, s.lon, s.lat);
      const x = Math.floor(((s.lon + 180) / 360) * W) % W;
      const y = Math.floor(((90 - s.lat) / 180) * H);
      if (land[y * W + x] >= 250) {
        const a = v.legs[s.leg].points[s.seg];
        const b = v.legs[s.leg].points[Math.min(s.seg + 1, v.legs[s.leg].points.length - 1)];
        warnings.push(`sea leg ${s.leg} crosses land between ${a.date} (${a.lat},${a.lon}) and ${b.date} (${b.lat},${b.lon}), e.g. at ${s.lat.toFixed(2)},${s.lon.toFixed(2)}`);
      }
    } else {
      if (lastGround && distanceKm(lastGround[0], lastGround[1], s.lon, s.lat) < 1) continue;
      groundSight(raster, dem, s.lon, s.lat, s.mode);
      lastGround = [s.lon, s.lat];
    }
  }

  const days = Math.max(...v.legs.map((l) => dayNumber(start, l.points[l.points.length - 1].date, v.calendar)));

  // Path to draw.
  const path: number[] = [];
  let distance = 0;
  const legInfo: BakedRoute['legs'] = [];
  for (const [li, leg] of v.legs.entries()) {
    const samples = sampleLeg(leg, li, start, v.calendar, PATH_STEP);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (i > 0) distance += distanceKm(samples[i - 1].lon, samples[i - 1].lat, s.lon, s.lat);
      const modeBits = ['sea', 'river', 'land', 'ice'].indexOf(s.mode);
      path.push(round(s.lon, 4), round(s.lat, 4), round(s.day, 3), (s.dashed ? 1 : 0) | (modeBits << 1) | (li << 3));
    }
    legInfo.push({
      mode: leg.mode,
      vessel: leg.vessel,
      party: leg.party,
      startDay: dayNumber(start, leg.points[0].date, v.calendar),
      endDay: dayNumber(start, leg.points[leg.points.length - 1].date, v.calendar),
    });
  }

  // Ghost map: each vertex fades when the voyage first sees anything within FADE_KM of it.
  const FADE_KM = 250;
  const ghost: BakedRoute['ghost'] = [];
  const ghostLabels: BakedRoute['ghostLabels'] = [];
  const fadeAt = (lon: number, lat: number) => {
    let best = NEVER_SEEN;
    raster.each(lon, lat, FADE_KM, (_a, _b, _km, i) => {
      const t = seen[i];
      if (t > 0 && t < best) best = t;
      return false;
    });
    return best === NEVER_SEEN ? -1 : round(best / TICKS_PER_DAY, 2);
  };
  for (const f of v.believedWorld?.features ?? []) {
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const named: number[][] = [];
    for (const line of lines) {
      const coords: number[] = [];
      for (let i = 0; i + 1 < line.length; i++) {
        const [lon1, lat1] = line[i];
        const [lon2, lat2] = line[i + 1];
        const n = Math.max(1, Math.ceil(distanceKm(lon1, lat1, lon2, lat2) / 40));
        for (let s = 0; s < n; s++) {
          const [lon, lat] = interpolate(lon1, lat1, lon2, lat2, s / n);
          coords.push(round(lon, 3), round(lat, 3), fadeAt(lon, lat));
        }
      }
      const [lon, lat] = line[line.length - 1];
      coords.push(lon, lat, fadeAt(lon, lat));
      ghost.push({ name: f.properties?.name ?? undefined, coords });
      named.push(coords);
    }
    const name = f.properties?.name;
    if (name && named.length) {
      const c = named[0];
      const n = c.length / 3;
      let x = 0;
      let y = 0;
      let z = 0;
      const fades: number[] = [];
      for (let i = 0; i < n; i++) {
        const lo = c[i * 3] * RAD;
        const la = c[i * 3 + 1] * RAD;
        x += Math.cos(la) * Math.cos(lo);
        y += Math.cos(la) * Math.sin(lo);
        z += Math.sin(la);
        fades.push(c[i * 3 + 2]);
      }
      const seenFades = fades.filter((d) => d >= 0).sort((a, b) => a - b);
      ghostLabels.push({
        name,
        lon: round(Math.atan2(y, x) / RAD, 3),
        lat: round(Math.atan2(z, Math.hypot(x, y)) / RAD, 3),
        fadeDay: seenFades.length > fades.length / 3 ? seenFades[Math.floor(seenFades.length / 3)] : -1,
      });
    }
  }

  // Pacing: how much new land and coast came into view each day.
  const landPerDay = new Array<number>(days + 1).fill(0);
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (let i = 0; i < seen.length; i++) {
    const t = seen[i];
    if (t === 0 || t === NEVER_SEEN) continue;
    const d = Math.min(days, Math.floor(t / TICKS_PER_DAY));
    if (land[i] >= 128) landPerDay[d] += Math.cos(((90 - ((Math.floor(i / W) + 0.5) / H) * 180) * RAD));
    const lon = ((i % W) + 0.5) / W * 360 - 180;
    const lat = 90 - (Math.floor(i / W) + 0.5) / H * 180;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const peak = Math.max(1e-9, ...landPerDay);
  const coastPerDay = new Array<number>(days + 1).fill(0);
  for (let k = 0; k < coast.length; ) {
    const n = coast[k];
    for (let j = 0; j < n; j++) {
      const lon = coast[k + 2 + j * 2];
      const lat = coast[k + 3 + j * 2];
      const x = Math.floor(((lon + 180) / 360) * W) % W;
      const y = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
      const t = seen[y * W + x];
      if (t > 0 && t !== NEVER_SEEN) coastPerDay[Math.min(days, Math.floor(t / TICKS_PER_DAY))] += 1;
    }
    k += 2 + n * 2;
  }

  const moments = v.moments
    .map((m) => ({ ...m, day: dayNumber(start, m.date, v.calendar) }))
    .sort((a, b) => a.day - b.day);
  for (const m of moments) if (m.day < 0 || m.day > days) warnings.push(`moment "${m.title}" (${m.date}) is outside the voyage`);

  return {
    seen,
    warnings,
    route: {
      id: v.id,
      ticksPerDay: TICKS_PER_DAY,
      days,
      start,
      calendar: v.calendar,
      distanceKm: Math.round(distance),
      path,
      legs: legInfo,
      moments,
      ghost,
      ghostLabels,
      landPerDay: landPerDay.map((x) => round(x / peak, 3)),
      coastPerDay,
      bounds: { west, east, south, north },
      sizes: [8192, 4096],
    },
  };
}

export function round(x: number, d: number) {
  const k = 10 ** d;
  return Math.round(x * k) / k;
}

/** Halves a first-seen texture, keeping the earliest tick of each 2x2 block. */
export function halve(seen: Uint16Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array((w / 2) * (h / 2));
  for (let y = 0; y < h / 2; y++)
    for (let x = 0; x < w / 2; x++) {
      const i = y * 2 * w + x * 2;
      out[y * (w / 2) + x] = Math.min(seen[i], seen[i + 1], seen[i + w], seen[i + w + 1]);
    }
  return out;
}


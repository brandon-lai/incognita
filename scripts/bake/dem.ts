// Elevation from cached Terrarium tiles: one coarse global mosaic plus finer
// regional ones for land and ice legs. Sampling picks the finest mosaic that
// covers the point. South of the tiles' 85.05° limit the polar plateau is
// treated as flat, which it nearly is.

import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { DEM_REGIONS, GLOBAL_DEM, latToTileY, lonToTileX, tilePath, tileRange, type DemRegion } from './paths';

const PLATEAU_M = 2800;
const MERC_LIMIT = 85.05;

interface Mosaic {
  region: DemRegion;
  x0: number;
  y0: number;
  width: number;
  height: number;
  data: Float32Array;
  /** Metres per pixel at the equator. */
  pixelM: number;
}

async function loadMosaic(region: DemRegion): Promise<Mosaic> {
  const { x0, x1, y0, y1 } = tileRange(region);
  const width = (x1 - x0 + 1) * 256;
  const height = (y1 - y0 + 1) * 256;
  const data = new Float32Array(width * height);
  const jobs: Promise<void>[] = [];
  for (let tx = x0; tx <= x1; tx++)
    for (let ty = y0; ty <= y1; ty++) {
      const path = tilePath(region.zoom, tx, ty);
      if (!existsSync(path)) throw new Error(`missing terrain tile ${path}: run pnpm fetch-data`);
      if (statSync(path).size === 0) continue; // no tile: open ocean, left at 0
      jobs.push(
        sharp(path)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
          .then(({ data: px, info }) => {
            const ox = (tx - x0) * 256;
            const oy = (ty - y0) * 256;
            for (let y = 0; y < info.height; y++)
              for (let x = 0; x < info.width; x++) {
                const i = (y * info.width + x) * 3;
                data[(oy + y) * width + ox + x] = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
              }
          }),
      );
    }
  await Promise.all(jobs);
  return { region, x0, y0, width, height, data, pixelM: 40075016 / (256 * 2 ** region.zoom) };
}

export interface Dem {
  /** Elevation in metres (negative under the sea). */
  at(lon: number, lat: number): number;
  /** Ground resolution in metres where the finest mosaic covers the point. */
  resolutionM(lon: number, lat: number): number;
  /** Highest elevation in the 1° cell containing the point and its neighbours. */
  maxNear(lon: number, lat: number): number;
}

function sample(m: Mosaic, lon: number, lat: number): number {
  const z = m.region.zoom;
  const px = (lonToTileX(lon, z) - m.x0) * 256 - 0.5;
  const py = (latToTileY(lat, z) - m.y0) * 256 - 0.5;
  const x = Math.max(0, Math.min(m.width - 1.001, px));
  const y = Math.max(0, Math.min(m.height - 1.001, py));
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const d = m.data;
  const i = iy * m.width + ix;
  const top = d[i] * (1 - fx) + d[i + 1] * fx;
  const bot = d[i + m.width] * (1 - fx) + d[i + m.width + 1] * fx;
  return top * (1 - fy) + bot * fy;
}

const inside = (r: DemRegion, lon: number, lat: number) => lon >= r.west && lon <= r.east && lat >= r.south && lat <= r.north;

export async function loadDem(): Promise<Dem> {
  const global = await loadMosaic(GLOBAL_DEM);
  const regional = await Promise.all(DEM_REGIONS.map(loadMosaic));
  regional.sort((a, b) => b.region.zoom - a.region.zoom);

  const pick = (lon: number, lat: number) => regional.find((m) => inside(m.region, lon, lat)) ?? global;

  // 1° cells, highest point in each.
  const cellMax = new Float32Array(360 * 180).fill(0);
  for (let y = 0; y < global.height; y++)
    for (let x = 0; x < global.width; x++) {
      const lon = ((global.x0 * 256 + x + 0.5) / (256 * 16)) * 360 - 180;
      const n = Math.PI - (2 * Math.PI * (global.y0 * 256 + y + 0.5)) / (256 * 16);
      const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
      const c = Math.min(179, Math.floor(90 - lat)) * 360 + Math.min(359, Math.floor(lon + 180));
      cellMax[c] = Math.max(cellMax[c], global.data[y * global.width + x]);
    }
  for (let r = 175; r < 180; r++) for (let c = 0; c < 360; c++) cellMax[r * 360 + c] = Math.max(cellMax[r * 360 + c], PLATEAU_M + 200);

  return {
    at(lon, lat) {
      if (lat < -MERC_LIMIT) return PLATEAU_M;
      return sample(pick(lon, lat), lon, lat);
    },
    resolutionM(lon, lat) {
      const m = pick(lon, lat);
      return m.pixelM * Math.cos((Math.max(-MERC_LIMIT, Math.min(MERC_LIMIT, lat)) * Math.PI) / 180);
    },
    maxNear(lon, lat) {
      const r = Math.min(179, Math.max(0, Math.floor(90 - lat)));
      const c = ((Math.floor(lon + 180) % 360) + 360) % 360;
      let best = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          if (rr < 0 || rr > 179) continue;
          best = Math.max(best, cellMax[rr * 360 + ((c + dc + 360) % 360)]);
        }
      return best;
    },
  };
}

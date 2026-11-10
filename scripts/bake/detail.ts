// Regional detail imagery. The 8K Blue Marble is about 5 km a pixel, which
// blurs at land-ho zoom; each voyage gets one sharper crop (about 600 m a
// pixel) of the region where it spends the most time close in. Same source:
// NASA Blue Marble shaded relief via GIBS, public domain.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { BAKED, CACHE } from './paths';

export interface DetailRegion {
  west: number;
  east: number;
  south: number;
  north: number;
  /** Degrees per pixel. */
  res: number;
}

export const DETAIL: Record<string, DetailRegion> = {
  'columbus-1492': { west: -86, east: -60, south: 17, north: 28.5, res: 0.006 },
  'lewis-clark-1804': { west: -125, east: -89, south: 37.5, north: 49.5, res: 0.0066 },
  'cook-1768': { west: 165, east: 180, south: -48, north: -34, res: 0.006 },
  'magellan-1519': { west: -76, east: -63, south: -56, north: -46, res: 0.005 },
};

const GIBS =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&LAYERS=BlueMarble_ShadedRelief_Bathymetry';
const TILE = 2048;

async function fetchTile(url: string, path: string) {
  if (existsSync(path)) return;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
      return;
    } catch (err) {
      if (i >= 4) throw new Error(`${url}: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

/** Writes detail-{full,4096}.jpg for a voyage and returns its bounds, or null if it has none. */
export async function bakeDetail(id: string): Promise<(DetailRegion & { width: number; height: number }) | null> {
  const r = DETAIL[id];
  if (!r) return null;
  const width = Math.round((r.east - r.west) / r.res);
  const height = Math.round((r.north - r.south) / r.res);
  const cache = join(CACHE, 'detail', id);
  mkdirSync(cache, { recursive: true });
  const parts: { input: string; left: number; top: number }[] = [];
  for (let top = 0; top < height; top += TILE) {
    for (let left = 0; left < width; left += TILE) {
      const w = Math.min(TILE, width - left);
      const h = Math.min(TILE, height - top);
      const west = r.west + left * r.res;
      const north = r.north - top * r.res;
      const path = join(cache, `${top}-${left}.jpg`);
      await fetchTile(`${GIBS}&WIDTH=${w}&HEIGHT=${h}&BBOX=${north - h * r.res},${west},${north},${west + w * r.res}`, path);
      parts.push({ input: path, left, top });
    }
  }
  const full = await sharp({ create: { width, height, channels: 3, background: '#000' } })
    .composite(parts)
    .removeAlpha()
    .raw()
    .toBuffer();
  const img = () => sharp(full, { raw: { width, height, channels: 3 } });
  const dir = join(BAKED, id);
  mkdirSync(dir, { recursive: true });
  await img().jpeg({ quality: 80, mozjpeg: true }).toFile(join(dir, 'detail-8192.jpg'));
  const small = Math.min(4096, width);
  await img()
    .resize(small, Math.round((height * small) / width))
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(join(dir, 'detail-4096.jpg'));
  return { ...r, width, height };
}

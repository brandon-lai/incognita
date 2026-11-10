// Downloads the public source data the bake reads into .cache/ (gitignored).
// Everything here is public domain or openly licensed; see the README's Attribution section.
//
//   pnpm fetch-data
//
// Safe to re-run: files already on disk are skipped.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE, tilesFor } from './paths';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
// NASA Blue Marble (shaded relief and bathymetry) from the GIBS map service,
// as eight 90° x 90° tiles of 2048 px that the bake stitches to 8192 x 4096.
// Public domain. (Visible Earth's direct downloads time out more often than not.)
const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&WIDTH=2048&HEIGHT=2048&LAYERS=BlueMarble_ShadedRelief_Bathymetry';
export const IMAGERY_TILES = [0, 1].flatMap((row) =>
  [0, 1, 2, 3].map((col) => {
    const south = 90 - (row + 1) * 90;
    const west = -180 + col * 90;
    return { row, col, name: `bluemarble/${row}-${col}.jpg`, url: `${GIBS}&BBOX=${south},${west},${south + 90},${west + 90}` };
  }),
);

const FILES: Record<string, string> = {
  ...Object.fromEntries(IMAGERY_TILES.map((t) => [t.name, t.url])),
  'ne_10m_land.geojson': `${NE}/ne_10m_land.geojson`,
  'ne_10m_minor_islands.geojson': `${NE}/ne_10m_minor_islands.geojson`,
  'ne_10m_lakes.geojson': `${NE}/ne_10m_lakes.geojson`,
  'ne_10m_rivers_lake_centerlines.geojson': `${NE}/ne_10m_rivers_lake_centerlines.geojson`,
  'ne_10m_coastline.geojson': `${NE}/ne_10m_coastline.geojson`,
  'ne_10m_antarctic_ice_shelves_polys.geojson': `${NE}/ne_10m_antarctic_ice_shelves_polys.geojson`,
};

async function get(url: string, path: string, attempts = 4): Promise<void> {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        writeFileSync(path, new Uint8Array(0)); // a missing tile is open ocean
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
      return;
    } catch (err) {
      if (i >= attempts) throw new Error(`${url}: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
        if (++done % 100 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
      }
    }),
  );
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  for (const [name, url] of Object.entries(FILES)) {
    process.stdout.write(`${name}\n`);
    await get(url, join(CACHE, name));
  }
  const tiles = tilesFor();
  process.stdout.write(`terrain tiles: ${tiles.length}\n`);
  await pool(tiles, 12, (t) => get(t.url, t.path));
  process.stdout.write('done\n');
}

if (process.argv[1]?.endsWith("fetch.ts")) main().catch((err) => {
  console.error(err);
  process.exit(1);
});

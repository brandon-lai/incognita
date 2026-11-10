import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const CACHE = join(ROOT, '.cache');
export const VOYAGES = join(ROOT, 'data', 'voyages');
export const BAKED = join(ROOT, 'public', 'baked');

/**
 * Terrain comes from the open Terrarium tiles (AWS Open Data, compiled by
 * Mapzen from SRTM, GMTED2010, ETOPO1 and others). They are Web Mercator
 * PNGs, so they stop at ±85.05°; south of that the bake assumes the flat
 * polar plateau.
 *
 * A coarse global grid gives the sea model the height of distant land. Land
 * and ice legs need real ridgelines, so they get finer regional grids.
 */
export interface DemRegion {
  id: string;
  zoom: number;
  west: number;
  east: number;
  south: number;
  north: number;
}

export const GLOBAL_DEM: DemRegion = { id: 'global', zoom: 4, west: -180, east: 180, south: -85.05, north: 85.05 };

export const DEM_REGIONS: DemRegion[] = [
  // The Missouri, the Divide, the Clearwater, Snake and Columbia.
  { id: 'missouri-columbia', zoom: 8, west: -125, east: -89, south: 37, north: 50 },
  // The Ross Ice Shelf and the Transantarctic Mountains up to the edge of the tiles.
  { id: 'ross', zoom: 7, west: -180, east: -150, south: -85.05, north: -77 },
];

export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}
export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export interface Tile {
  z: number;
  x: number;
  y: number;
  url: string;
  path: string;
}

export function tileRange(r: DemRegion) {
  const n = 2 ** r.zoom;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return {
    x0: clamp(Math.floor(lonToTileX(r.west, r.zoom))),
    x1: clamp(Math.ceil(lonToTileX(r.east, r.zoom)) - 1),
    y0: clamp(Math.floor(latToTileY(r.north, r.zoom))),
    y1: clamp(Math.ceil(latToTileY(r.south, r.zoom)) - 1),
  };
}

export function tilePath(z: number, x: number, y: number) {
  return join(CACHE, 'terrarium', String(z), String(x), `${y}.png`);
}

export function tilesFor(regions: DemRegion[] = [GLOBAL_DEM, ...DEM_REGIONS]): Tile[] {
  const out: Tile[] = [];
  const seen = new Set<string>();
  for (const r of regions) {
    const { x0, x1, y0, y1 } = tileRange(r);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${r.zoom}/${x}/${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ z: r.zoom, x, y, url: `${TERRARIUM}/${key}.png`, path: tilePath(r.zoom, x, y) });
      }
  }
  return out;
}

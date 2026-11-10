// How far they could see (PRD "How far they could see"). These are starting
// values to tune for feel, not historical claims: the about panel says the
// reveal is a model.

import type { Mode } from '../../app/data/types';
import { horizonKm } from '../../app/data/geo';
import type { Dem } from './dem';

export const SIGHT = {
  /** Lookout at the masthead, metres. 25 m sees about 18 km of open sea. */
  mastheadM: 25,
  /** Eye height walking, riding or in a canoe. */
  groundEyeM: 2,
  /** On the ice: standing on a sledge. Flat ground keeps the radius small and steady. */
  iceEyeM: 3,
  /** Land and river viewsheds stop here: high ground farther off still shows. The PRD's 60 km, tuned up. */
  maxRangeKm: 90,
  /** On the ice the plateau is flat and the radius stays small. */
  iceRangeKm: 60,
  /** A traveller looks out from the highest ground within this distance of the camp. */
  lookoutKm: 0.6,
  /** Always seen, whatever the terrain: the ground around you. */
  nearKm: 1.5,
  iceNearKm: 8,
  /** Standard atmospheric refraction coefficient. */
  refraction: 0.13,
};

const EARTH_KM = 6371;
const KM_PER_DEG = 111.195;

export interface Raster {
  width: number;
  height: number;
  /** Mark the pixel containing (lon, lat) as seen. */
  mark(lon: number, lat: number): void;
  /** Visit pixels whose centres lie within radius km (by great circle) of a point; fn returns true to mark. */
  each(lon: number, lat: number, radiusKm: number, fn: (lon: number, lat: number, km: number, i: number) => boolean): void;
  isLand(i: number): boolean;
}

/** Sea: everything within the masthead's horizon, plus land high enough to show above it. */
export function seaSight(r: Raster, dem: Dem, lon: number, lat: number) {
  const base = horizonKm(SIGHT.mastheadM);
  const peak = dem.maxNear(lon, lat);
  const reach = base + horizonKm(Math.max(0, peak));
  r.each(lon, lat, reach, (plon, plat, km, i) => {
    if (km <= base) return true;
    if (!r.isLand(i)) return false;
    return km <= base + horizonKm(Math.max(0, dem.at(plon, plat)));
  });
}

/**
 * Land, river and ice: a radial viewshed over the elevation model. A cell is
 * seen if nothing nearer along the same ray rises above the line to it,
 * allowing for the earth's curve and refraction.
 */
export function groundSight(r: Raster, dem: Dem, lon: number, lat: number, mode: Mode) {
  const eye = mode === 'ice' ? SIGHT.iceEyeM : SIGHT.groundEyeM;
  const near = mode === 'ice' ? SIGHT.iceNearKm : SIGHT.nearKm;
  const range = mode === 'ice' ? SIGHT.iceRangeKm : SIGHT.maxRangeKm;
  const stepKm = Math.max(0.35, dem.resolutionM(lon, lat) / 1000);
  const rays = Math.ceil((2 * Math.PI * range) / (stepKm * 1.5));
  const steps = Math.ceil(range / stepKm);
  const reff = EARTH_KM / (1 - SIGHT.refraction);
  const kLon = 1 / (KM_PER_DEG * Math.max(0.02, Math.cos((lat * Math.PI) / 180)));
  // Climbing a pass opens the valley beyond: stand on the local high point.
  let ground = dem.at(lon, lat);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 2 * Math.PI;
    ground = Math.max(ground, dem.at(lon + SIGHT.lookoutKm * Math.sin(a) * kLon, lat + (SIGHT.lookoutKm * Math.cos(a)) / KM_PER_DEG));
  }
  const eyeH = Math.max(0, ground) + eye;

  r.each(lon, lat, near, () => true);

  for (let k = 0; k < rays; k++) {
    const th = (k / rays) * 2 * Math.PI;
    const dx = Math.sin(th);
    const dy = Math.cos(th);
    let best = -Infinity;
    for (let s = 1; s <= steps; s++) {
      const d = s * stepKm;
      let plat = lat + (d * dy) / KM_PER_DEG;
      let plon = lon + d * dx * kLon;
      if (plat < -90) {
        plat = -180 - plat;
        plon += 180;
      }
      const h = Math.max(0, dem.at(plon, plat)) - (d * d * 1000) / (2 * reff);
      const slope = (h - eyeH) / d;
      if (slope >= best) {
        r.mark(plon, plat);
        best = slope;
      }
    }
  }
}

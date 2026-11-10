// The voyage file format (PRD "Voyage file format"), shared by the bake
// script and the app. Additions to the PRD's shape are marked.

export type Position = [number, number]; // [lon, lat]

export interface Polygon {
  type: 'Polygon';
  coordinates: Position[][];
}
export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}
export interface LineString {
  type: 'LineString';
  coordinates: Position[];
}
export interface MultiLineString {
  type: 'MultiLineString';
  coordinates: Position[][];
}
export type Geometry = Polygon | MultiPolygon | LineString | MultiLineString;

export interface Feature<G extends Geometry = Geometry> {
  type: 'Feature';
  /** Addition: in a knownWorld, `unknown: true` carves a still-unmapped region out of the shapes before it. */
  properties: { name?: string; note?: string; unknown?: boolean } | null;
  geometry: G;
}
export interface FeatureCollection<G extends Geometry = Geometry> {
  type: 'FeatureCollection';
  /** Addition: what the shapes were drawn from, shown in the voyage's notes. */
  note?: string;
  features: Feature<G>[];
}
export type GeoJSON = FeatureCollection;

export type Calendar = 'julian' | 'gregorian';
export type Mode = 'sea' | 'river' | 'land' | 'ice';
export type Confidence = 'documented' | 'reconstructed' | 'interpolated';
export type MomentKind = 'landfall' | 'journal' | 'hardship' | 'encounter' | 'turning-point';

/**
 * Addition: where the data stands. "placeholder" is test data (rule 1),
 * "draft" is compiled from the cited sources but not yet checked by a
 * person, "reviewed" has been checked. Only reviewed voyages count as
 * launch content; the app labels the others.
 */
export type DataStatus = 'placeholder' | 'draft' | 'reviewed';

export interface Voyage {
  id: string;
  title: string;
  explorer: string;
  years: [number, number];
  calendar: Calendar;
  summary: string;
  knownWorld: GeoJSON;
  believedWorld?: GeoJSON;
  legs: Leg[];
  moments: Moment[];
  sources: Source[];
  /** Addition. */
  status: DataStatus;
  /** Addition: rule 5, "say what the source is", shown on the voyage card. */
  sourceNote: string;
  /** Addition: where they set out from, for the landing globe. */
  home: { name: string; lat: number; lon: number };
}

export interface Leg {
  mode: Mode;
  vessel?: string;
  /** Addition: who travelled this leg, when legs run in parallel (Lewis and Clark split in 1806). */
  party?: string;
  points: Waypoint[];
}

export interface Waypoint {
  date: string;
  lat: number;
  lon: number;
  confidence: Confidence;
  sourceId?: string;
  /** Addition: a place name, for the reviewer. Not shown. */
  place?: string;
}

export interface Moment {
  date: string;
  lat: number;
  lon: number;
  kind: MomentKind;
  title: string;
  text: string;
  isQuote: boolean;
  sourceId: string;
  slowMotion?: boolean;
  /** Addition: rule 3, "show disagreement". Other candidate places, drawn as open rings. */
  candidates?: { name: string; lat: number; lon: number; sourceId?: string }[];
}

export interface Source {
  id: string;
  title: string;
  author: string;
  url?: string;
  publicDomain: boolean;
}

/** What the bake writes to /public/baked/<id>/route.json. */
export interface BakedRoute {
  id: string;
  /** First-seen values are day * TICKS_PER_DAY; NEVER_SEEN means always fogged. */
  ticksPerDay: number;
  days: number;
  /** ISO date of day 0, in the voyage's calendar. */
  start: string;
  calendar: Calendar;
  distanceKm: number;
  /** Path samples: lon, lat, day, flags (bit 0: dashed, bits 1-2: mode, bits 3-5: leg). */
  path: number[];
  legs: { mode: Mode; vessel?: string; party?: string; startDay: number; endDay: number }[];
  moments: (Moment & { day: number })[];
  /** Ghost map lines: per vertex lon, lat, fadeDay (day the real land near it was first seen; -1: never). */
  ghost: { name?: string; coords: number[] }[];
  ghostLabels: { name: string; lon: number; lat: number; fadeDay: number }[];
  /** Per day, how much land came into view (0..1), for pacing and the pen sound. */
  landPerDay: number[];
  /** Per day, newly revealed coast length in km, for the pen sound. */
  coastPerDay: number[];
  /** Lat/lon box of everything first seen during the voyage (not the known world), for the ending camera. */
  bounds: { west: number; east: number; south: number; north: number };
  sizes: number[];
  /** Bounds of the sharper regional imagery (detail-{8192,4096}.jpg), when the voyage has one. */
  detail?: { west: number; east: number; south: number; north: number };
}

export const TICKS_PER_DAY = 16;
export const NEVER_SEEN = 65535;

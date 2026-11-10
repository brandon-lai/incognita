// Loads what a voyage needs: its text, its baked route, its first-seen
// texture and coastline ribbon. Shared world assets load once.

import type { BakedRoute, Voyage } from './types';
import type { Ribbon } from './ribbon';
import type { DecodeRequest } from './decode.worker';

export interface VoyageCard {
  id: string;
  title: string;
  explorer: string;
  years: [number, number];
  summary: string;
  status: 'placeholder' | 'draft' | 'reviewed';
  home: { name: string; lat: number; lon: number };
  days: number;
}

export interface Seen {
  width: number;
  height: number;
  data: Uint16Array;
}

export interface LoadedVoyage {
  voyage: Voyage | null;
  route: BakedRoute;
  seen: Seen;
  coast: Ribbon;
}

export interface WorldTimeline {
  epoch: string;
  tickDays: number;
  endDay: number;
  voyages: { id: string; title: string; explorer: string; startDay: number; endDay: number; path: number[] }[];
}

/** 8192 textures on capable desktops, 4096 elsewhere. `?q=low|high` overrides. */
export function textureSize(maxTexture: number): 8192 | 4096 {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low') return 4096;
  if (q === 'high' && maxTexture >= 8192) return 8192;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return !coarse && mem >= 4 && maxTexture >= 8192 && Math.min(screen.width, screen.height) >= 700 ? 8192 : 4096;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

type Request = DecodeRequest extends infer R ? (R extends DecodeRequest ? Omit<R, 'id'> : never) : never;

function decodeInWorker<T>(req: Request): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ ...req, id });
  });
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadIndex = () => json<VoyageCard[]>('/baked/index.json');

export function loadCoastTexture(size: number) {
  return decodeInWorker<{ width: number; height: number; data: Uint8Array }>({ kind: 'coast', url: `/baked/world/coast-${size}.png` });
}

async function loadSeen(dir: string, size: number, ticksPerDay: number) {
  return decodeInWorker<Seen & { ribbon: Ribbon }>({
    kind: 'seen',
    url: `/baked/${dir}/firstseen-${size}.png`,
    coastUrl: '/baked/world/coastlines.bin',
    ticksPerDay,
  });
}

export async function loadVoyage(id: string, size: number): Promise<LoadedVoyage> {
  const [voyage, route] = await Promise.all([json<Voyage>(`/baked/${id}/voyage.json`), json<BakedRoute>(`/baked/${id}/route.json`)]);
  const s = await loadSeen(id, size, route.ticksPerDay);
  return { voyage, route, seen: { width: s.width, height: s.height, data: s.data }, coast: s.ribbon };
}

export async function loadWorld(size: number) {
  const timeline = await json<WorldTimeline>('/baked/world/timeline.json');
  const s = await loadSeen('world', size, 1 / timeline.tickDays);
  return { timeline, seen: { width: s.width, height: s.height, data: s.data } as Seen, coast: s.ribbon };
}

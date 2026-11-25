export interface StartingPoint {
  day: number;
  paused: boolean;
}

export function startingPoint(params: URLSearchParams): StartingPoint | undefined {
  const raw = params.get('day');
  if (!raw?.trim() && !params.has('paused')) return;
  const day = Number(raw);
  if (!Number.isFinite(day)) return;
  return { day: Math.max(0, day), paused: params.has('paused') };
}

export function voyageURL(href: string, voyage: string | null, at?: StartingPoint): URL {
  const url = new URL(href);
  for (const key of ['voyage', 'day', 'paused']) url.searchParams.delete(key);
  if (voyage) {
    url.searchParams.set('voyage', voyage);
    if (at) {
      url.searchParams.set('day', String(at.day));
      if (at.paused) url.searchParams.set('paused', '1');
    }
  }
  return url;
}

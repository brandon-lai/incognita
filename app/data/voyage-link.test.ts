import { describe, expect, it } from 'vitest';
import { startingPoint, voyageURL } from './voyage-link';

describe('voyage links', () => {
  const old = 'https://example.org/?q=low&voyage=cook-1768&day=12&paused';

  it('preserves historical paused links and makes one for world mode too', () => {
    const at = startingPoint(new URL(old).searchParams);
    expect(at).toEqual({ day: 12, paused: true });
    const world = voyageURL(old, 'world', at);
    expect(world.searchParams.get('voyage')).toBe('world');
    expect(startingPoint(world.searchParams)).toEqual(at);
  });

  it('does not carry position or paused state into the next expedition or the shelf', () => {
    for (const id of [null, 'amundsen-1911']) {
      const next = voyageURL(old, id);
      expect(next.searchParams.get('q')).toBe('low');
      expect(next.searchParams.get('voyage')).toBe(id);
      expect(startingPoint(next.searchParams)).toBeUndefined();
    }
  });

  it('rejects invalid days, and opens a paused-only link at departure', () => {
    expect(startingPoint(new URLSearchParams('day=Infinity'))).toBeUndefined();
    expect(startingPoint(new URLSearchParams('day=-12'))?.day).toBe(0);
    expect(startingPoint(new URLSearchParams('paused'))).toEqual({ day: 0, paused: true });
  });
});

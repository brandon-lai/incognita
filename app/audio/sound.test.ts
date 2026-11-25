import { afterEach, expect, it, vi } from 'vitest';
import { Sound } from './sound';

afterEach(() => vi.unstubAllGlobals());

it('honors the shipped mute preference and clears only this map’s setting', () => {
  const saved = new Map([['terra-incognita:muted', '1'], ['another-setting', 'keep']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  const sound = new Sound();
  expect(sound.muted).toBe(true);
  sound.forgetPreference();
  expect(sound.muted).toBe(false);
  expect([...saved]).toEqual([['another-setting', 'keep']]);
  sound.setMuted(true);
  expect(new Sound().muted).toBe(true);
});

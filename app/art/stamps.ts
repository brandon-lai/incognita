import sheet from './pocket.svg?no-inline';
import type { Mode } from '../data/types';

type Art = Mode | 'world' | 'cloud' | 'island' | 'pine' | 'peak';
export const sprite = (art: Art) => `${sheet}#${art}`;

type Stamp = { vessel: Mode | 'world'; landmark: 'island' | 'peak' | 'pine' | 'cloud'; color: string };
const ocean: Stamp = { vessel: 'sea', landmark: 'island', color: 'lagoon' };
const stamps: Record<string, Stamp> = {
  'columbus-1492': ocean,
  'magellan-1519': { vessel: 'sea', landmark: 'peak', color: 'dusk' },
  'cook-1768': { vessel: 'sea', landmark: 'island', color: 'apricot' },
  'lewis-clark-1804': { vessel: 'river', landmark: 'pine', color: 'grove' },
  'amundsen-1911': { vessel: 'ice', landmark: 'peak', color: 'frost' },
  world: { vessel: 'world', landmark: 'cloud', color: 'night' },
};
export const stampFor = (id: string): Stamp => stamps[id] ?? ocean;

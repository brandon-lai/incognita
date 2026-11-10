import { describe, expect, it } from 'vitest';
import { BASE_RATE, Clock, HOLD_SECONDS, computePace, type ClockEvent } from './clock';

const flat = (n: number) => new Float32Array(n).fill(1);

function run(c: Clock, seconds: number, dt = 1 / 60): ClockEvent[] {
  const events: ClockEvent[] = [];
  for (let t = 0; t < seconds; t += dt) events.push(...c.tick(dt));
  return events;
}

describe('pace', () => {
  it('runs empty stretches fast and slows near land and moments', () => {
    const interest = new Array(60).fill(0);
    interest[30] = 1;
    const pace = computePace(interest, [{ day: 50 }], 4);
    expect(pace[5]).toBeCloseTo(4, 1);
    expect(pace[30]).toBeCloseTo(1, 1);
    expect(pace[50]).toBeCloseTo(1, 1);
    // Slows before land appears, not after.
    expect(pace[27]).toBeLessThan(pace[34]);
  });
});

describe('clock', () => {
  it('plays at one day per half second at 1x', () => {
    const c = new Clock(100, [], flat(101));
    c.playing = true;
    run(c, 2);
    expect(c.day).toBeCloseTo(2 * BASE_RATE, 1);
  });

  it('respects the speed control', () => {
    const c = new Clock(100, [], flat(101));
    c.playing = true;
    c.speed = 8;
    run(c, 1);
    expect(c.day).toBeCloseTo(16, 0);
  });

  it('fires moments as it passes them', () => {
    const c = new Clock(100, [{ day: 1 }, { day: 3 }], flat(101));
    c.playing = true;
    const events = run(c, 2.5);
    expect(events.filter((e) => e.type === 'moment').map((e) => (e as { index: number }).index)).toEqual([0, 1]);
  });

  it('eases into a land ho, holds near zero, then carries on by itself', () => {
    const c = new Clock(100, [{ day: 10, slowMotion: true }], flat(101));
    c.playing = true;
    const events = run(c, 8);
    expect(events.some((e) => e.type === 'landho')).toBe(true);
    expect(c.holding).toBe(true);
    expect(c.day).toBeGreaterThanOrEqual(10);
    expect(c.day).toBeLessThan(10.2);
    const later = run(c, HOLD_SECONDS + 3);
    expect(later.some((e) => e.type === 'resume')).toBe(true);
    expect(c.holding).toBe(false);
    expect(c.day).toBeGreaterThan(11);
  });

  it('resumes from a land ho on a tap', () => {
    const c = new Clock(100, [{ day: 2, slowMotion: true }], flat(101));
    c.playing = true;
    run(c, 4);
    expect(c.holding).toBe(true);
    c.resume();
    run(c, 3);
    expect(c.day).toBeGreaterThan(3);
  });

  it('stops at the end and reports it', () => {
    const c = new Clock(5, [{ day: 5, slowMotion: true }], flat(6));
    c.playing = true;
    const events = run(c, 20);
    expect(events.some((e) => e.type === 'end')).toBe(true);
    expect(c.day).toBe(5);
    expect(c.playing).toBe(false);
    expect(c.holding).toBe(false);
  });

  it('seeks without firing the moments it jumps over, and shows the past as old', () => {
    const c = new Clock(100, [{ day: 5 }, { day: 50, slowMotion: true }, { day: 80 }], flat(101));
    c.seek(60);
    c.playing = true;
    const events = run(c, 0.5);
    expect(events).toEqual([]);
    const hist = c.history([]);
    expect(hist[8]).toBeCloseTo(60, 0);
  });

  it('keeps a history of recent days for the ink-then-colour fade', () => {
    const c = new Clock(100, [], flat(101));
    c.playing = true;
    run(c, 5);
    const hist = c.history([]);
    expect(hist[0]).toBeCloseTo(10, 0);
    expect(hist[2]).toBeCloseTo(8, 0);
    expect(hist[8]).toBeCloseTo(2, 0);
  });

  it('freezes time, ink included, while paused', () => {
    const c = new Clock(100, [], flat(101));
    c.playing = true;
    run(c, 1);
    c.playing = false;
    const before = c.history([]);
    run(c, 3);
    expect(c.history([])).toEqual(before);
  });
});

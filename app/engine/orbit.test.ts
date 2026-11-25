import { describe, expect, it } from 'vitest';
import { Orbit } from './orbit';

describe('map camera motion', () => {
  it('eases wheel input to the same distance at different refresh rates without overshooting', () => {
    const sample = (hz: number) => {
      const camera = new Orbit();
      camera.zoom(0.5);
      expect(camera.distance).toBe(3);
      for (let i = 0; i < hz / 4; i++) camera.update(1 / hz);
      expect(camera.distance).toBeGreaterThan(camera.targetDistance);
      expect(camera.distance).toBeLessThan(2.1);
      return camera.distance;
    };
    expect(sample(60)).toBeCloseTo(sample(120), 8);
  });

  it('can pan to the opposite hemisphere and finish immediately when reduced motion is requested', () => {
    const camera = new Orbit();
    camera.target = [-1, 0, 0];
    for (let i = 0; i < 60; i++) camera.update(1 / 60);
    expect(camera.center[0]).toBeLessThan(0);
    camera.zoom(0.6);
    camera.update(1 / 60, true);
    expect(camera.center).toEqual(camera.target);
    expect(camera.distance).toBeCloseTo(camera.targetDistance);
  });
});

import { expect, it } from 'vitest';
import { PixelBudget } from './pixel-budget';

it('ignores a background-tab gap, lowers globe resolution under sustained load, then recovers gradually', () => {
  const budget = new PixelBudget();
  let ratio = 1.5;
  const run = (dt: number, count: number) => {
    for (let i = 0; i < count; i++) ratio = budget.sample(dt, ratio, 1.5);
  };
  run(4, 1);
  expect(ratio).toBe(1.5);
  run(1 / 30, 40);
  expect(ratio).toBeCloseTo(1.3);
  run(1 / 30, 600);
  expect(ratio).toBe(0.8);
  run(1 / 60, 120);
  expect(ratio).toBe(0.8);
  run(1 / 60, 650);
  expect(ratio).toBeCloseTo(0.9);
});

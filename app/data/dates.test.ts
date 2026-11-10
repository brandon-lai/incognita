import { describe, expect, it } from 'vitest';
import { dayNumber, formatDate, fromJdn, julianLag, solarDeclination, toJdn } from './dates';

describe('calendars', () => {
  it('converts known Julian Day Numbers', () => {
    expect(toJdn('2000-01-01', 'gregorian')).toBe(2451545);
    // 4 October 1582 (Julian) was followed by 15 October 1582 (Gregorian).
    expect(toJdn('1582-10-15', 'gregorian') - toJdn('1582-10-04', 'julian')).toBe(1);
  });

  it('round-trips dates in both calendars', () => {
    for (const cal of ['julian', 'gregorian'] as const) {
      for (const d of ['1492-08-03', '1520-02-29', '1804-05-14', '1911-12-14']) {
        const [y, m, day] = fromJdn(toJdn(d, cal), cal);
        expect(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toBe(d);
      }
    }
  });

  it('counts the days of Columbus’s first voyage as he recorded them', () => {
    expect(dayNumber('1492-08-03', '1493-03-15', 'julian')).toBe(224);
    expect(dayNumber('1492-08-03', '1492-10-12', 'julian')).toBe(70);
  });

  it('knows how far the Julian calendar lags', () => {
    expect(julianLag(toJdn('1492-10-12', 'julian'))).toBe(9);
    expect(julianLag(toJdn('1520-01-01', 'julian'))).toBe(10);
    expect(julianLag(toJdn('1768-08-26', 'julian'))).toBe(11);
  });

  it('formats a day of a voyage', () => {
    expect(formatDate('1492-08-03', 70, 'julian')).toBe('12 October 1492');
    expect(formatDate('1911-01-02', 346.5, 'gregorian')).toBe('14 December 1911');
  });

  it('puts the sun over the tropics at the solstices', () => {
    expect(solarDeclination(toJdn('2000-06-21', 'gregorian'))).toBeCloseTo(23.44, 0);
    expect(solarDeclination(toJdn('1911-12-22', 'gregorian'))).toBeCloseTo(-23.44, 0);
    expect(Math.abs(solarDeclination(toJdn('2000-03-20', 'gregorian')))).toBeLessThan(1);
  });
});

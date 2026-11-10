// Dates as recorded (PRD accuracy rule 6). Voyage dates are stored in the
// calendar the source used, so arithmetic goes through Julian Day Numbers in
// that calendar, and astronomy (the sun) uses the JDN, which is the same
// instant whichever calendar wrote it down.

import type { Calendar } from './types';

export function parseIso(date: string): [number, number, number] {
  const m = /^(-?\d{1,4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`not an ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function toJdn(date: string, calendar: Calendar): number {
  const [y, m, d] = parseIso(date);
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const base = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4);
  return calendar === 'gregorian'
    ? base - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
    : base - 32083;
}

export function fromJdn(jdn: number, calendar: Calendar): [number, number, number] {
  let c: number;
  let b: number;
  if (calendar === 'gregorian') {
    const a = jdn + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((146097 * b) / 4);
  } else {
    b = 0;
    c = jdn + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return [year, month, day];
}

/** Days from `start` to `date`, both in the voyage's calendar. */
export function dayNumber(start: string, date: string, calendar: Calendar): number {
  return toJdn(date, calendar) - toJdn(start, calendar);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDate(start: string, day: number, calendar: Calendar): string {
  const [y, m, d] = fromJdn(toJdn(start, calendar) + Math.floor(day), calendar);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function yearOf(start: string, day: number, calendar: Calendar): number {
  return fromJdn(toJdn(start, calendar) + Math.floor(day), calendar)[0];
}

/** Days the Julian calendar runs behind the Gregorian at a given JDN (10 in 1582, 11 from 1700, ...). */
export function julianLag(jdn: number): number {
  const [y, m] = fromJdn(jdn, 'julian');
  const c = m <= 2 ? Math.floor((y - 1) / 100) : Math.floor(y / 100);
  return c - Math.floor(c / 4) - 2;
}

/**
 * The sun's declination in degrees on a JDN. Low-precision formula
 * (Astronomical Almanac), good to about a degree, which is plenty for a
 * terminator.
 */
export function solarDeclination(jdn: number): number {
  const n = jdn - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180);
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180);
  const eps = (23.439 - 0.0000004 * n) * (Math.PI / 180);
  return (Math.asin(Math.sin(eps) * Math.sin(lambda)) * 180) / Math.PI;
}

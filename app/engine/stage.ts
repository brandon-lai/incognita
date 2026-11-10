// The stage: everything that changes per frame lives here, outside React.
// One clock drives the globe uniforms, the camera, the overlay and the
// sound; React reads a small snapshot at about 10 Hz and on events.

import type { Vec3 } from '../data/geo';
import { toLonLat, toVec } from '../data/geo';
import { formatDate, solarDeclination, toJdn, yearOf } from '../data/dates';
import type { LoadedVoyage, Seen, VoyageCard, WorldTimeline } from '../data/loader';
import type { Ribbon } from '../data/ribbon';
import type { BakedRoute, Calendar, Mode, Moment, Voyage } from '../data/types';
import { BASE_RATE, Clock, computePace, smoothstep, type ClockEvent } from './clock';
import { Orbit } from './orbit';
import { RouteIndex, spread, unpackPath, type PathPoint } from './route';

export type Screen = 'landing' | 'loading' | 'intro' | 'voyage' | 'ending' | 'world';

export interface JournalEntry {
  key: string;
  day: number;
  date: string;
  moment: Moment & { day: number };
  source?: Voyage['sources'][number];
}

export interface Snapshot {
  screen: Screen;
  voyageId: string | null;
  title: string;
  date: string;
  dayCount: number;
  days: number;
  day: number;
  year: number;
  calendar: Calendar;
  playing: boolean;
  speed: number;
  holding: boolean;
  follow: boolean;
  journal: JournalEntry[];
  landho: JournalEntry | null;
  endingCard: boolean;
  error: string | null;
  introNote: string | null;
  mode: Mode | null;
}

const FOLLOW_DISTANCE: Record<Mode, number> = { sea: 1.5, river: 1.32, land: 1.32, ice: 1.4 };

export interface Scene {
  kind: 'voyage' | 'world';
  id: string;
  route: Pick<BakedRoute, 'legs' | 'days' | 'start' | 'calendar' | 'ticksPerDay'> & Partial<BakedRoute>;
  voyage: Voyage | null;
  seen: Seen;
  coast: Ribbon;
  points: PathPoint[];
  index: RouteIndex;
  moments: (Moment & { day: number })[];
  home: Vec3;
  /** World mode: per-voyage day ranges for the year counter and notes. */
  timeline?: WorldTimeline;
}

type Listener = () => void;

export class Stage {
  screen: Screen = 'landing';
  orbit = new Orbit(40);
  clock: Clock | null = null;
  scene: Scene | null = null;
  /** Bumped when the scene changes, so meshes rebuild. */
  version = 0;
  time = 0;
  aspect = 1;

  // Globe uniforms.
  hist: number[] = new Array(9).fill(0);
  knownAge = 99;
  homeDir: Vec3 = toVec(-6.9, 37.2);
  homeAmount = 0;
  satellite = 0;
  lineFade = 1;
  ghostDraw = 0;
  sunDir: Vec3 = [1, 0.3, 0];

  private snap: Snapshot = this.emptySnapshot();
  private listeners = new Set<Listener>();
  private sinceEmit = 0;
  private scriptT = 0;
  private landhoEntry: JournalEntry | null = null;
  private journal: JournalEntry[] = [];

  /** Hooks for the sound engine and the overlay; set by their owners. */
  onEvent: (e: ClockEvent | { type: 'depart' } | { type: 'ending' }, stage: Stage) => void = () => {};

  private emptySnapshot(): Snapshot {
    return {
      screen: 'landing',
      voyageId: null,
      title: '',
      date: '',
      dayCount: 0,
      days: 0,
      day: 0,
      year: 1492,
      calendar: 'julian',
      playing: false,
      speed: 1,
      holding: false,
      follow: true,
      journal: [],
      landho: null,
      endingCard: false,
      error: null,
      introNote: null,
      mode: null,
    };
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private emit(patch: Partial<Snapshot> = {}) {
    const s = this.scene;
    const c = this.clock;
    const day = c?.day ?? 0;
    const base: Partial<Snapshot> = { screen: this.screen, follow: this.orbit.follow };
    if (s && c) {
      const lead = s.index.lead(day);
      base.voyageId = s.id;
      base.day = day;
      base.days = c.days;
      base.dayCount = Math.floor(day) + 1;
      base.date = formatDate(s.route.start, day, s.route.calendar);
      base.year = yearOf(s.route.start, day, s.route.calendar);
      base.calendar = s.route.calendar;
      base.playing = c.playing;
      base.speed = c.speed;
      base.holding = c.phase.kind === 'hold';
      base.journal = this.journal;
      base.landho = this.landhoEntry;
      base.mode = lead?.mode ?? null;
    }
    this.snap = { ...this.snap, ...base, ...patch };
    for (const fn of this.listeners) fn();
  }

  // --- Landing --------------------------------------------------------------

  showLanding(card: VoyageCard | null) {
    this.screen = 'landing';
    this.scene = null;
    this.clock = null;
    this.version++;
    this.journal = [];
    this.landhoEntry = null;
    this.satellite = 0;
    this.lineFade = 1;
    this.ghostDraw = 0;
    this.orbit.follow = false;
    this.orbit.lag = 1.6;
    this.orbit.userZoom = 1;
    this.orbit.spin = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.035;
    if (card) this.focusHome(card);
    this.emit({ endingCard: false, introNote: null, title: '', voyageId: null, error: null });
  }

  /** The landing globe shows only a small patch of the voyager's home. */
  focusHome(card: VoyageCard) {
    this.homeDir = toVec(card.home.lon, card.home.lat);
    this.homeAmount = 0;
    const [lon, lat] = [card.home.lon, card.home.lat];
    // Sit the home a little off-centre, with the sun behind the viewer's left shoulder.
    this.orbit.target = toVec(lon - 18, Math.max(-60, Math.min(60, lat - 8)));
    this.emit({ year: card.years[0] });
  }

  // --- Voyages ---------------------------------------------------------------

  setLoading(title: string) {
    this.screen = 'loading';
    this.emit({ title, error: null });
  }

  setError(message: string) {
    this.emit({ error: message });
  }

  startVoyage(v: LoadedVoyage) {
    const route = v.route;
    const points = unpackPath(route.path);
    const index = new RouteIndex(route, points);
    const voyage = v.voyage;
    const home = voyage ? toVec(voyage.home.lon, voyage.home.lat) : toVec(points[0].lon, points[0].lat);
    this.scene = { kind: 'voyage', id: route.id, route, voyage, seen: v.seen, coast: v.coast, points, index, moments: route.moments, home };
    const interest = route.landPerDay.map((x, d) => Math.max(x, Math.min(1, (route.coastPerDay[d] ?? 0) / 40)));
    const maxPace = Math.max(2.5, Math.min(10, route.days / 60));
    this.clock = new Clock(route.days, route.moments, computePace(interest, route.moments, maxPace));
    this.begin(voyage?.title ?? route.id);
  }

  startWorld(w: { timeline: WorldTimeline; seen: Seen; coast: Ribbon }) {
    const t = w.timeline;
    const legs = t.voyages.map((v) => ({ mode: 'sea' as Mode, startDay: v.startDay, endDay: v.endDay, vessel: v.title }));
    const points: PathPoint[] = [];
    t.voyages.forEach((v, i) => {
      for (const p of unpackPath(v.path)) points.push({ ...p, leg: i });
    });
    const route = { legs, days: t.endDay, start: t.epoch, calendar: 'julian' as Calendar, ticksPerDay: 1 / t.tickDays };
    const index = new RouteIndex(route, points);
    const moments = t.voyages.map((v) => ({
      date: '',
      day: v.startDay,
      lat: 0,
      lon: 0,
      kind: 'turning-point' as const,
      title: v.title,
      text: v.explorer,
      isQuote: false,
      sourceId: '',
    }));
    this.scene = { kind: 'world', id: 'world', route, voyage: null, seen: w.seen, coast: w.coast, points, index, moments, home: toVec(10, 45), timeline: t };
    // Years fly between voyages and slow to a crawl during them.
    const step = 8;
    const n = Math.ceil(t.endDay / step) + 1;
    const pace = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = i * step;
      let gap = Infinity;
      for (const v of t.voyages) gap = Math.min(gap, d < v.startDay ? v.startDay - d : d > v.endDay ? d - v.endDay : 0);
      pace[i] = 1 + 599 * smoothstep(0, 1500, gap);
    }
    this.clock = new Clock(t.endDay, moments, pace, 30, step);
    this.begin('The world uncovering');
  }

  private begin(title: string) {
    this.version++;
    this.journal = [];
    this.landhoEntry = null;
    this.satellite = 0;
    this.lineFade = 1;
    this.knownAge = -0.6;
    this.ghostDraw = 0;
    this.scriptT = 0;
    this.screen = 'intro';
    const s = this.scene!;
    this.homeDir = s.home;
    this.homeAmount = 1;
    this.orbit.follow = false;
    this.orbit.spin = 0;
    this.orbit.userZoom = 1;
    this.orbit.lag = 1.4;
    this.orbit.target = s.home;
    this.orbit.targetDistance = 2.2;
    this.emit({ title, endingCard: false, introNote: null, error: null });
  }

  hasGhost() {
    return !!this.scene?.voyage?.believedWorld?.features.length;
  }

  skipIntro() {
    if (this.screen !== 'intro') return;
    this.knownAge = 99;
    this.ghostDraw = 1;
    this.depart();
  }

  private depart() {
    this.screen = this.scene?.kind === 'world' ? 'world' : 'voyage';
    this.orbit.follow = true;
    this.orbit.lag = 1.1;
    if (this.clock) this.clock.playing = true;
    this.onEvent({ type: 'depart' }, this);
    this.emit({ introNote: null });
  }

  play() {
    if (!this.clock) return;
    if (this.clock.day >= this.clock.days) this.clock.seek(0);
    if (this.screen === 'ending') this.reopen();
    this.clock.playing = true;
    this.emit();
  }
  pause() {
    if (this.clock) this.clock.playing = false;
    this.emit();
  }
  toggle() {
    if (this.clock?.playing) this.pause();
    else this.play();
  }
  setSpeed(speed: number) {
    if (this.clock) this.clock.speed = speed;
    this.emit();
  }
  resume() {
    this.clock?.resume();
    this.landhoEntry = null;
    this.emit();
  }
  backToVoyage() {
    this.orbit.follow = true;
    this.emit();
  }

  /** Scrubbing: reveals or re-fogs at once. */
  seek(day: number) {
    const c = this.clock;
    const s = this.scene;
    if (!c || !s) return;
    if (this.screen === 'intro') this.skipIntro();
    if (this.screen === 'ending') this.reopen();
    c.seek(day);
    this.landhoEntry = null;
    this.knownAge = 99;
    this.ghostDraw = 1;
    this.journal = s.moments
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.day <= c.day)
      .map(({ m, i }) => this.entry(i, m));
    this.emit();
  }

  private reopen() {
    this.screen = this.scene?.kind === 'world' ? 'world' : 'voyage';
    this.satellite = 0;
    this.lineFade = 1;
    this.orbit.spin = 0;
    this.orbit.follow = true;
    this.orbit.lag = 1.1;
    this.emit({ endingCard: false });
  }

  private entry(index: number, m: Moment & { day: number }): JournalEntry {
    const s = this.scene!;
    return {
      key: `${s.id}-${index}`,
      day: m.day,
      date: s.kind === 'world' ? String(yearOf(s.route.start, m.day, s.route.calendar)) : formatDate(s.route.start, m.day, s.route.calendar),
      moment: m,
      source: s.voyage?.sources.find((src) => src.id === m.sourceId),
    };
  }

  // --- Per frame ---------------------------------------------------------------

  frame(dt: number) {
    this.time += dt;
    const c = this.clock;
    const s = this.scene;

    if (this.screen === 'landing' || this.screen === 'loading') {
      this.homeAmount = Math.min(1, this.homeAmount + dt * 0.6);
      // Smaller on portrait screens, so the title has room above it.
      this.orbit.targetDistance = this.orbit.zoomed(this.aspect < 0.8 ? 5.2 : 3.5);
      this.sunFromCamera();
    }

    if (this.screen === 'intro' && s) this.intro(dt);
    // The known world burns in and washes into colour once, whatever screen we are on by then.
    if (s && this.knownAge < 50 && (this.screen !== 'intro' || this.scriptT > 0.5)) {
      this.knownAge += dt;
      if (this.knownAge > 12) this.knownAge = 99;
    }

    if (c && s) {
      const events = c.tick(dt);
      for (const e of events) this.handle(e);
      c.history(this.hist);
      this.followCamera();
      this.sunFromDate();
    }

    if (this.screen === 'ending') this.ending(dt);

    this.orbit.update(dt);

    this.sinceEmit += dt;
    if (this.sinceEmit > 0.1) {
      this.sinceEmit = 0;
      this.emit();
    }
  }

  private intro(dt: number) {
    this.scriptT += dt;
    const t = this.scriptT;
    const ghost = this.hasGhost();
    if (ghost) {
      const note = this.scene!.voyage!.believedWorld!.note ?? '';
      if (t > 3.2 && this.snap.introNote === null) {
        this.emit({ introNote: note });
        // Pull back so the imagined coasts and home are both in view.
        const pts = this.scene!.voyage!.believedWorld!.features.flatMap((f) =>
          f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : [],
        );
        const home = toLonLat(this.scene!.home);
        const fit = spread([...pts.map(([lon, lat]) => ({ lon, lat })), { lon: home[0], lat: home[1] }]);
        this.orbit.target = fit.center;
        this.orbit.targetDistance = this.orbit.fitDistance(fit.radius, this.aspect);
      }
      if (t > 3.6) this.ghostDraw = Math.min(1, this.ghostDraw + dt / 3.2);
      if (t > 10.5) this.depart();
    } else if (t > 4.2) {
      this.depart();
    }
  }

  private handle(e: ClockEvent) {
    const s = this.scene!;
    if (e.type === 'moment' || e.type === 'landho') {
      const m = s.moments[e.index];
      const entry = this.entry(e.index, m);
      if (!this.journal.some((j) => j.key === entry.key)) this.journal = [...this.journal, entry];
      if (e.type === 'landho') {
        this.landhoEntry = entry;
        this.orbit.follow = true;
      }
      this.emit();
    }
    if (e.type === 'resume') {
      this.landhoEntry = null;
      this.emit();
    }
    if (e.type === 'end') this.toEnding();
    this.onEvent(e, this);
  }

  private followCamera() {
    const c = this.clock!;
    const s = this.scene!;
    if (!this.orbit.follow || this.screen === 'intro' || this.screen === 'ending') return;
    const lead = s.index.lead(c.day);
    if (!lead) return;
    if (s.kind === 'world') {
      this.orbit.target = lead.pos;
      this.orbit.targetDistance = this.orbit.zoomed(2.1);
      return;
    }
    // The camera breathes with the voyage: in close where land is coming into
    // view, pulled back across empty stretches.
    const quiet = Math.max(0, Math.min(1, (c.paceAt(c.day) - 1) / 2));
    let dist = 1 + (FOLLOW_DISTANCE[lead.mode] - 1) * (0.72 + 0.5 * quiet);
    let target = lead.pos;
    if (c.phase.kind === 'hold' || this.landhoEntry) {
      const m = this.landhoEntry?.moment;
      dist = 1 + (FOLLOW_DISTANCE[lead.mode] - 1) * 0.26;
      if (m) target = toVec(m.lon, m.lat);
    }
    this.orbit.target = target;
    this.orbit.targetDistance = this.orbit.zoomed(dist);
  }

  private sunFromDate() {
    const s = this.scene!;
    const c = this.clock!;
    const jdn = toJdn(s.route.start, s.route.calendar) + c.day;
    const dec = solarDeclination(jdn);
    const lead = s.index.lead(c.day);
    const [lon] = lead ? toLonLat(lead.pos) : toLonLat(this.orbit.center);
    // Early afternoon where they are: the day side faces us, the terminator crosses to the east.
    this.sunDir = toVec(lon - 28, dec);
  }

  private sunFromCamera() {
    const [lon, lat] = toLonLat(this.orbit.center);
    this.sunDir = toVec(lon - 35, Math.max(-60, Math.min(60, lat + 25)));
  }

  private toEnding() {
    const s = this.scene!;
    this.screen = 'ending';
    this.scriptT = 0;
    this.landhoEntry = null;
    this.orbit.follow = false;
    this.orbit.lag = 2.6;
    const fit = spread(s.points);
    this.orbit.target = fit.center;
    this.orbit.targetDistance = this.orbit.fitDistance(fit.radius, this.aspect);
    if (this.aspect < 0.8) {
      // Portrait: the whole globe across the width, above the cartouche.
      const half = Math.atan(Math.tan((this.orbit.fovDeg * Math.PI) / 360) * this.aspect);
      this.orbit.targetDistance = Math.max(this.orbit.targetDistance, 1 / Math.sin(half * 0.92));
    }
    if (fit.radius > 1.25) this.orbit.spin = 0.12;
    this.onEvent({ type: 'ending' }, this);
    this.emit();
  }

  private ending(dt: number) {
    this.scriptT += dt;
    const t = this.scriptT;
    if (t > 3) this.satellite = Math.min(1, this.satellite + dt / 3.5);
    this.lineFade = 1 - this.satellite * 0.85;
    if (t > 4.2 && !this.snap.endingCard) this.emit({ endingCard: true });
  }
}

export const stage = new Stage();
export { BASE_RATE };

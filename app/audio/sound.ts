// Sound (PRD "Sound"), synthesised with the Web Audio API so there are no
// recordings to license: ambient beds per terrain, a quiet theme per voyage
// that swells at landfalls, and a pen scratch as coastlines are inked.
// Nothing plays until the person presses play; mute is remembered.

import type { Mode } from '../data/types';

const MUTE_KEY = 'terra-incognita:muted';

/** Scale degrees (semitones from the root) and root frequency per voyage. */
const THEMES: Record<string, { root: number; scale: number[]; motif: number[] }> = {
  'columbus-1492': { root: 146.83, scale: [0, 2, 3, 5, 7, 9, 10], motif: [0, 2, 4, 3, 1, 0] },
  'magellan-1519': { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], motif: [4, 3, 2, 0, 1, 2, 0] },
  'lewis-clark-1804': { root: 98.0, scale: [0, 2, 4, 5, 7, 9, 10], motif: [0, 4, 5, 4, 2, 0] },
  'cook-1768': { root: 130.81, scale: [0, 2, 4, 6, 7, 9, 11], motif: [0, 2, 4, 6, 4, 2] },
  'amundsen-1911': { root: 82.41, scale: [0, 2, 3, 5, 7, 8, 10], motif: [0, 3, 2, 0, 4, 3] },
  world: { root: 123.47, scale: [0, 2, 4, 5, 7, 9, 11], motif: [0, 2, 4, 5, 4] },
};

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w * 0.5;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  return buf;
}

interface Bed {
  out: GainNode;
  level: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private beds = new Map<Mode | 'wind', Bed>();
  private noise: Record<'white' | 'pink' | 'brown', AudioBuffer> | null = null;
  private theme = THEMES.world;
  private mode: Mode | null = null;
  private timers: number[] = [];
  private nextNote = 0;
  private motifStep = 0;
  private penBudget = 0;
  private landho = false;
  muted = readMuted();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.15);
    for (const fn of this.listeners) fn();
  }

  /** Call from a click or tap: browsers only let audio start inside a gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    this.noise = { white: noiseBuffer(ctx, 4, 'white'), pink: noiseBuffer(ctx, 4, 'pink'), brown: noiseBuffer(ctx, 6, 'brown') };
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(master);
    this.buildBeds();
    this.timers.push(window.setInterval(() => this.schedule(), 250));
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = Math.random() * 1;
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  private lfo(rate: number, depth: number, target: AudioParam) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  private buildBeds() {
    const ctx = this.ctx!;
    const n = this.noise!;
    const bed = (key: Mode | 'wind', level: number, build: (out: GainNode) => void) => {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.master!);
      build(out);
      this.beds.set(key, { out, level });
    };
    // Sea: slow swells of low noise.
    bed('sea', 0.55, (out) => {
      const src = this.loop(n.brown);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const swell = ctx.createGain();
      swell.gain.value = 0.6;
      this.lfo(0.09, 0.35, swell.gain);
      this.lfo(0.13, 160, lp.frequency);
      src.connect(lp).connect(swell).connect(out);
    });
    // River: a brighter burble.
    bed('river', 0.32, (out) => {
      const src = this.loop(n.pink);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      this.lfo(2.7, 260, bp.frequency);
      this.lfo(0.4, 120, bp.frequency);
      src.connect(bp).connect(out);
    });
    // Land: wind in grass.
    bed('land', 0.26, (out) => {
      const src = this.loop(n.pink);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.6;
      this.lfo(0.07, 220, bp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.7;
      this.lfo(0.05, 0.3, g.gain);
      src.connect(bp).connect(g).connect(out);
    });
    // Ice: hiss of wind over snow.
    bed('ice', 0.3, (out) => {
      const src = this.loop(n.white);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 0.5;
      this.lfo(0.06, 900, bp.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      this.lfo(0.11, 0.35, g.gain);
      src.connect(hp).connect(bp).connect(g).connect(out);
    });
    // Wind for the land ho: everything else drops away to wind and waves.
    bed('wind', 0.4, (out) => {
      const src = this.loop(n.pink);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 380;
      bp.Q.value = 1.2;
      this.lfo(0.15, 140, bp.frequency);
      src.connect(bp).connect(out);
    });
  }

  private setLevels() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [key, bed] of this.beds) {
      let target = 0;
      if (this.landho) target = key === 'wind' ? bed.level : key === 'sea' ? bed.level * 1.2 : 0;
      else if (key === this.mode) target = bed.level;
      bed.out.gain.setTargetAtTime(target, ctx.currentTime, 1.2);
    }
    this.music?.gain.setTargetAtTime(this.landho ? 0.08 : this.mode ? 0.32 : 0.22, ctx.currentTime, 1.5);
  }

  setVoyage(id: string) {
    this.theme = THEMES[id] ?? THEMES.world;
    this.motifStep = 0;
  }

  setMode(mode: Mode | null) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.setLevels();
  }

  setLandho(on: boolean) {
    if (on === this.landho) return;
    this.landho = on;
    this.setLevels();
    if (!on) this.swell();
  }

  /** A short phrase of the theme, louder, for arrivals. */
  swell() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    this.theme.motif.forEach((deg, i) => this.pluck(this.freq(deg + 7), t + i * 0.32, 0.22, 2.2));
    this.pad(t, 5, 0.12);
  }

  /** Coast came into view: some pen strokes. Intensity 0..1. */
  pen(intensity: number) {
    this.penBudget = Math.min(6, this.penBudget + intensity * 3);
  }

  stopAll() {
    this.setMode(null);
    this.setLandho(false);
  }

  private freq(deg: number) {
    const s = this.theme.scale;
    const oct = Math.floor(deg / s.length);
    const step = s[((deg % s.length) + s.length) % s.length];
    return this.theme.root * 2 ** (oct + step / 12);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // Theme: a sparse, slow line over a drone, only while a voyage plays.
    if (this.mode && now > this.nextNote) {
      const motif = this.theme.motif;
      const deg = motif[this.motifStep % motif.length] + (this.motifStep % (motif.length * 2) >= motif.length ? 2 : 7);
      this.pluck(this.freq(deg), now + 0.05, 0.1, 3.2);
      if (this.motifStep % motif.length === 0) this.pad(now + 0.05, 9, 0.05);
      this.motifStep++;
      this.nextNote = now + (this.motifStep % motif.length === 0 ? 5.5 : 1.3 + Math.random() * 0.6);
    }
    // Pen: a few scratches per tick while there is coast to ink.
    if (this.penBudget > 0.05) {
      const strokes = Math.min(3, Math.ceil(this.penBudget));
      for (let i = 0; i < strokes; i++) this.scratch(now + Math.random() * 0.22);
      this.penBudget *= 0.55;
    }
  }

  private pluck(f: number, t: number, level: number, decay: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.001;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(this.music!);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.1);
    o2.stop(t + decay + 0.1);
  }

  private pad(t: number, dur: number, level: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.music!);
    for (const [deg, det] of [
      [0, -4],
      [4, 3],
      [7, 0],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = this.freq(deg) / 2;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private scratch(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3000 + Math.random() * 2500, t);
    bp.frequency.linearRampToValueAtTime(2200 + Math.random() * 2000, t + 0.12);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    const len = 0.06 + Math.random() * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.008);
    g.gain.setValueAtTime(0.06, t + len * 0.5);
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 3, len + 0.02);
  }
}

export const sound = new Sound();

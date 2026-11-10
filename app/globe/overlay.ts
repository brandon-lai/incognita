// DOM drawn over the globe: the little illustrated vessels with their wakes,
// and the ghost map's names. Positioned every frame by projecting points on
// the sphere; no React re-renders.

import * as THREE from 'three';
import { toVec, type Vec3 } from '../data/geo';
import type { Mode } from '../data/types';
import { stage } from '../engine/stage';

// Literal colours: CSS variables do not resolve inside SVG presentation attributes.
const INK = '#2a1c11';
const PAPER = '#f3e8cd';
const RED = '#8f2a17';

/** Small ink drawings, facing right, about 40 x 32. */
const ICONS: Record<Mode, string> = {
  sea: `<svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
    <path d="M4 22 L36 22 L31 28 L9 28 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M10 22 L10 25 M15 22 L15 26 M20 22 L20 26 M25 22 L25 26 M30 22 L30 25" stroke="${INK}" stroke-width="0.7"/>
    <path d="M20 22 L20 3 M11 22 L11 8 M29 22 L29 10" stroke="${INK}" stroke-width="1.2"/>
    <path d="M14 6 Q20 9 26 6 L25.5 17 Q20 19 14.5 17 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M7 10 Q11 12 14.5 10 L14 18 Q11 19.5 7.5 18 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>
    <path d="M29 11 L36 19 L29 19 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>
    <path d="M20 3 L24 4.5 L20 6" fill="${RED}" stroke="${INK}" stroke-width="0.6"/>
  </svg>`,
  river: `<svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
    <path d="M3 21 Q20 26 37 21 L34 26 Q20 29 6 26 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M13 21 L13 15 L27 15 L27 21" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M20 15 L20 5 M20 6 L28 12" stroke="${INK}" stroke-width="1"/>
    <circle cx="9" cy="17.5" r="1.8" fill="${INK}"/><path d="M9 19.5 L9 22 M9 20 L4 27" stroke="${INK}" stroke-width="1.1"/>
    <circle cx="31" cy="17.5" r="1.8" fill="${INK}"/><path d="M31 19.5 L31 22 M31 20 L36 27" stroke="${INK}" stroke-width="1.1"/>
  </svg>`,
  land: `<svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
    <path d="M8 18 Q10 12 18 12 L27 12 Q31 11 32 7 L35 8 L34 13 Q31 15 30 18 L30 27 M12 18 L11 27 M17 18 L17 27 M26 18 L27 27" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 18 Q14 20 30 18" fill="none" stroke="${INK}" stroke-width="1.2"/>
    <path d="M14 12 L15 9 L23 9 L24 12" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>
    <circle cx="20" cy="3.8" r="2" fill="${INK}"/><path d="M20 6 L20 10" stroke="${INK}" stroke-width="1.3"/>
  </svg>`,
  ice: `<svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
    <path d="M2 25 L22 25 Q25 25 25 22" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M4 22 L21 22 L21 16 L4 16 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M7 22 L7 25 M18 22 L18 25" stroke="${INK}" stroke-width="1"/>
    <path d="M21 19 L28 20" stroke="${INK}" stroke-width="0.8"/>
    <path d="M28 21 Q29 17 33 17 L35 15 L36 18 Q36 21 34 22 L33 25 M29 21 L28 25 M31 22 L31 25" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="12.5" cy="11" r="1.8" fill="${INK}"/><path d="M12.5 13 L12.5 16" stroke="${INK}" stroke-width="1.2"/>
  </svg>`,
};

const WAKE = `<svg class="wake" viewBox="0 0 60 20" width="60" height="20" aria-hidden="true">
  <path d="M58 10 Q40 6 4 2 M58 10 Q40 14 4 18" fill="none" stroke="${PAPER}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>
  <path d="M50 10 Q34 8 14 7 M50 10 Q34 12 14 13" fill="none" stroke="${PAPER}" stroke-width="0.8" stroke-linecap="round" opacity="0.5"/>
</svg>`;

interface Pooled {
  el: HTMLDivElement;
  mode: Mode | null;
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();

class Overlay {
  private root: HTMLDivElement | null = null;
  private vessels: Pooled[] = [];
  private labels: { el: HTMLDivElement; name: string }[] = [];
  private labelVersion = -1;

  attach(root: HTMLDivElement | null) {
    if (root === this.root) return;
    this.root = root;
    this.vessels = [];
    this.labels = [];
    this.labelVersion = -1;
    if (root) root.replaceChildren();
  }

  private project(p: Vec3, camera: THREE.Camera, W: number, H: number): { x: number; y: number; front: number } {
    v.set(p[0], p[1], p[2]);
    const cp = camera.position;
    // How far round the limb: 1 at the centre of the visible disc, 0 at the edge.
    const front = (v.dot(cp) - 1) / Math.max(1e-6, cp.length() - 1);
    w.copy(v).project(camera);
    return { x: (w.x * 0.5 + 0.5) * W, y: (-w.y * 0.5 + 0.5) * H, front };
  }

  update(camera: THREE.Camera, W: number, H: number) {
    const root = this.root;
    if (!root) return;
    const s = stage.scene;
    const c = stage.clock;
    const show = !!s && !!c && (stage.screen === 'voyage' || stage.screen === 'world' || stage.screen === 'ending' || stage.screen === 'intro');
    const vessels = show ? s!.index.vessels(c!.day) : [];
    while (this.vessels.length < vessels.length) {
      const el = document.createElement('div');
      el.className = 'vessel';
      root.appendChild(el);
      this.vessels.push({ el, mode: null });
    }
    this.vessels.forEach((p, i) => {
      const ves = vessels[i];
      if (!ves) {
        p.el.style.opacity = '0';
        return;
      }
      if (p.mode !== ves.mode) {
        p.mode = ves.mode;
        p.el.innerHTML = `${ves.mode === 'land' || ves.mode === 'ice' ? '' : WAKE}<div class="icon">${ICONS[ves.mode]}</div>`;
        p.el.dataset.mode = ves.mode;
      }
      const a = this.project(ves.pos, camera, W, H);
      const b = this.project(ves.ahead, camera, W, H);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const west = Math.cos(ang) < 0;
      const tilt = Math.max(-0.35, Math.min(0.35, west ? Math.atan2(-(b.y - a.y), -(b.x - a.x)) : ang));
      p.el.style.opacity = a.front > 0.02 && stage.screen !== 'ending' ? '1' : '0';
      p.el.style.transform = `translate(${a.x}px, ${a.y}px)`;
      const icon = p.el.querySelector<HTMLElement>('.icon');
      if (icon) icon.style.transform = `translate(-50%, -78%) rotate(${tilt}rad) scaleX(${west ? -1 : 1})`;
      const wake = p.el.querySelector<HTMLElement>('.wake');
      // Right-middle of the wake at the vessel, trailing back along the heading.
      if (wake) wake.style.transform = `rotate(${ang}rad) translate(-100%, -50%)`;
    });

    // Ghost map names.
    if (stage.version !== this.labelVersion) {
      this.labelVersion = stage.version;
      for (const l of this.labels) l.el.remove();
      this.labels = (s?.route.ghostLabels ?? []).map((g) => {
        const el = document.createElement('div');
        el.className = 'ghost-label';
        el.textContent = g.name;
        root.appendChild(el);
        return { el, name: g.name };
      });
    }
    const labels = s?.route.ghostLabels ?? [];
    this.labels.forEach((l, i) => {
      const g = labels[i];
      if (!g || !c) return;
      const a = this.project(toVec(g.lon, g.lat), camera, W, H);
      const fade = g.fadeDay >= 0 ? 1 - Math.max(0, Math.min(1, (c.day - g.fadeDay) / 5)) : 1;
      const op = Math.max(0, Math.min(1, (stage.ghostDraw - 0.3) / 0.4)) * fade * stage.lineFade * Math.min(1, a.front * 4);
      l.el.style.opacity = String(Math.max(0, op * 0.8));
      l.el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -50%)`;
    });
  }
}

export const overlay = new Overlay();

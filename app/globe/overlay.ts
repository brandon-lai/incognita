import * as THREE from 'three';
import { sprite } from '../art/stamps';
import { toVec, type Vec3 } from '../data/geo';
import type { Mode } from '../data/types';
import { stage } from '../engine/stage';

const svgNS = 'http://www.w3.org/2000/svg';
const v = new THREE.Vector3();
const w = new THREE.Vector3();

function vesselElement(root: HTMLDivElement) {
  const el = document.createElement('div');
  el.className = 'vessel';
  const wake = document.createElement('div');
  wake.className = 'wake';
  const icon = document.createElement('div');
  icon.className = 'icon';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 24');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '36');
  const art = document.createElementNS(svgNS, 'use');
  svg.append(art);
  icon.append(svg);
  el.append(wake, icon);
  root.append(el);
  return { el, icon, art, wake, mode: null as Mode | null, heading: null as number | null };
}

class Overlay {
  private root: HTMLDivElement | null = null;
  private vessels: ReturnType<typeof vesselElement>[] = [];
  private labels: { el: HTMLDivElement; pos: Vec3; fadeDay: number }[] = [];
  private version = -1;

  attach(root: HTMLDivElement | null) {
    if (root === this.root) return;
    this.root = root;
    this.vessels = [];
    this.labels = [];
    this.version = -1;
    root?.replaceChildren();
  }

  private project(p: Vec3, camera: THREE.Camera, width: number, height: number) {
    v.set(...p);
    const cp = camera.position;
    const front = (v.dot(cp) - 1) / Math.max(1e-6, cp.length() - 1);
    w.copy(v).project(camera);
    return { x: (w.x * 0.5 + 0.5) * width, y: (-w.y * 0.5 + 0.5) * height, front };
  }

  update(camera: THREE.Camera, width: number, height: number, dt: number) {
    const root = this.root;
    if (!root) return;
    const s = stage.scene;
    const c = stage.clock;
    if (stage.version !== this.version) {
      this.version = stage.version;
      for (const l of this.labels) l.el.remove();
      for (const p of this.vessels) p.heading = null;
      this.labels = (s?.route.ghostLabels ?? []).map((g) => {
        const el = document.createElement('div');
        el.className = 'ghost-label';
        el.textContent = g.name;
        root.append(el);
        return { el, pos: toVec(g.lon, g.lat), fadeDay: g.fadeDay };
      });
    }
    const vessels = s && c && stage.screen !== 'ending' && stage.screen !== 'loading' ? s.index.vessels(c.day) : [];
    while (this.vessels.length < vessels.length) this.vessels.push(vesselElement(root));
    this.vessels.forEach((p, i) => {
      const ship = vessels[i];
      if (!ship) {
        p.el.style.opacity = '0';
        p.heading = null;
        return;
      }
      if (p.mode !== ship.mode) {
        p.mode = ship.mode;
        p.art.setAttribute('href', sprite(ship.mode));
        p.wake.hidden = ship.mode !== 'sea' && ship.mode !== 'river';
      }
      const a = this.project(ship.pos, camera, width, height);
      const b = this.project(ship.ahead, camera, width, height);
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > 0.001) {
        const angle = Math.atan2(dy, dx);
        if (p.heading === null || stage.reducedMotion) p.heading = angle;
        else {
          const turn = angle - p.heading;
          p.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * -Math.expm1(-dt / 0.12);
        }
      }
      const angle = p.heading ?? 0;
      const west = Math.cos(angle) < 0;
      const tilt = Math.min(0.25, Math.max(-0.25, Math.sin(angle) * (west ? -1 : 1)));
      p.el.style.opacity = String(Math.max(0, Math.min(1, a.front * 22)));
      p.el.style.transform = `translate3d(${a.x}px,${a.y}px,0)`;
      p.icon.style.transform = `translate(-50%,-78%) rotate(${tilt}rad) scaleX(${west ? -1 : 1})`;
      if (!p.wake.hidden) p.wake.style.transform = `rotate(${angle}rad) translate(-100%,-50%)`;
    });
    this.labels.forEach(({ el, pos, fadeDay }) => {
      if (!c) return;
      const a = this.project(pos, camera, width, height);
      const fade = fadeDay >= 0 ? 1 - Math.max(0, Math.min(1, (c.day - fadeDay) / 5)) : 1;
      const op = Math.max(0, Math.min(1, (stage.ghostDraw - 0.3) / 0.4)) * fade * stage.lineFade * Math.min(1, a.front * 4);
      el.style.opacity = String(Math.max(0, op * 0.8));
      el.style.transform = `translate3d(${a.x}px,${a.y}px,0) translate(-50%,-50%)`;
    });
  }
}

export const overlay = new Overlay();

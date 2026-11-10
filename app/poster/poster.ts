// Poster export (PRD "Share"): the finished map, framed on the revealed
// region, with the voyage's title and dates, as a PNG for a phone screen or
// for print. Renders the live scene into an offscreen target, then lays it
// out on parchment with a 2D canvas.

import * as THREE from 'three';
import { formatDate } from '../data/dates';
import { gl3 } from '../globe/Scene';
import { PALETTE } from '../globe/palette';
import { spread } from '../engine/route';
import { stage } from '../engine/stage';

export type PosterSize = 'phone' | 'print';
export const POSTER_SIZES: Record<PosterSize, [number, number]> = {
  phone: [1170, 2532],
  print: [3600, 4800], // 12 x 16 in at 300 dpi
};

export function posterFilename(id: string, size: PosterSize) {
  return `terra-incognita-${id}-${size}.png`;
}

function renderGlobe(px: number): HTMLCanvasElement {
  const r = gl3.renderer;
  const scene = gl3.scene;
  const s = stage.scene;
  if (!r || !scene || !s) throw new Error('the globe is not ready');
  const fit = spread(s.points);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  const dist = Math.min(3.4, stage.orbit.fitDistance(Math.min(fit.radius, 1.3), 1) * 1.05);
  cam.position.set(fit.center[0] * dist, fit.center[1] * dist, fit.center[2] * dist);
  const c = fit.center;
  const up = new THREE.Vector3(-c[0] * c[1], 1 - c[1] * c[1], -c[2] * c[1]);
  if (up.lengthSq() < 1e-6) up.set(0, 0, -1);
  cam.up.copy(up.normalize());
  cam.lookAt(0, 0, 0);

  const target = new THREE.WebGLRenderTarget(px, px, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const globe = gl3.globe;
  const lines = gl3.lines;
  const saved = {
    flat: globe?.uniforms.uFlat.value as number,
    res: lines.map((m) => (m.uniforms.uResolution.value as THREE.Vector2).clone()),
    width: lines.map((m) => m.uniforms.uWidth.value as number),
    fade: lines.map((m) => m.uniforms.uFade.value as number),
    clear: r.getClearColor(new THREE.Color()),
    alpha: r.getClearAlpha(),
  };
  const k = px / 900;
  try {
    if (globe) globe.uniforms.uFlat.value = 1;
    lines.forEach((m) => {
      m.uniforms.uResolution.value.set(px, px);
      m.uniforms.uWidth.value = (m.uniforms.uWidth.value as number) * k;
      m.uniforms.uFade.value = Math.max(0.6, m.uniforms.uFade.value as number);
    });
    if (gl3.stars) gl3.stars.visible = false;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(target);
    r.clear();
    r.render(scene, cam);
    const pixels = new Uint8Array(px * px * 4);
    r.readRenderTargetPixels(target, 0, 0, px, px, pixels);
    const out = document.createElement('canvas');
    out.width = px;
    out.height = px;
    const ctx = out.getContext('2d')!;
    const img = ctx.createImageData(px, px);
    // WebGL rows run bottom-up.
    for (let y = 0; y < px; y++) img.data.set(pixels.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
    ctx.putImageData(img, 0, 0);
    return out;
  } finally {
    r.setRenderTarget(null);
    r.setClearColor(saved.clear, saved.alpha);
    if (gl3.stars) gl3.stars.visible = true;
    if (globe) globe.uniforms.uFlat.value = saved.flat;
    lines.forEach((m, i) => {
      m.uniforms.uResolution.value.copy(saved.res[i]);
      m.uniforms.uWidth.value = saved.width[i];
      m.uniforms.uFade.value = saved.fade[i];
    });
    target.dispose();
  }
}

export async function drawPoster(size: PosterSize): Promise<HTMLCanvasElement> {
  const s = stage.scene;
  if (!s?.voyage) throw new Error('no voyage loaded');
  await document.fonts.load('64px "IM Fell English"').catch(() => undefined);
  const [W, H] = POSTER_SIZES[size];
  const maxRb = Math.min(4096, gl3.renderer?.capabilities.maxTextureSize ?? 2048);
  const px = Math.min(maxRb, Math.round(W * 0.94));
  const globe = renderGlobe(px);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  // Parchment with a soft darker edge.
  ctx.fillStyle = PALETTE.parchment;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(243,232,205,0.6)');
  g.addColorStop(1, 'rgba(120,85,45,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Double ink border.
  const u = W / 100;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = u * 0.35;
  ctx.strokeRect(u * 2.5, u * 2.5, W - u * 5, H - u * 5);
  ctx.lineWidth = u * 0.12;
  ctx.strokeRect(u * 3.6, u * 3.6, W - u * 7.2, H - u * 7.2);

  // Centre the globe and the title block together.
  const gs = W * 0.86;
  const u0 = W / 100;
  const block = gs + u0 * 32;
  const gy = Math.max(u0 * 8, (H - block) / 2 - u0 * 2);
  ctx.drawImage(globe, (W - gs) / 2, gy, gs, gs);

  const v = s.voyage;
  const r = s.route;
  const cx = W / 2;
  let y = gy + gs + u * 10;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `${u * 3.2}px "IM Fell English", Georgia, serif`;
  ctx.fillText(v.explorer.toUpperCase().split('').join(String.fromCharCode(8202)), cx, y);
  y += u * 7.5;
  ctx.font = `${u * 7.5}px "IM Fell English", Georgia, serif`;
  ctx.fillText(v.title, cx, y);
  y += u * 5.5;
  ctx.font = `italic ${u * 3.2}px "IM Fell English", Georgia, serif`;
  ctx.fillText(`${formatDate(r.start, 0, r.calendar)} – ${formatDate(r.start, r.days, r.calendar)}`, cx, y);
  y += u * 4.6;
  ctx.font = `${u * 2.6}px "IM Fell English", Georgia, serif`;
  ctx.fillStyle = PALETTE.char;
  const km = new Intl.NumberFormat('en').format(r.distanceKm ?? 0);
  ctx.fillText(`${r.days} days · ${km} km`, cx, y);
  // Rule ornament.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = u * 0.15;
  ctx.beginPath();
  ctx.moveTo(cx - u * 14, gy + gs + u * 3);
  ctx.lineTo(cx + u * 14, gy + gs + u * 3);
  ctx.stroke();
  ctx.font = `italic ${u * 2}px "IM Fell English", Georgia, serif`;
  ctx.fillStyle = PALETTE.char;
  ctx.fillText('The fog is what they had not yet charted. Terra Incognita', cx, H - u * 6);
  return c;
}

export async function savePoster(size: PosterSize) {
  const c = await drawPoster(size);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) throw new Error('could not encode the image');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = posterFilename(stage.scene?.id ?? 'voyage', size);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Drag to turn the globe, wheel or pinch to zoom, tap to carry on after a
// land ho. Attached to the layer that holds the canvas.

import { stage } from '../engine/stage';

export function attachGestures(el: HTMLElement): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;

  const down = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (synthetic events); dragging still works.
    }
    if (pointers.size === 2) pinch = spread();
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const move = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) stage.orbit.drag(dx, dy, el.clientHeight);
    } else if (pointers.size === 2) {
      const d = spread();
      if (pinch > 0 && d > 0) stage.orbit.zoom(pinch / d);
      pinch = d;
      moved += 10;
    }
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (moved <= 4 && e.type === 'pointerup' && stage.getSnapshot().holding) stage.resume();
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.01 : 0.0015;
    stage.orbit.zoom(Math.exp(e.deltaY * k));
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}

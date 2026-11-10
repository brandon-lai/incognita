import { useRef } from 'react';
import { SPEEDS } from '../engine/clock';
import { stage, type Snapshot } from '../engine/stage';

/** Play, speed and the scrubber. Dragging re-fogs or reveals at once. */
export function Timeline({ snap }: { snap: Snapshot }) {
  const track = useRef<HTMLDivElement>(null);
  const moments = stage.scene?.moments ?? [];
  const days = Math.max(1, snap.days);

  const seekFrom = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    stage.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * days);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? days / 20 : Math.max(1, days / 200);
    if (e.key === 'ArrowRight') stage.seek(snap.day + step);
    else if (e.key === 'ArrowLeft') stage.seek(snap.day - step);
    else if (e.key === 'Home') stage.seek(0);
    else if (e.key === 'End') stage.seek(days);
    else return;
    e.preventDefault();
  };

  const nextSpeed = () => {
    const i = SPEEDS.indexOf(snap.speed);
    stage.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  return (
    <div className="timeline">
      <button className="icon-btn play" onClick={() => stage.toggle()} aria-label={snap.playing ? 'Pause' : 'Play'}>
        {snap.playing ? (
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M6 4v12M14 4v12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M6 3.5 L16 10 L6 16.5 Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div
        className="track"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Voyage timeline"
        aria-valuemin={0}
        aria-valuemax={days}
        aria-valuenow={Math.round(snap.day)}
        aria-valuetext={snap.date}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Synthetic pointers cannot be captured; seeking still works.
          }
          seekFrom(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFrom(e.clientX);
        }}
      >
        <div className="track-line" />
        <div className="track-fill" style={{ width: `${(snap.day / days) * 100}%` }} />
        {moments.map((m, i) => (
          <span
            key={i}
            className={`mark kind-${m.kind}${m.slowMotion ? ' is-landfall' : ''}${m.day <= snap.day ? ' is-past' : ''}`}
            style={{ left: `${(m.day / days) * 100}%` }}
            title={m.title}
          />
        ))}
        <div className="track-head" style={{ left: `${(snap.day / days) * 100}%` }} />
      </div>
      <button className="speed" onClick={nextSpeed} aria-label={`Playback speed ${snap.speed} times. Change speed`}>
        {snap.speed}×
      </button>
    </div>
  );
}

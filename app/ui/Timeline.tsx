import { Slider } from '../components/ui/slider';
import { SPEEDS } from '../engine/clock';
import { stage, type Snapshot } from '../engine/stage';

/** Play, speed and the scrubber. Dragging re-fogs or reveals at once. */
export function Timeline({ snap }: { snap: Snapshot }) {
  const moments = stage.scene?.moments ?? [];
  const days = Math.max(1, snap.days);

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
      <Slider
        label="Voyage timeline"
        valueText={snap.date}
        max={days}
        value={snap.day}
        step={1}
        largeStep={Math.max(1, Math.round(days / 20))}
        onValueChange={(day) => stage.seek(day)}
      >
        {moments.map((m, i) => (
          <span
            key={i}
            className={`mark kind-${m.kind}${m.slowMotion ? ' is-landfall' : ''}${m.day <= snap.day ? ' is-past' : ''}`}
            style={{ left: `${(m.day / days) * 100}%` }}
            title={m.title}
          />
        ))}
      </Slider>
      <button className="speed" onClick={nextSpeed} aria-label={`Playback speed ${snap.speed} times. Change speed`}>
        {snap.speed}×
      </button>
    </div>
  );
}

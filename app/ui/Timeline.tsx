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
    <div className={`timeline${snap.playing ? ' is-playing' : ''}`}>
      <button className="icon-btn play" onClick={() => stage.toggle()} aria-label={snap.playing ? 'Pause' : 'Play'}>
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
          <path className="play-glyph" d="M6 3h2v2h3v2h3v2h3v2h-3v2h-3v2H8v2H6z" />
          <path className="pause-glyph" d="M4 3h4v14H4zm8 0h4v14h-4z" />
        </svg>
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

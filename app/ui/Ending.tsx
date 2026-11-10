import { useState } from 'react';
import { formatDate } from '../data/dates';
import { stage } from '../engine/stage';
import { savePoster, type PosterSize } from '../poster/poster';

const nf = new Intl.NumberFormat('en');

/** The cartouche: what the voyage covered, and where to go next. */
export function Ending({ onHome, onWorld }: { onHome: () => void; onWorld: () => void }) {
  const s = stage.scene;
  const [saving, setSaving] = useState<PosterSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!s) return null;
  const v = s.voyage;
  const r = s.route;
  const km = r.distanceKm ?? 0;

  const save = async (size: PosterSize) => {
    setSaving(size);
    setError(null);
    try {
      await savePoster(size);
    } catch (err) {
      setError(`The poster could not be made on this device (${String(err)}).`);
    } finally {
      setSaving(null);
    }
  };

  if (s.kind === 'world') {
    return (
      <div className="ending" role="dialog" aria-label="The world uncovered">
        <div className="cartouche">
          <p className="cartouche-kicker">1000 – 1912</p>
          <h2 className="cartouche-title">The world uncovering</h2>
          <p className="cartouche-text">
            Five expeditions, and the charts that filled in around them. The fog that remains is what European maps still left blank in 1912, never what nobody knew.
          </p>
          <div className="ending-actions">
            <button className="btn primary" onClick={onHome}>
              Choose a voyage
            </button>
            <button className="btn" onClick={() => stage.seek(0)}>
              Watch again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ending" role="dialog" aria-label={`${v?.title ?? ''} complete`}>
      <div className="cartouche">
        <p className="cartouche-kicker">{v?.explorer}</p>
        <h2 className="cartouche-title">{v?.title}</h2>
        <p className="cartouche-dates">
          {formatDate(r.start, 0, r.calendar)} – {formatDate(r.start, r.days, r.calendar)}
        </p>
        <dl className="cartouche-stats">
          <div>
            <dt>Days</dt>
            <dd>{nf.format(r.days + 1)}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>
              {nf.format(km)} km <span className="sub">{nf.format(Math.round(km / 1.852))} nautical miles</span>
            </dd>
          </div>
        </dl>
        <p className="cartouche-text">The fog that remains is what they still did not know.</p>
        <div className="ending-actions">
          <button className="btn primary" onClick={onHome}>
            Another voyage
          </button>
          <button className="btn" onClick={onWorld}>
            The world uncovering
          </button>
        </div>
        <div className="ending-actions small">
          <span>Save the map:</span>
          <button className="link" disabled={!!saving} onClick={() => save('phone')}>
            {saving === 'phone' ? 'Drawing…' : 'Phone poster'}
          </button>
          <button className="link" disabled={!!saving} onClick={() => save('print')}>
            {saving === 'print' ? 'Drawing…' : 'Print poster'}
          </button>
          <button className="link" onClick={() => stage.seek(0)}>
            Replay
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

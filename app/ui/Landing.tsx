import type { VoyageCard } from '../data/loader';

interface Props {
  cards: VoyageCard[] | null;
  error: string | null;
  focused: string | null;
  onFocus: (card: VoyageCard) => void;
  onPick: (card: VoyageCard) => void;
  onWorld: () => void;
  onAbout: () => void;
  onRetry: () => void;
}

const fmtYears = (y: [number, number]) => (y[0] === y[1] ? String(y[0]) : `${y[0]}–${String(y[1]).slice(-2)}`);

export function Landing({ cards, error, focused, onFocus, onPick, onWorld, onAbout, onRetry }: Props) {
  const year = cards?.find((c) => c.id === focused)?.years[0];
  return (
    <div className="landing">
      <header className="landing-head">
        <h1 className="title">Terra Incognita</h1>
        <p className="lede">Ride along with an expedition on a globe covered in fog. The fog lifts only where they could see, so the map you end with is the map they earned.</p>
        <p className="whose">
          The fog shows what each expedition's own charts had not yet mapped. Every one of these lands was already home to people who knew it well.
        </p>
      </header>

      {year !== undefined && (
        <div className="corner-year" aria-hidden="true">
          {year}
        </div>
      )}

      <nav className="cards" aria-label="Voyages">
        {error && (
          <div className="card card-error" role="alert">
            <p>{error}</p>
            <button className="btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
        {!cards && !error && <div className="card card-skeleton" aria-busy="true" />}
        {cards?.map((c) => (
          <button
            key={c.id}
            className={`card${focused === c.id ? ' is-focused' : ''}`}
            onMouseEnter={() => onFocus(c)}
            onFocus={() => onFocus(c)}
            onClick={() => onPick(c)}
          >
            <span className="card-years">{fmtYears(c.years)}</span>
            <span className="card-title">{c.explorer}</span>
            <span className="card-sub">{c.title}</span>
            <span className="card-summary">{c.summary}</span>
            <span className="card-source">{c.sourceNote.split(/(?<=\.)\s/)[0]}</span>
            {c.status !== 'reviewed' && <span className="stamp">{c.status === 'placeholder' ? 'Placeholder data' : 'Draft route'}</span>}
          </button>
        ))}
        {cards && (
          <button className="card card-world" onClick={onWorld}>
            <span className="card-years">1000–1912</span>
            <span className="card-title">The world uncovering</span>
            <span className="card-summary">Every voyage in date order on one globe. Watch the charted world grow.</span>
          </button>
        )}
      </nav>

      <button className="link about-link" onClick={onAbout}>
        About this map
      </button>
    </div>
  );
}

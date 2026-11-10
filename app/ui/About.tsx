import { useEffect, useRef } from 'react';

declare const __BUILD__: string;

/** The about panel (PRD accuracy rules 7 and "Whose unknown"). */
export function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="about" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="about-body">
        <h2>About this map</h2>
        <h3>Whose unknown</h3>
        <p>
          The fog shows what each expedition and its culture had not yet charted. It is not a map of what nobody knew. Every coast and valley here was home to
          people who knew it well: the Taíno and Lucayans, the Mandan, Shoshone and Nez Perce, the people of Tahiti and Aotearoa, and many more. The voyages
          depended on them, as guides, interpreters, hosts and traders, and the journal treats those encounters as part of the story, not footnotes.
        </p>
        <h3>The reveal is a model</h3>
        <p>
          What lifts the fog is an estimate of what the expedition could have seen, not a record of what anyone did see. At sea it is the horizon from a lookout
          25&nbsp;m up the mast, about 18&nbsp;km, plus land high enough to show above it. On land and rivers it is a line-of-sight calculation over real
          terrain from eye height, out to 60&nbsp;km. On the ice it is a small, steady circle. These are starting values chosen for feel.
        </p>
        <h3>Routes and dates</h3>
        <p>
          The line is solid where both ends are documented positions from a primary source, and dashed where a historian has reconstructed the track or the
          code has filled a gap. Where historians disagree, as over Columbus's first landfall, the candidates are drawn as dashed rings. Dates are given as the
          source recorded them: Columbus and Magellan's crews used the Julian calendar.
        </p>
        <p>
          <strong>Status:</strong> every route here is a draft, compiled from the cited sources but not yet checked line by line by a historian. Treat positions
          and dates as approximate until each voyage is marked reviewed.
        </p>
        <p>
          The known world, and the imagined geography drawn in faint ink before departure, are hand-drawn approximations after period maps such as Martin
          Behaim's globe of 1492. They are labelled approximate for a reason.
        </p>
        <h3>Quotes</h3>
        <p>Quotations come only from public-domain texts and are kept short. Everything else is in our own words, and each note links to its source.</p>
        <h3>Sources and credits</h3>
        <ul>
          <li>
            Imagery: NASA Blue Marble (shaded relief and bathymetry) via NASA GIBS. Public domain.
          </li>
          <li>Coastlines, land, lakes and rivers: Natural Earth. Public domain.</li>
          <li>
            Terrain: Terrarium elevation tiles on AWS Open Data, from SRTM, GMTED2010, ETOPO1 and other sources; see the{' '}
            <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">
              terrain attributions
            </a>
            .
          </li>
          <li>Fonts: IM Fell English by Igino Marini, SIL Open Font License.</li>
          <li>Sound and music are synthesised in your browser. Nothing is recorded or sent anywhere.</li>
        </ul>
        <p className="build">No accounts, no tracking. Build {__BUILD__}.</p>
        <button className="btn primary" onClick={onClose} autoFocus>
          Back to the map
        </button>
      </div>
    </dialog>
  );
}

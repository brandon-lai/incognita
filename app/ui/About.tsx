import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { sound } from '../audio/sound';

declare const __BUILD__: string;

/** The about panel (PRD accuracy rules 7 and "Whose unknown"). */
export function About({ open, onClose, voyage, momentURL }: {
  open: boolean; onClose: () => void; voyage: string | null; momentURL: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setNotice('');
      d.showModal();
      heading.current?.focus();
      d.scrollTop = 0;
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="about" aria-labelledby="about-heading" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="about-body">
        <header className="about-heading">
          <h2 id="about-heading" ref={heading} tabIndex={-1}>About this map</h2>
          <button className="link" onClick={onClose}>Close</button>
        </header>
        <div className="about-tools">
          {momentURL && <a href={momentURL}>Bookmark or share this day</a>}
          <a href={`/journals.html${voyage && voyage !== 'world' ? `#${voyage}` : ''}`}>Read the journals without the globe</a>
        </div>
        <h3>At the helm</h3>
        <p>Use Space to play or pause. Drag the globe to look around, or use the timeline to jump to a day. On the timeline, use the arrow keys for a day and Shift + arrow for a longer step.</p>
        <h3>Whose unknown</h3>
        <p>
          The fog shows what each expedition and its culture had not yet charted. It is not a map of what nobody knew. Many of these coasts and valleys were home to
          people who knew them well: the Taíno and Lucayans, the Mandan, Shoshone and Nez Perce, the people of Tahiti and Aotearoa, and many more. The voyages
          depended on them, as guides, interpreters, hosts and traders, and the journal treats those encounters as part of the story, not footnotes.
        </p>
        <h3>The reveal is a model</h3>
        <p>
          What lifts the fog is an estimate of what the expedition could have seen, not a record of what anyone did see. At sea it is the horizon from a lookout
          25&nbsp;m up the mast, about 18&nbsp;km, plus land high enough to show above it. On land and rivers it is a line-of-sight calculation over real
          terrain from eye height, out to 90&nbsp;km. On the ice, the model includes the nearest 8&nbsp;km and visible ground out to 60&nbsp;km. These are estimates, not observations.
        </p>
        <h3>Routes and dates</h3>
        <p>
          The line is solid where both ends are documented positions from a primary source, and dashed where a historian has reconstructed the track or the
          code has filled a gap. Where historians disagree, as over Columbus's first landfall, the candidates are drawn as dashed rings. Dates are given as the
          source recorded them: Columbus and Magellan's crews used the Julian calendar.
        </p>
        <p>
          Routes marked <strong>Draft route</strong> were compiled from the cited sources but have not yet been checked line by line by a historian. Treat their positions and dates as approximate.
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
          <li>Fonts: IM Fell English by Igino Marini and Pixelify Sans by the Pixelify Sans Project Authors. Both use the <a href="/font-license.txt">SIL Open Font License</a>.</li>
          <li>Sound and music are synthesised in your browser. Nothing is recorded or sent anywhere.</li>
        </ul>
        <h3>Privacy and settings</h3>
        <p>No accounts or analytics. The only preference the map saves in this browser is sound. Posters are made on your device. Opening a source or feedback link takes you to another site.</p>
        <button className="link" onClick={() => {
          try {
            sound.forgetPreference();
            setNotice('Sound preference cleared. Sound is on by default.');
          } catch {
            setNotice('Browser storage is unavailable. No saved preference could be cleared.');
          }
        }}>Clear saved sound preference</button>
        <p role="status">{notice}</p>
        <p><a href="https://github.com/brandon-lai/incognita/issues">Report a map or source correction</a></p>
        <p className="build">Build {__BUILD__}.</p>
        <Button className="primary" onClick={onClose}>
          Back to the map
        </Button>
      </div>
    </dialog>
  );
}

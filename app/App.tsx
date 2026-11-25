import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sound } from './audio/sound';
import { julianLag, toJdn } from './data/dates';
import { loadIndex, loadVoyage, loadWorld, type VoyageCard } from './data/loader';
import { startingPoint, voyageURL, type StartingPoint } from './data/voyage-link';
import { overlay } from './globe/overlay';
import { GlobeCanvas, gl3 } from './globe/Scene';
import { stage } from './engine/stage';
import { About } from './ui/About';
import { Ending } from './ui/Ending';
import { attachGestures } from './ui/gestures';
import { Journal } from './ui/Journal';
import { Landing } from './ui/Landing';
import { Timeline } from './ui/Timeline';
import { useIdle, useStage } from './ui/useStage';

const params = new URLSearchParams(location.search);
const hasWebGL2 = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();
const attachOverlay = (el: HTMLDivElement | null) => overlay.attach(el);

function MuteButton() {
  const muted = useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => sound.muted,
  );
  return (
    <button className="icon-btn" onClick={() => sound.setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute'} aria-pressed={muted}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
        {muted ? (
          <path d="M13 7.5l5 5M18 7.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        ) : (
          <path d="M13 7a4 4 0 010 6M15.5 5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

export function App() {
  if (!hasWebGL2) {
    return (
      <main className="nogl">
        <h1 className="title">Terra Incognita</h1>
        <p className="lede">This browser cannot draw the 3D globe. You can still read all five expeditions in date order, with their notes and sources.</p>
        <a href="/journals.html">Read the expedition journals</a>
      </main>
    );
  }
  return <MapApp />;
}

function MapApp() {
  const snap = useStage();
  const [cards, setCards] = useState<VoyageCard[] | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [weather, setWeather] = useState(0);
  const playingView = snap.screen === 'voyage' || snap.screen === 'world';
  const idle = useIdle(3200, playingView && snap.playing && !snap.holding && !about);
  const lastPick = useRef<(() => void) | null>(null);

  const fetchIndex = useCallback(() => {
    setIndexError(null);
    loadIndex()
      .then((list) => {
        const visible = list.filter((c) => c.status !== 'placeholder' || params.has('debug'));
        setCards(visible);
        const first = visible.find((c) => c.id === params.get('voyage')) ?? visible[0];
        if (first && stage.screen === 'landing') {
          setFocused(first.id);
          stage.focusHome(first);
        }
      })
      .catch(() => setIndexError('The list of voyages did not load. Check your connection and try again.'));
  }, []);

  useEffect(() => {
    stage.showLanding(null);
    fetchIndex();
  }, [fetchIndex]);

  const openVoyage = useCallback((card: VoyageCard | null, at?: StartingPoint) => {
    const id = card?.id ?? 'world';
    const title = card?.title ?? 'The world uncovering';
    sound.setVoyage(id);
    setJournalOpen(false);
    const go = async () => {
      stage.setLoading(title);
      try {
        if (card) stage.startVoyage(await loadVoyage(id, gl3.size));
        else stage.startWorld(await loadWorld(gl3.size));
        if (at) {
          stage.seek(at.day);
          if (at.paused) stage.pause();
        }
        history.replaceState(null, '', voyageURL(location.href, id, at));
      } catch (err) {
        stage.setError(`The chart did not load. Check your connection and try again. (${String(err)})`);
      }
    };
    lastPick.current = go;
    go();
  }, []);

  const home = useCallback(() => {
    sound.stopAll();
    const card = cards?.find((c) => c.id === focused) ?? cards?.[0] ?? null;
    stage.showLanding(card);
    history.replaceState(null, '', voyageURL(location.href, null));
  }, [cards, focused]);

  // Deep link: ?voyage=<id> opens straight into a voyage.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !cards) return;
    const id = params.get('voyage');
    const card = cards.find((c) => c.id === id);
    if (card || id === 'world') {
      opened.current = true;
      openVoyage(card ?? null, startingPoint(params));
    }
  }, [cards, openVoyage]);

  useEffect(() => {
    stage.suspended = about || !!assetError;
    if (stage.suspended) sound.stopAll();
    return () => { stage.suspended = false; };
  }, [about, assetError]);

  // Sound follows the stage.
  useEffect(() => {
    stage.onEvent = (e, s) => {
      if (e.type === 'depart') sound.setMode(s.scene?.index.lead(s.clock?.day ?? 0)?.mode ?? 'sea');
      if (e.type === 'landho') sound.setLandho(true);
      if (e.type === 'resume') sound.setLandho(false);
      if (e.type === 'moment' && s.scene?.moments[e.index]?.kind === 'landfall') sound.swell();
      // Hardship brings brief weather over the vessel: rain and a darker sky.
      if ((e.type === 'moment' || e.type === 'landho') && s.scene?.moments[e.index]?.kind === 'hardship') {
        setWeather((n) => n + 1);
        window.setTimeout(() => setWeather((n) => n - 1), 5000);
      }
      if (e.type === 'ending') {
        sound.setLandho(false);
        sound.setMode(null);
        sound.swell();
      }
    };
    let lastDay = -1;
    const t = window.setInterval(() => {
      const s = stage.scene;
      const c = stage.clock;
      if (!s || !c || stage.suspended) return;
      if (stage.screen === 'voyage' || stage.screen === 'world') {
        if (!c.holding) sound.setMode(c.playing ? (s.index.lead(c.day)?.mode ?? null) : null);
        if (c.holding) sound.setLandho(true);
        else if (stage.getSnapshot().landho === null) sound.setLandho(false);
      }
      const per = s.route.coastPerDay;
      if (per && c.playing && lastDay >= 0) {
        let sum = 0;
        for (let d = Math.floor(lastDay) + 1; d <= Math.floor(c.day); d++) sum += per[d] ?? 0;
        if (sum > 0) sound.pen(Math.min(1, sum / 25));
      }
      lastDay = c.day;
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  // Audio can only start inside a gesture. A deep link opens a voyage without one,
  // so the first tap or key anywhere starts (or resumes) the sound.
  useEffect(() => {
    const wake = () => sound.start();
    window.addEventListener('click', wake, { once: true });
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('click', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  // Keyboard: space plays and pauses, escape closes.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (stage.suspended || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
          (e.target instanceof Element && e.target.closest('button,a,input,textarea,select,[contenteditable="true"],[role="slider"]'))) return;
      if (e.key === ' ' && (stage.screen === 'voyage' || stage.screen === 'world')) {
        e.preventDefault();
        if (stage.getSnapshot().holding) stage.resume();
        else stage.toggle();
      }
      if (e.key === 'Enter' && stage.getSnapshot().holding) stage.resume();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const gestures = useRef<(() => void) | null>(null);
  const globeLayer = useCallback((el: HTMLDivElement | null) => {
    gestures.current?.();
    gestures.current = el ? attachGestures(el) : null;
  }, []);

  if (assetError) {
    return (
      <main className="nogl">
        <h1 className="title">The globe could not load</h1>
        <p role="alert">{assetError}</p>
        <p><button className="btn" onClick={() => location.reload()}>Reload the map</button></p>
        <a href="/journals.html">Read the journals instead</a>
      </main>
    );
  }

  const s = stage.scene;
  const julian = snap.calendar === 'julian' && s?.kind === 'voyage';
  const lag = julian && s ? julianLag(toJdn(s.route.start, 'julian') + snap.day) : 0;
  const status = s?.voyage?.status;

  return (
    <div className={`app screen-${snap.screen}${idle ? ' is-idle' : ''}${snap.holding ? ' is-holding' : ''}`}>
      <div className="globe-layer" ref={globeLayer}>
        <GlobeCanvas onError={setAssetError} />
      </div>
      <div className="overlay-layer" ref={attachOverlay} aria-hidden="true" />
      <div className={`weather${weather > 0 && playingView ? ' is-on' : ''}`} aria-hidden="true" />

      {snap.screen === 'landing' && (
        <Landing
          cards={cards}
          error={indexError}
          focused={focused}
          onFocus={(c) => {
            setFocused(c.id);
            stage.focusHome(c);
          }}
          onPick={openVoyage}
          onWorld={() => openVoyage(null)}
          onAbout={() => setAbout(true)}
          onRetry={fetchIndex}
        />
      )}

      {snap.screen === 'loading' && (
        <div className="loading" role="status">
          {snap.error ? (
            <>
              <p className="error">{snap.error}</p>
              <div className="ending-actions">
                <button className="btn primary" onClick={() => lastPick.current?.()}>
                  Try again
                </button>
                <button className="btn" onClick={home}>
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="loading-title">{snap.title}</p>
              <p className="loading-sub">Unrolling the chart…</p>
            </>
          )}
        </div>
      )}

      {snap.screen === 'intro' && (
        <div className="intro">
          <p className="intro-title">{snap.title}</p>
          {snap.introNote ? <p className="intro-note">{snap.introNote}</p> : s?.voyage && <p className="intro-source">{s.voyage.sourceNote}</p>}
          <button className="btn" onClick={() => stage.skipIntro()}>
            Set sail
          </button>
        </div>
      )}

      {(playingView || snap.screen === 'intro') && (
        <div className="hud fades">
            <p className="hud-title">
              {snap.title}
              {status && status !== 'reviewed' && (
                <span className="chip" title="Compiled from the cited sources, not yet reviewed by a historian">
                  {status === 'placeholder' ? 'Placeholder data' : 'Draft route'}
                </span>
              )}
            </p>
            {s?.kind === 'world' ? (
              <p className="hud-year" aria-live="off">
                {snap.year}
              </p>
            ) : (
              <>
                <p className="hud-date">{snap.date}</p>
                <p className="hud-day">
                  Day {snap.dayCount} of {snap.days + 1}
                  {julian && (
                    <span className="julian" title={`Dates as recorded, in the Julian calendar. Add ${lag} days for the Gregorian calendar.`}>
                      {' '}
                      · Julian calendar (+{lag} days)
                    </span>
                  )}
                </p>
              </>
            )}
        </div>
      )}
      {(playingView || snap.screen === 'ending' || snap.screen === 'intro') && (
          <div className="topbar fades">
            <MuteButton />
            <button className="icon-btn" onClick={() => setAbout(true)} aria-label="About this map">
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 9v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <circle cx="10" cy="6.3" r="1.1" fill="currentColor" />
              </svg>
            </button>
            <button className="icon-btn" onClick={home} aria-label="Close and choose another voyage">
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
      )}

      {playingView && (
        <>
          <Journal entries={snap.journal} landho={snap.landho} open={journalOpen} onToggle={() => setJournalOpen(!journalOpen)} />
          <div className="bottom fades">
            {!snap.follow && snap.screen !== 'ending' && (
              <button className="btn back" onClick={() => stage.backToVoyage()}>
                Back to the voyage
              </button>
            )}
            <Timeline snap={snap} />
            <div className="legend" aria-label="Legend">
              <span>
                <i className="swatch solid" /> documented
              </span>
              <span>
                <i className="swatch dashed" /> reconstructed or estimated
              </span>
            </div>
          </div>
          {snap.holding && (
            <button className="continue" onClick={() => stage.resume()}>
              Tap to continue
            </button>
          )}
        </>
      )}

      {snap.screen === 'ending' && snap.endingCard && <Ending onHome={home} onWorld={() => openVoyage(null)} />}

      <About open={about} onClose={() => setAbout(false)} voyage={snap.voyageId}
        momentURL={about && playingView && snap.voyageId ? voyageURL(location.href, snap.voyageId, { day: Math.floor(snap.day), paused: true }).href : null} />
    </div>
  );
}

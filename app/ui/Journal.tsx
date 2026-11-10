import { useEffect, useRef, useState } from 'react';
import type { JournalEntry } from '../engine/stage';

const KIND: Record<string, string> = {
  landfall: 'Landfall',
  journal: 'From the journal',
  hardship: 'Hardship',
  encounter: 'Encounter',
  'turning-point': 'Turning point',
};

function Entry({ e, current }: { e: JournalEntry; current: boolean }) {
  const [open, setOpen] = useState(false);
  const m = e.moment;
  return (
    <article className={`entry kind-${m.kind}${current ? ' is-current' : ''}`}>
      <div className="entry-meta">
        <span className="entry-kind">{KIND[m.kind] ?? m.kind}</span>
        <span className="entry-date">{e.date}</span>
      </div>
      <h3 className="entry-title">{m.title}</h3>
      <p className={m.isQuote ? 'entry-text quote' : 'entry-text'}>{m.isQuote ? `“${m.text}”` : m.text}</p>
      {m.candidates && m.candidates.length > 0 && (
        <p className="entry-debate">Debated: {m.candidates.map((c) => c.name).join(' · ')}. Each is drawn as a dashed ring.</p>
      )}
      {e.source && (
        <div className="entry-source">
          <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
            {m.isQuote ? 'Quoted from' : 'In our words, after'} {e.source.author.split(',')[0]}
          </button>
          {open && (
            <p className="source-detail">
              {e.source.title}. {e.source.author}.{' '}
              {e.source.url && (
                <a href={e.source.url} target="_blank" rel="noreferrer">
                  Find the text
                </a>
              )}
              {!e.source.publicDomain && ' (In copyright: paraphrased, never quoted.)'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** The margin on wide screens, a bottom sheet on phones. Newest entry first. */
export function Journal({ entries, landho, open, onToggle }: { entries: JournalEntry[]; landho: JournalEntry | null; open: boolean; onToggle: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const latest = entries[entries.length - 1];
  useEffect(() => {
    list.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entries.length]);
  return (
    <aside className={`journal${open ? ' is-open' : ''}${landho ? ' is-landho' : ''}`} aria-label="Journal">
      <button className="journal-handle" onClick={onToggle} aria-expanded={open}>
        <span className="journal-handle-bar" aria-hidden="true" />
        <span>{latest ? latest.moment.title : 'Journal'}</span>
      </button>
      <div className="journal-list" ref={list}>
        {entries.length === 0 && <p className="entry-empty">Notes from the voyage appear here as it unfolds.</p>}
        {[...entries].reverse().map((e) => (
          <Entry key={e.key} e={e} current={e.key === landho?.key || e === latest} />
        ))}
      </div>
    </aside>
  );
}

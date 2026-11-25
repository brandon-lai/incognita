import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { formatDate } from '../app/data/dates';
import type { VoyageCard } from '../app/data/loader';
import type { BakedRoute, Voyage } from '../app/data/types';

const text = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function sourceURL(value?: string) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Unsupported journal source URL: ${value}`);
  return text(url.href);
}

function article(v: Voyage, route: BakedRoute) {
  const id = text(v.id);
  const sources = v.sources.map((s) => {
    const url = sourceURL(s.url);
    return `<li id="${id}-${text(s.id)}">${text(s.author)}. <cite>${text(s.title)}</cite>${url ? ` · <a href="${url}">Find the text</a>` : ''}</li>`;
  }).join('');
  const entries = route.moments.map((m) => {
    const source = v.sources.find((s) => s.id === m.sourceId);
    if (!source) throw new Error(`${v.id}: missing journal source ${m.sourceId}`);
    return `<li><p class="date">${text(formatDate(route.start, m.day, route.calendar))}</p>
      <h3>${text(m.title)}</h3><p>${m.isQuote ? `<q>${text(m.text)}</q>` : text(m.text)}</p>
      ${m.candidates?.length ? `<p>Debated landfall: ${m.candidates.map((c) => text(c.name)).join(' · ')}.</p>` : ''}
      <p class="references"><a href="#${id}-${text(source.id)}">${m.isQuote ? 'Quoted from' : 'In our words, after'} ${text(source.author)}</a>
      · <a href="/?voyage=${id}&amp;day=${m.day}&amp;paused=1">Open this day on the globe</a></p></li>`;
  }).join('');
  return `<article aria-labelledby="${id}"><p class="byline">${text(v.explorer)} · ${v.years.join('–')}</p>
    <h2 tabindex="-1" id="${id}">${text(v.title)}</h2>
    <p>${v.status === 'draft' ? '<strong>Draft route.</strong> ' : ''}${text(v.sourceNote)}</p>
    <p>Dates as recorded in the ${v.calendar === 'julian' ? 'Julian' : 'Gregorian'} calendar.</p>
    <ol class="entries">${entries}</ol><h3>Sources</h3><ul>${sources}</ul>
    <a href="#contents">Back to expeditions</a></article>`;
}

export function journals(): Plugin {
  let root: string;
  return {
    name: 'static-expedition-journals',
    configResolved(config) { root = join(config.publicDir, 'baked'); },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path !== '/journals.html') return;
        const read = <T,>(...parts: string[]): T => JSON.parse(readFileSync(join(root, ...parts), 'utf8'));
        const cards = read<VoyageCard[]>('index.json').filter((c) => c.status !== 'placeholder');
        const nav = cards.map((c) => `<li><a href="#${text(c.id)}">${text(c.explorer)}</a></li>`).join('');
        return html.replace('<!-- JOURNALS -->', () => `<nav aria-labelledby="contents"><h2 id="contents" tabindex="-1">Expeditions</h2><ol>${nav}</ol></nav>
          ${cards.map((c) => article(read<Voyage>(c.id, 'voyage.json'), read<BakedRoute>(c.id, 'route.json'))).join('')}`);
      },
    },
  };
}

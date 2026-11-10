// End-to-end checks in headless Chrome with software WebGL (SwiftShader).
//
//   node scripts/e2e.mjs [base-url]      default http://localhost:5173
//
// Drives the real flows: landing, a voyage's intro, playback, land ho and
// tap to continue, dragging away and "Back to the voyage", scrubbing,
// the ending and poster, world mode, the mute setting surviving a reload,
// every voyage loading cleanly, and the phone layout. Exits non-zero on any
// failure.

import { spawn } from 'node:child_process';
import { decode } from 'fast-png';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

async function browser() {
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      '--no-first-run',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=/tmp/terra-e2e-${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  const page = {
    errors,
    async size(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    },
    async go(path, settle = 6000) {
      errors.length = 0;
      await send('Page.navigate', { url: BASE + path });
      await sleep(settle);
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
      return r.result?.result?.value;
    },
    async until(expr, ms = 20000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.eval(expr).catch(() => false)) return true;
        await sleep(250);
      }
      return false;
    },
    async click(selector) {
      const box = await page.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if (!box) return false;
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      return true;
    },
    async drag(x0, y0, x1, y1) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 10, y: y0 + ((y1 - y0) * i) / 10, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    },
    async key(key, code = key) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: key === ' ' ? 32 : key === 'ArrowRight' ? 39 : 0 });
    },
    async pixels() {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const png = decode(Buffer.from(shot.result.data, 'base64'));
      const d = png.data;
      const ch = png.channels;
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += ch * 37) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += l;
        sq += l * l;
        n++;
      }
      const mean = sum / n;
      return { mean, sd: Math.sqrt(sq / n - mean * mean) };
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
  return page;
}

const stage = (expr) => `(()=>{const s=__terra.stage; return ${expr}})()`;

async function main() {
  const p = await browser();
  try {
    // Landing
    await p.size(1440, 900);
    await p.go('/', 8000);
    check('landing shows the title', await p.eval(`document.querySelector('.title')?.textContent === 'Terra Incognita'`));
    const cards = await p.eval(`document.querySelectorAll('.card').length`);
    check('landing lists five voyages and world mode', cards === 6, `${cards} cards`);
    check('every voyage is labelled as draft data', (await p.eval(`document.querySelectorAll('.stamp').length`)) === 5);
    check('each card says what its source is (rule 5)', await p.eval(`/las Casas/i.test(document.querySelector('.card-source')?.textContent)`));
    check('the landing says whose unknown it is', await p.eval(`/home to people who knew it well/.test(document.querySelector('.whose')?.textContent)`));
    check('landing globe shows only the home patch', await p.eval(stage(`s.homeAmount === 1 && s.scene === null`)));
    const px = await p.pixels();
    check('the globe actually renders', px.sd > 20, `luminance sd ${px.sd.toFixed(1)}`);
    check('no horizontal page scroll', await p.eval(`document.documentElement.scrollWidth <= innerWidth`));
    await p.click('.about-link');
    check('about panel opens', await p.until(`document.querySelector('dialog.about')?.open`, 3000));
    check('about panel says the reveal is a model', await p.eval(`/estimate of what the expedition could have seen/.test(document.querySelector('dialog.about').textContent)`));
    await p.click('dialog.about .btn');
    check('about panel closes', await p.until(`!document.querySelector('dialog.about').open`, 3000));

    // A voyage: intro, ghost map, set sail.
    await p.click('.card');
    check('picking a card opens the intro', await p.until(stage(`s.screen === 'intro'`), 20000));
    check('the ghost map draws in', await p.until(stage(`s.ghostDraw > 0.5`), 15000));
    check('the ghost map is labelled', await p.eval(`[...document.querySelectorAll('.ghost-label')].some(e => e.textContent === 'Cipangu')`));
    await p.click('.intro .btn');
    check('Set sail starts playback', await p.until(stage(`s.screen === 'voyage' && s.clock.playing`), 5000));
    const d0 = await p.eval(stage(`s.clock.day`));
    await sleep(3000);
    const d1 = await p.eval(stage(`s.clock.day`));
    check('the day counter advances', d1 > d0, `${d0.toFixed(2)} -> ${d1.toFixed(2)}`);
    check('the HUD shows the date as recorded, with the Julian note', await p.eval(`/August 1492/.test(document.querySelector('.hud-date').textContent) && /Julian/.test(document.querySelector('.hud-day').textContent)`));

    // Drag away, come back.
    await p.drag(700, 450, 900, 520);
    check('dragging the globe leaves the follow camera', await p.until(stage(`!s.orbit.follow`), 3000));
    check('"Back to the voyage" appears', await p.until(`!!document.querySelector('.back')`, 3000));
    await p.click('.back');
    check('"Back to the voyage" returns the camera', await p.until(stage(`s.orbit.follow`), 3000));

    // Scrub: forward reveals, backward re-fogs, at once.
    await p.eval(stage(`(s.seek(120), 1)`));
    check('scrubbing forward jumps the voyage', await p.eval(stage(`Math.abs(s.clock.day - 120) < 1`)));
    check('scrubbing fills in the journal', (await p.eval(`document.querySelectorAll('.entry').length`)) >= 8);
    await p.eval(stage(`(s.seek(10), 1)`));
    check('scrubbing back re-fogs and trims the journal', (await p.eval(`document.querySelectorAll('.entry').length`)) <= 2);
    await p.eval(`document.querySelector('.track').focus()`);
    const before = await p.eval(stage(`s.clock.day`));
    await p.key('ArrowRight');
    check('the timeline works from the keyboard', (await p.eval(stage(`s.clock.day`))) > before);

    // Hardship brings brief weather.
    await p.eval(stage(`(s.seek(52.6), s.play(), 1)`));
    check('a hardship moment brings rain and a darker sky', await p.until(`!!document.querySelector('.weather.is-on')`, 8000));

    // Land ho: time eases to a stop at the landfall, and a tap carries on.
    await p.eval(stage(`(s.seek(68.5), s.play(), 1)`));
    check('landfall slows time to a hold', await p.until(stage(`s.clock.holding`), 25000));
    check('the landfall note is in the margin', await p.eval(`/Land, two leagues off/.test(document.querySelector('.journal').textContent)`));
    check('a candidate ring note shows the debate', await p.eval(`/Samana Cay/.test(document.querySelector('.journal').textContent)`));
    await p.click('.continue');
    check('tap to continue resumes', await p.until(stage(`!s.clock.holding`), 3000));

    // Mute is remembered.
    const wasMuted = await p.eval(`document.querySelector('[aria-pressed]').getAttribute('aria-pressed')`);
    await p.click('[aria-pressed]');
    await p.go('/?voyage=columbus-1492', 9000);
    check('mute is remembered per browser', (await p.eval(`document.querySelector('[aria-pressed]').getAttribute('aria-pressed')`)) !== wasMuted);
    await p.click('[aria-pressed]');

    // Ending: pull back, satellite crossfade, cartouche, poster.
    await p.go('/?voyage=columbus-1492&day=223', 4000);
    check('the voyage ends', await p.until(stage(`s.screen === 'ending'`), 40000));
    check('the charted map crossfades to satellite imagery', await p.until(stage(`s.satellite > 0.99`), 15000));
    check('the ending card shows days and distance', await p.until(`/15,507 km/.test(document.querySelector('.cartouche')?.textContent ?? '')`, 5000));
    const phone = await p.eval(`__terra.drawPoster('phone').then(c => [c.width, c.height])`);
    check('a phone poster can be drawn', phone?.[0] === 1170 && phone?.[1] === 2532, JSON.stringify(phone));
    const print = await p.eval(`__terra.drawPoster('print').then(c => [c.width, c.height])`);
    check('a print poster can be drawn', print?.[0] === 3600 && print?.[1] === 4800, JSON.stringify(print));
    check('no errors during the Columbus voyage', p.errors.length === 0, p.errors.slice(0, 2).join(' | '));

    // Every voyage loads.
    const index = await (await fetch(`${BASE}/baked/index.json`)).json();
    for (const v of index) {
      await p.go(`/?voyage=${v.id}&day=${Math.floor(v.days / 2)}&paused=1`, 4000);
      const ok = await p.until(stage(`s.screen === 'voyage' && s.scene?.id === ${JSON.stringify(v.id)}`), 30000);
      check(`${v.id} loads and plays`, ok && p.errors.length === 0, p.errors.slice(0, 2).join(' | '));
    }

    // World mode.
    await p.go('/?voyage=world', 4000);
    check('world mode loads', await p.until(stage(`s.screen === 'world'`), 30000));
    const y0 = await p.eval(`+document.querySelector('.hud-year')?.textContent`);
    await sleep(4000);
    const y1 = await p.eval(`+document.querySelector('.hud-year')?.textContent`);
    check('the year counter climbs from around 1000', y0 >= 1000 && y1 > y0, `${y0} -> ${y1}`);

    // Phone.
    await p.size(390, 844);
    await p.go('/', 7000);
    check('phone: no horizontal scroll on the landing', await p.eval(`document.documentElement.scrollWidth <= innerWidth`));
    check('phone: cards are reachable', (await p.eval(`document.querySelector('.card').getBoundingClientRect().bottom`)) <= 844);
    await p.go('/?voyage=lewis-clark-1804&day=455&paused=1', 12000);
    check('phone: journal is a bottom sheet', await p.eval(`getComputedStyle(document.querySelector('.journal-handle')).display !== 'none'`));
    const tl = await p.eval(`(()=>{const r=document.querySelector('.timeline').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth})()`);
    check('phone: the timeline fits', tl);
    check('phone: no horizontal scroll in a voyage', await p.eval(`document.documentElement.scrollWidth <= innerWidth`));
  } finally {
    p.close();
  }

  // A page that is not there. Local dev and preview servers fall back to the app, so only check a deployment.
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    const res = await fetch(`${BASE}/no-such-page`);
    const html = await res.text();
    check('unknown paths get the 404 page', res.status === 404 && /off the edge of the chart/.test(html), `HTTP ${res.status}`);
  }

  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

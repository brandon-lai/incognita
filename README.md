# Terra Incognita

**Pick a famous expedition and ride along on a 3D globe that starts covered in fog. The fog lifts only where the expedition could actually see, so the map you end with is the map they earned.**

- Live: https://terra-incognita-map.vercel.app
- Built from the "Uncharted" PRD (9 November 2026).

Five voyages ship, each chosen for a different kind of reveal:

| Voyage | What the reveal does |
| --- | --- |
| Columbus, first voyage (1492–93) | Weeks of empty ocean, then landfall. A ghost map of Asia and Cipangu dissolves as the Caribbean appears. |
| Magellan and Elcano (1519–22) | A band of revealed ocean around the whole planet. |
| Cook, first voyage (1768–71) | New Zealand and eastern Australia charted coast by coast. Terra Australis Incognita fades as Cook proves it isn't there. |
| Lewis and Clark (1804–06) | Terrain viewsheds: valleys open from ridges, and the view west from Lemhi Pass opens all at once. |
| Amundsen (1911–12) | A thin trail across white ice to the Pole, and a mountain range nobody had mapped. |

World mode plays all five on one clock, from about the year 1000 to 1912.

> **The voyage data is a draft.** It was compiled from the cited public-domain sources, but no historian has reviewed it yet. The PRD's first accuracy rule says real routes must be reviewed by a person before launch, so every voyage carries `"status": "draft"`. The app labels each one "Draft route" on its card, in the voyage header and in the about panel. See the [launch checklist](#launch-checklist).

## How it works

Everything heavy happens offline in a bake step. The site is static and only plays back what the bake produced.

```
data/voyages/*.json ─┐
Natural Earth ───────┤   scripts/bake   ┌─ public/baked/<id>/firstseen-{8192,4096}.png   16-bit, day * 16 per pixel
Terrarium terrain ───┼──────────────────┼─ public/baked/<id>/route.json                  path, moments, ghost map, pacing
NASA Blue Marble ────┘   (Node, ~75 s)  ├─ public/baked/<id>/detail-{8192,4096}.jpg      sharper regional imagery
                                        └─ public/baked/world/…                          shared coastlines, land mask, world mode
```

**The first-seen texture.** Each pixel stores the tick (day × 16) on which the expedition first saw that spot:
- 0 inside the known world;
- 65535 if it was never seen.

The globe's fragment shader reveals a pixel once `firstSeenDay <= currentDay`, so scrubbing backward re-fogs for free. The texture is a lossless 16-bit grayscale PNG. That's the PRD's "two 8-bit channels", packed as PNG's native 16-bit depth, and it's sampled with `texelFetch` from an `R16UI` texture, so it's never filtered. Sixteen ticks a day let a single day's reveal sweep smoothly instead of popping.

**How far they could see** (`scripts/bake/sight.ts`). These are starting values tuned for feel, not historical claims, and the about panel says so.
- **Sea:** the horizon from a 25 m masthead (3.57·√h km, about 18 km), plus land high enough to show above it: 3.57·(√25 + √elevation).
- **Land and river:** a radial viewshed over terrain from a 2 m eye, allowing for the earth's curve and refraction, out to 90 km. The PRD said to start at 60 km and tune; 60 km made the view from Lemhi Pass too small to read. The traveller stands on the highest ground within 600 m of camp, which is what makes a pass open a whole valley.
- **Ice:** the same viewshed with a 3 m eye, capped at 60 km, with a steady 8 km circle that's always seen.

**Fog look** (`app/shaders/globe.frag`). The fog is drawn in the globe's fragment shader:
- Aged parchment with mist drifting over it, and a faint inked graticule so the fogged globe still reads as a globe.
- Edges are sampled through animated domain-warped noise, so they curl. Each newly seen spot burns in over 0.7 s of wall-clock time, with an ember rim, whatever the playback speed.
- **Ink, then colour:** for about three seconds, new land is a pale parchment drawing and new coast is inked with water-lines. Then colour washes in. The shader works out "seconds since reveal" from a short history of the clock that the CPU passes in, so the effect holds at 8× speed and during slow motion.
- The known world's hand-drawn polygons are sampled through a much larger warp, so their straight edges read as the ragged edge of charted land.

**Ink lines.** Coastlines and major rivers (Natural Earth), the route, and the ghost map are screen-space ribbons:
- Coast vertices are tagged in a worker with the day they were first seen, so each segment draws itself like a pen stroke as the reveal reaches it.
- The route is solid where both ends are documented positions and dashed otherwise. A legend explains this.
- Each ghost-map vertex fades once the voyage sees anything within 250 km of it.

**Playback** (`app/engine/clock.ts`).
- One clock drives the globe, the camera, the overlay and the sound. The default is 1 day per 0.5 s, and the speed control runs from 0.25× to 8×.
- Empty stretches speed up by up to 10× on long voyages, with the day counter racing. The slowdown starts a few days before land comes into view.
- `slowMotion` moments ease time to a near-stop and hold for 7 s, or until a tap. The camera eases in and the journal note appears.

**Camera.** The camera follows with a gentle lag and comes in closer where land is appearing, pulling back across open ocean. Drag to leave; "Back to the voyage" returns.

**Sound** (`app/audio/sound.ts`) is synthesised with Web Audio, so there are no recordings to license:
- ambient beds per terrain;
- a sparse theme per voyage that swells at landfalls;
- a pen scratch as coastlines are inked;
- wind and waves only during a land ho.

It's silent until the first click, and mute is remembered per browser.

**Poster** (`app/poster/poster.ts`). This renders the live scene offscreen, framed on the route, and lays it out on parchment with the title, dates, days and distance. It comes in two sizes: 1170 × 2532 for a phone, 3600 × 4800 (12 × 16 in at 300 dpi) for print.

### Layout

```
app/              React app and globe
app/shaders/      globe and line GLSL
app/engine/       clock, camera, route lookup, the stage that ties them together
data/voyages/     voyage JSON (the PRD's format, plus a few marked additions)
scripts/bake/     the bake pipeline
public/baked/     generated textures and route JSON (committed, so deploys don't need the bake)
```

## Develop

```sh
pnpm install
pnpm fetch-data        # downloads Natural Earth, NASA imagery and terrain tiles into .cache/ (about 200 MB)
pnpm bake:world        # imagery, land mask, coast texture, coastlines (about 15 s)
pnpm bake              # every voyage and world mode (about 75 s); or: pnpm bake columbus-1492
pnpm dev
pnpm test              # unit tests: dates, geometry, clock, routes, raster, data validation, 16-bit round trips
pnpm e2e http://localhost:5173   # headless Chrome with software WebGL: the real flows, phone layout included
```

The bake validates every voyage first and refuses to run on bad data:
- dates out of order;
- unknown sources;
- documented points with no source;
- quotes from non-public-domain sources or too long.

It also warns when a sea leg crosses land. The only warnings left are in the Strait of Magellan, whose channels are narrower than a 5 km pixel.

**To mark a voyage reviewed:** check every point, moment and quote against its sources, set `"status": "reviewed"`, and re-bake. The "Draft route" labels then disappear.

`?debug` on the landing page also lists placeholder voyages. `?q=low` or `?q=high` forces 4096 or 8192 textures. `?voyage=<id>&day=<n>&paused` opens straight into a moment.

## Decisions

- **Name: Terra Incognita.** The PRD asked whether "Uncharted" was the one. It's also a major Sony video game franchise, so it collides on trademark and search. *Terra incognita* is what period mapmakers wrote on the blank parts, which is exactly what the fog is. It also sets up the site's own correction: the land was unknown only to the mapmaker. The Vercel URL is `terra-incognita-map` because the shorter names were taken.
- **Stack as the PRD specified:** Vite, React, TypeScript, three.js through react-three-fiber, one custom shader material for the globe, and a static deploy on Vercel.
- **Terrain from Terrarium tiles, not raw GeoTIFFs.** These are the AWS Open Data tiles compiled from SRTM, GMTED2010 and ETOPO1. They give the same elevation without a GDAL dependency or gigabytes of downloads:
  - a coarse global grid for the sea model's distant land;
  - zoom 8 (about 430 m) for the Lewis and Clark region;
  - zoom 7 for the Ross Ice Shelf.

  South of the tiles' 85.05° limit the polar plateau is treated as flat.
- **Imagery from NASA GIBS.** NASA Visible Earth's direct Blue Marble downloads timed out during the build. GIBS serves the same public-domain Blue Marble (shaded relief and bathymetry), fetched as tiles.
- **Sharper regional imagery.** The 8K globe is about 5 km a pixel, which blurs at land-ho zoom. Each voyage except Amundsen's gets one roughly 600 m crop where it spends the most time close in: the Caribbean, the American West, New Zealand, and the Strait of Magellan. Antarctica is uniformly white, so a crop adds nothing there.
- **Textures by device.** Desktops with WebGL support for 8192 textures get 8192. Phones and anything else get 4096.
- **Known worlds** are written as positive polygons plus `"unknown": true` carve-outs. "Everything except the American West in 1804" is far easier to draw and review than the reverse.
- **Additions to the voyage format, all marked in `app/data/types.ts`:**
  - `status`, `sourceNote` (rule 5) and `home`;
  - `party` on legs, for Lewis and Clark's 1806 split;
  - `place` on waypoints, for the reviewer;
  - `candidates` on moments (rule 3: show disagreement), drawn as dashed rings;
  - `unknown` on known-world features.
- **The landing screen** shows only a small patch around the focused voyage's home, as the PRD's first wow moment describes. When the voyage opens, its known world burns in outward from home.
- **Where the sun goes.** The sun's declination follows the voyage's date (so Amundsen has polar day). Its longitude stays in the early afternoon wherever the ship is. A sun that tracked the hour would spin the terminator twice a second at 1×.

## The PRD's open questions, answered

- **Name.** Terra Incognita; see Decisions.
- **How should `knownWorld` be drawn?** Hand-drawn approximate polygons for v1, labelled approximate everywhere they appear:
  - each voyage's `knownWorld.note`, shown in the about panel;
  - the intro;
  - "approximate" in the about panel.

  Tracing period maps is better, and it's slower work for a person with the scans.
- **Which period maps for the ghost map?** v1 draws simplified ghosts after:
  - Martin Behaim's 1492 globe and the Toscanelli letter (Columbus);
  - Schöner's globes of 1515 and 1520 (Magellan);
  - Dalrymple's 1767 Terra Australis (Cook);
  - the single-ridge, short-portage geography Jefferson expected (Lewis and Clark).

  All are public domain and have good scans: the Behaim globe is digitised by the Germanisches Nationalmuseum, and Schöner's globes and Dalrymple's chart are in national library collections. They are drawn by hand from those references, not traced, and labelled approximate. Tracing from the scans is on the checklist.
- **Indigenous place and nation names: which source has clear permission?** None that I could confirm for this use. Native Land Digital maps present-day territories, not those at the time of the voyage, and needs permission. So v1 has no names layer. Instead the peoples are named where the journals meet them:
  - the Taíno, Lucayans and Ciguayo (Columbus);
  - the Tupi, Tehuelche, Chamorro and Cebuano (Magellan);
  - the Oto, Lakota, Mandan, Hidatsa, Shoshone, Nez Perce, Clatsop and Blackfeet (Lewis and Clark);
  - Tahitians, Māori, the Gweagal and the Guugu Yimithirr (Cook).

  Encounters are first-class moments. The landing screen and about panel say whose unknown the fog is.
- **Is 8192 × 4096 sharp enough for Lewis and Clark at close zoom?** No. The first-seen texture is fine, because the noise-warped edges hide its 5 km cells. The imagery isn't: the Lemhi valley is three pixels wide. v1 adds a regional imagery texture, about 600 m a pixel, per voyage; see Decisions. A regional first-seen texture would be the next step if edges at very close zoom matter.
- **Music: commission, license or generate?** Generate, for v1. The themes and ambience are synthesised in the browser: no rights questions, no bytes to download, and each voyage gets its own mode and motif. A commissioned score is the obvious upgrade.
- **Free camera or guided camera?** Guided by default, free at any time. The camera follows with lag and eases in at landfalls; dragging takes over, and "Back to the voyage" hands control back. Land ho always re-centres, because a first viewing shouldn't miss it.

## Measured

| | |
| --- | --- |
| Bake, placeholder-style sea route (Columbus) | 1.8 s (the PRD's bar is under a minute) |
| Bake, every voyage plus world mode | about 75 s, 56 s of it Lewis and Clark's viewsheds |
| First visit, desktop (8K) | about 7.5 MB: imagery 3.4, coast texture and lines 3.0, voyage up to 1.6, JS 0.35 gzipped |
| First visit, phone (4K) | about 3.5 MB |
| Each further voyage | 0.15–3 MB (Lewis and Clark's regional imagery is the largest) |
| JavaScript, gzipped | 350 KB (three.js 193 KB in its own cacheable chunk) |

**Budget from here:** 8 MB for a desktop first visit, 4 MB on a phone, and 3 MB for each further voyage.

## Not verified

- **60 fps on a recent iPhone and laptop.** It was only measured in headless Chrome with software rendering, which is far slower than any GPU, so no number from it means anything.
- **Sound.** It was checked to load and play without errors, not listened to on speakers.
- **Real phones.** Phone layouts were checked at 390 × 844 with CSS emulation, not on a device.
- **The PRD's Columbus test:** "someone who has not seen it watches the whole voyage without touching anything and reacts at the landfall and the ending." That needs a person.

## Launch checklist

These are for Brandon, or whoever owns the content:

- [ ] **Review every voyage against its sources.** This means every waypoint's date and position, every moment, and especially the two quotes: Lewis at Lemhi Pass and Clark's "Ocian in view!". Correct anything wrong, set `"status": "reviewed"`, and run `pnpm bake`. The PRD makes this the launch gate (rule 1, and "out of scope: any voyage without reviewed, cited route data").
- [ ] Replace the `archive.org/search` source links with links to the specific edition used.
- [ ] Trace the known-world and ghost-map polygons from period map scans, or accept the hand-drawn ones.
- [ ] Choose a source with clear permission if you want a names layer for the peoples living in revealed regions.
- [ ] Watch Columbus start to finish with someone who hasn't seen it (the PRD's phase 3 test).
- [ ] Check frame rate and sound on a recent iPhone and laptop.
- [ ] Decide whether to keep the name, and whether to point a domain at the Vercel project.

## Attribution

- Imagery: NASA Blue Marble, via NASA GIBS. Public domain.
- Coastlines, land, lakes, rivers and ice shelves: Natural Earth. Public domain.
- Terrain: Terrarium tiles on AWS Open Data. See the [data sources and attributions](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- Simplex noise: Ashima Arts and Stefan Gustavson, MIT.
- Fonts: IM Fell English by Igino Marini, SIL Open Font License.

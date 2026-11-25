# Terra Incognita

## Atmosphere
A pocket atlas under a plum-colored sky. Each expedition has a miniature pixel-art postcard, and the ship, riverboat, packhorse or sled on the globe belongs to the same sprite sheet. The globe is still geographically continuous: pixelate the artwork, not the journey, text or frame rate.

## Palette and type
`app/paper.css` and `app/globe/palette.ts` share plum ink `#382e44`, apricot paper `#f4ddb0` and route berry `#933f4e`. The globe's cloud tiles are anchored to geography and fade into continuous shading at a distance. Pixelify Sans is for display type and dates, IM Fell English for names and journal prose, and system sans for explanations. All fonts and art are served locally.

## Components and layout
Postcard strips have stepped silhouettes and paper panels cast small hard shadows. Keep specimens decorative: dates, draft labels, route markers and citations do not rely on artwork or color. Use subpixel positions and elapsed-time easing for moving sprites and the camera. Reduced motion removes decorative spin, fog drift and traveling entrances without stopping deliberate voyage playback. Shadcn/Base UI supplies control behavior without Tailwind preflight; the text edition uses normal document flow and works without scripting.

// The globe: base imagery, the first-seen reveal, and the fog, in one pass
// (PRD "Fog look"). One texture and one number decide what is revealed:
// a pixel shows once firstSeenDay <= uDay.

precision highp float;
precision highp usampler2D;

#include <noise>

uniform sampler2D uImagery;
uniform sampler2D uDetail;     // sharper regional imagery for the voyage, where it has some
uniform vec4 uDetailBounds;    // west, north, east, south in degrees: v runs north to south
uniform float uHasDetail;
uniform sampler2D uCoast;      // r: land coverage, g: km from land at sea / 63.75
uniform usampler2D uSeen;      // first-seen tick, 65535 = never
uniform vec2 uSeenSize;
uniform float uHasSeen;        // 0 on the landing globe: only the home patch shows
uniform float uDay;
uniform float uTicksPerDay;
uniform float uHist[9];        // the day 0, 0.5, 1 ... 4 s ago: turns a first-seen day into seconds since reveal
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uHome;
uniform float uHomeRadius;
uniform float uHomeAmount;
uniform float uKnownAge;       // seconds since the known world began to burn in, spreading out from home
uniform float uSatellite;      // ending: the charted map crossfades to satellite imagery
uniform float uFlat;           // 1 for the poster: no night side

uniform vec3 uParchment;
uniform vec3 uParchmentDark;
uniform vec3 uParchmentLight;
uniform vec3 uInk;
uniform vec3 uChar;
uniform vec3 uEmber;
uniform vec3 uSea;
uniform vec3 uSeaDeep;
uniform vec3 uNight;

varying vec3 vPos;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewW;

const float PI = 3.14159265359;
const float NEVER = 1.0e9;

float fbm2(vec3 p) { return snoise(p) * 0.65 + snoise(p * 2.03 + 3.1) * 0.35; }
float fbm3(vec3 p) { return snoise(p) * 0.55 + snoise(p * 2.03 + 3.1) * 0.3 + snoise(p * 4.1 + 7.7) * 0.15; }

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Seconds since the voyage reached day s, from the recent history of uDay.
float ageOf(float s) {
  if (s > uHist[0]) return -1.0;
  if (s <= uHist[8]) return 99.0;
  for (int k = 1; k < 9; k++) {
    if (uHist[k] <= s) {
      float span = max(uHist[k - 1] - uHist[k], 1e-5);
      return 0.5 * (float(k - 1) + (uHist[k - 1] - s) / span);
    }
  }
  return 99.0;
}

float seenAt(ivec2 t) {
  ivec2 size = ivec2(uSeenSize);
  t.x = (t.x % size.x + size.x) % size.x;
  t.y = clamp(t.y, 0, size.y - 1);
  uint v = texelFetch(uSeen, t, 0).r;
  return v == 65535u ? NEVER : float(v) / uTicksPerDay;
}

vec2 texelOf(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  return vec2((lon / (2.0 * PI) + 0.5) * uSeenSize.x - 0.5, (0.5 - lat / PI) * uSeenSize.y - 0.5);
}

void main() {
  vec3 dir = normalize(vPos);
  // Screen footprint in radians, to drop noise octaves smaller than a pixel.
  float foot = max(length(fwidth(dir)), 1e-6);
  float texel = PI / (uHasSeen > 0.5 ? uSeenSize.y : 4096.0);
  float fine = 1.0 - smoothstep(texel * 0.4, texel * 1.6, foot);

  // Domain warp: the fog edge curls and drifts instead of tracing texels.
  vec3 q = dir * 150.0;
  vec3 warp = vec3(snoise(q + uTime * 0.06), snoise(q + 17.1 - uTime * 0.05), snoise(q + 31.7 + uTime * 0.04));
  warp += 0.5 * fine * vec3(snoise(q * 2.7 + 5.0), snoise(q * 2.7 + 9.0), snoise(q * 2.7 + 13.0));
  vec3 wdir = normalize(dir + warp * texel * 2.4);

  float mask;
  float age;
  if (uHasSeen > 0.5) {
    vec2 tc = texelOf(wdir);
    ivec2 b = ivec2(floor(tc));
    vec2 f = fract(tc);
    float s00 = seenAt(b);
    float s10 = seenAt(b + ivec2(1, 0));
    float s01 = seenAt(b + ivec2(0, 1));
    float s11 = seenAt(b + ivec2(1, 1));
    // Voyage reveals: each texel burns in over 0.7 s of wall time, whatever the playback speed.
    float a00 = s00 == 0.0 ? -1.0 : ageOf(s00);
    float a10 = s10 == 0.0 ? -1.0 : ageOf(s10);
    float a01 = s01 == 0.0 ? -1.0 : ageOf(s01);
    float a11 = s11 == 0.0 ? -1.0 : ageOf(s11);
    vec4 r = smoothstep(0.0, 0.7, vec4(a00, a10, a01, a11));
    mask = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);
    age = f.x < 0.5 ? (f.y < 0.5 ? a00 : a01) : (f.y < 0.5 ? a10 : a11);

    // The known world: hand-drawn polygons with long straight edges, so its border
    // is sampled through a much larger warp to read as a ragged edge of charted land.
    vec3 kq = dir * 9.0 + uTime * 0.01;
    vec3 kdir = normalize(dir + vec3(snoise(kq), snoise(kq + 4.1), snoise(kq + 8.3)) * 0.035 + warp * texel * 2.4);
    vec2 kc = texelOf(kdir);
    ivec2 kb = ivec2(floor(kc));
    vec2 kf = fract(kc);
    vec4 k0 = vec4(seenAt(kb) == 0.0, seenAt(kb + ivec2(1, 0)) == 0.0, seenAt(kb + ivec2(0, 1)) == 0.0, seenAt(kb + ivec2(1, 1)) == 0.0);
    float inKnown = mix(mix(k0.x, k0.y, kf.x), mix(k0.z, k0.w, kf.x), kf.y);
    // It burns in once, outward from home, when the voyage opens.
    float kAge = uKnownAge - acos(clamp(dot(dir, uHome), -1.0, 1.0)) * 1.4;
    float kMask = inKnown * smoothstep(0.0, 0.9, kAge);
    if (kMask > mask) {
      mask = kMask;
      age = kAge;
    }
  } else {
    float ang = acos(clamp(dot(wdir, uHome), -1.0, 1.0));
    mask = (1.0 - smoothstep(uHomeRadius * 0.55, uHomeRadius, ang)) * uHomeAmount;
    age = 99.0;
  }

  float edgeNoise = snoise(dir * 70.0 + vec3(0.0, uTime * 0.03, 0.0)) * 0.6 + snoise(dir * 190.0 - uTime * 0.05) * 0.4 * fine;
  float reveal = smoothstep(0.38, 0.62, mask + edgeNoise * 0.2);
  float rim = smoothstep(0.02, 0.4, mask + edgeNoise * 0.2) * (1.0 - reveal);

  // Fog: aged parchment with mist drifting over it, and a faint inked graticule so it still reads as a globe.
  vec3 drift = vec3(uTime * 0.010, uTime * -0.003, uTime * 0.007);
  float stain = fbm2(dir * 1.7 + 11.0);
  vec3 fog = mix(uParchment, uParchmentDark, clamp(0.32 + stain * 0.32, 0.0, 1.0));
  vec3 mp = dir * 2.3 + drift;
  vec3 mw = mp + 0.5 * vec3(fbm2(mp + 1.7), fbm2(mp + 9.2), fbm2(mp + 4.4)) + drift * 2.0;
  float mist = fbm3(mw * 1.3);
  fog = mix(fog, uParchmentLight, smoothstep(-0.3, 0.8, mist) * 0.38);
  fog = mix(fog, uParchmentDark, smoothstep(0.0, -0.7, mist) * 0.12);
  float fiber = (snoise(dir * 700.0) * 0.6 + snoise(dir * 1900.0) * 0.4) * fine;
  fog *= 1.0 + fiber * 0.012;

  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(-dir.z, dir.x);
  vec2 g = vec2(lon, lat) / (PI / 12.0);
  vec2 gw = max(fwidth(g), vec2(1e-4));
  vec2 gd = abs(fract(g - 0.5) - 0.5) / gw;
  float meridian = (1.0 - min(gd.x, 1.0)) * (1.0 - smoothstep(1.2, 1.4, abs(lat))) * (1.0 - smoothstep(0.08, 0.3, gw.x));
  float parallel = (1.0 - min(gd.y, 1.0)) * (1.0 - smoothstep(0.08, 0.3, gw.y));
  float tropic = 0.0;
  for (int k = -1; k <= 1; k++) {
    float t = abs(lat - float(k) * 0.40928) / max(fwidth(lat), 1e-5);
    tropic = max(tropic, (1.0 - min(t, 1.0)) * (k == 0 ? 1.0 : 0.6));
  }
  float grat = max(max(meridian, parallel) * 0.5, tropic * 0.75);

  // Charted: natural colour on land, a muted sea, water-lines along the coast.
  vec3 img = texture2D(uImagery, vUv).rgb;
  if (uHasDetail > 0.5) {
    vec2 ll = vec2(lon, lat) * (180.0 / PI);
    vec2 duv = (ll - uDetailBounds.xy) / (uDetailBounds.zw - uDetailBounds.xy);
    vec2 inside = smoothstep(vec2(0.0), vec2(0.01), duv) * smoothstep(vec2(0.0), vec2(0.01), 1.0 - duv);
    float k = inside.x * inside.y;
    if (k > 0.0) img = mix(img, texture2D(uDetail, duv).rgb, k);
  }
  vec2 cs = texture2D(uCoast, vec2(vUv.x, 1.0 - vUv.y)).rg; // data rows run north to south
  float land = smoothstep(0.3, 0.7, cs.r);
  float seaKm = cs.g * 63.75;
  float kmPx = max(fwidth(seaKm), 1e-3);
  float lines = 0.0;
  for (int k = 1; k <= 4; k++) {
    float d = 4.0 * float(k) + 1.2 * float(k * k);
    float w = max(kmPx * 0.9, 0.35);
    lines += (1.0 - smoothstep(0.0, w, abs(seaKm - d))) * (1.0 - float(k) * 0.2);
  }
  lines *= (1.0 - smoothstep(1.2, 3.0, kmPx)) * (1.0 - land);
  float depth = smoothstep(0.004, 0.06, lum(img));
  vec3 sea = mix(uSeaDeep, uSea, depth);
  vec3 charted = mix(sea, img * vec3(1.04, 1.0, 0.95), land);
  charted = mix(charted, uSeaDeep * 0.55, lines * 0.55);

  // Ink, then colour: newly seen land is a pale parchment drawing for about three seconds.
  vec3 sketchLand = mix(uParchmentLight, uInk, (1.0 - smoothstep(0.03, 0.35, lum(img))) * 0.35 + 0.05);
  vec3 sketchSea = mix(uParchmentLight, uSea, 0.22);
  vec3 sketch = mix(sketchSea, sketchLand, land);
  sketch = mix(sketch, uInk, lines * 0.7);
  float wash = smoothstep(1.8, 3.6, age + snoise(dir * 14.0 + 7.0) * 0.5);
  vec3 known = mix(sketch, charted, wash);
  known = mix(known, img, uSatellite);

  vec3 col = mix(fog, known, reveal);
  col = mix(col, uInk, grat * mix(0.16, 0.07, reveal) * (1.0 - uSatellite));
  col = mix(col, uChar, rim * 0.6);
  float fresh = 1.0 - smoothstep(0.0, 1.4, age);
  float edge = 1.0 - abs(reveal * 2.0 - 1.0);
  col += uEmber * edge * fresh * 1.3;

  // Light: the sun follows the voyage's date. Night is dim, never black.
  float ndl = dot(normalize(vNormalW), uSunDir);
  float dayAmt = mix(smoothstep(-0.12, 0.22, ndl), 1.0, uFlat);
  vec3 lit = col * (0.82 + 0.18 * max(ndl, 0.0));
  col = mix(col * uNight, lit, dayAmt);
  float fres = pow(1.0 - max(dot(normalize(vNormalW), vViewW), 0.0), 3.0);
  col += uParchmentLight * fres * 0.18 * (0.3 + 0.7 * dayAmt);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}

// Euclidean distance transform (Felzenszwalb & Huttenlocher), separable, with
// a horizontal spacing per row so an equirectangular grid measures in km.

const INF = 1e20;

/** 1-D squared distance transform of f at positions i * spacing. */
function dt1(f: Float64Array, n: number, spacing: number, out: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  const s2 = spacing * spacing;
  // Positions are in cells; f is in km², so differences are divided by spacing².
  const s = (q: number, p: number) => (f[q] - f[p] + (q * q - p * p) * s2) / (2 * s2 * (q - p));
  for (let q = 1; q < n; q++) {
    let x = s(q, v[k]);
    while (x <= z[k]) {
      k--;
      x = s(q, v[k]);
    }
    k++;
    v[k] = q;
    z[k] = x;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = (q - v[k]) * spacing;
    out[q] = d * d + f[v[k]];
  }
}

/**
 * Distance in km from every cell to the nearest cell where `inside` is true.
 * Rows are latitudes; columns wrap around the antimeridian (handled by
 * padding each row with a copy of the other side).
 */
export function distanceKm(inside: (i: number) => boolean, W: number, H: number, kmPerRow: number): Float32Array {
  const g = new Float64Array(W * H);
  const n = Math.max(W, H);
  const f = new Float64Array(n * 2);
  const out = new Float64Array(n * 2);
  const v = new Int32Array(n * 2);
  const z = new Float64Array(n * 2 + 1);
  // Columns: vertical distance in rows.
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = inside(y * W + x) ? 0 : INF;
    dt1(f, H, kmPerRow, out, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = out[y];
  }
  // Rows: horizontal spacing shrinks with cos(latitude). Pad by half a row each side to wrap.
  const pad = W >> 1;
  const res = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const kmPerCol = Math.max(0.05, kmPerRow * Math.cos((lat * Math.PI) / 180) * (H * 2 / W));
    const len = W + 2 * pad;
    for (let i = 0; i < len; i++) f[i] = g[y * W + ((((i - pad) % W) + W) % W)];
    dt1(f, len, kmPerCol, out, v, z);
    for (let x = 0; x < W; x++) res[y * W + x] = Math.sqrt(out[x + pad]);
  }
  return res;
}

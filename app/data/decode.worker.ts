// Decodes the lossless PNGs off the main thread (an 8192 x 4096 16-bit
// first-seen texture is 64 MB once unpacked) and builds the coastline ribbon
// for a voyage: only segments the voyage reveals, each vertex tagged with the
// day it was first seen.

import { decode } from 'fast-png';
import { NEVER_SEEN } from './types';
import { buildCoastRibbon } from './ribbon';

let coastlines: Promise<Float32Array> | null = null;

async function getBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

export type DecodeRequest =
  | { id: number; kind: 'coast'; url: string }
  | { id: number; kind: 'seen'; url: string; coastUrl: string; ticksPerDay: number };

self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'coast') {
      const png = decode(await getBytes(req.url));
      const data = png.data as Uint8Array;
      (self as unknown as Worker).postMessage({ id: req.id, width: png.width, height: png.height, data }, [data.buffer]);
      return;
    }
    coastlines ??= getBytes(req.coastUrl).then((b) => new Float32Array(b));
    const [buf, lines] = await Promise.all([getBytes(req.url), coastlines]);
    const png = decode(buf);
    const seen = png.data as Uint16Array;
    const ribbon = buildCoastRibbon(lines, seen, png.width, png.height, req.ticksPerDay, NEVER_SEEN);
    const transfer: ArrayBuffer[] = [seen.buffer as ArrayBuffer, ...Object.values(ribbon).map((a) => a.buffer as ArrayBuffer)];
    (self as unknown as Worker).postMessage({ id: req.id, width: png.width, height: png.height, data: seen, ribbon }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: String(err) });
  }
};

/**
 * Raw patch reader for the current-patch dump (64 13 → 64 12 01 …).
 * Ported from thammer/zoom-explorer src/ZoomPatch.ts readPTCF() and
 * src/ZoomDevice.ts sysexToPatchData() (MIT, commit aee0143).
 * PRM2 follows the MS Plus layout: tempo verified on a G2X FOUR, volume not.
 */
import { isZoomSysex, unpack7to8, unpackedLength, zoomBody } from './zoom';

const EDTB_ENTRY = 24;
const PARAM_WIDTHS = [12, 12, 12, 12, 12, 8, 8, 8, 12, 8, 8, 8, 12, 8, 8, 8, 1, 1, 1];
const CRC_BYTES = 5;

export interface PatchEffect {
  slot: number;
  on: boolean;
  id: number;
  /** Raw parameter values, index 0 = first knob. Map through the catalog for display. */
  params: number[];
}

export interface RawPatch {
  shortName: string;
  name: string | null;
  version: number;
  target: number;
  effects: PatchEffect[];
  /** PRM2 (MS Plus layout): tempo verified on a G2X FOUR 2026-10-15 (wrote 123, read 123); volume not verified. */
  tempo: number | null;
  volume: number | null;
  chunks: string[];
}

const le32 = (b: number[], o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const ascii = (b: number[]) => String.fromCharCode(...b).replace(/\0+$/, '').replace(/\0/g, ' ');

/** Little-endian bit field: bit 0 is the LSB of byte 0. */
export function readBits(bytes: number[], start: number, width: number): number {
  let v = 0;
  for (let i = 0; i < width; i++) {
    const bit = start + i;
    if (((bytes[bit >> 3] ?? 0) >> (bit & 7)) & 1) v += 2 ** i;
  }
  return v;
}

/** 7-bit SysEx → 8-bit patch bytes. Strips the 5-byte CRC when the lengths say it is there. */
export function patchBytesFromSysex(msg: ArrayLike<number>): number[] | null {
  if (!isZoomSysex(msg)) return null;
  const b = zoomBody(msg);
  if (b[0] !== 0x64 || b[1] !== 0x12 || b.length < 6) return null;
  const declared = b[3] | (b[4] << 7);
  let seven = b.slice(5);
  if (unpackedLength(seven.length - CRC_BYTES) === declared) seven = seven.slice(0, -CRC_BYTES);
  return unpack7to8(seven).slice(0, declared);
}

export function parsePTCF(d: number[]): RawPatch | null {
  if (ascii(d.slice(0, 4)) !== 'PTCF') return null;
  const length = le32(d, 4);
  const version = le32(d, 8);
  const numEffects = le32(d, 12);
  const target = le32(d, 16);
  const shortName = ascii(d.slice(26, 36)).trimEnd();
  if (numEffects > 16 || length > d.length) return null;
  const ids: number[] = [];
  let o = 36;
  for (let i = 0; i < numEffects; i++, o += 4) ids.push(le32(d, o));

  const chunks = new Map<string, number[]>();
  while (o + 8 <= length) {
    const id = ascii(d.slice(o, o + 4));
    const len = le32(d, o + 4);
    o += 8;
    if (len > length - o) break;
    chunks.set(id, d.slice(o, o + len));
    o += len;
  }

  const effects: PatchEffect[] = [];
  const edtb = chunks.get('EDTB');
  for (let i = 0; edtb && i < numEffects; i++) {
    const e = edtb.slice(i * EDTB_ENTRY, (i + 1) * EDTB_ENTRY);
    let bit = 30;
    const params: number[] = [];
    for (const w of PARAM_WIDTHS) {
      if (bit + w > e.length * 8) break;
      params.push(readBits(e, bit, w));
      bit += w;
    }
    effects.push({ slot: i, on: readBits(e, 0, 1) === 1, id: readBits(e, 1, 29), params });
  }

  const p = chunks.get('PRM2');
  const nameChunk = chunks.get('NAME');
  return {
    shortName,
    name: nameChunk ? ascii(nameChunk).trimEnd() : null,
    version,
    target,
    effects,
    tempo: p && p.length > 2 ? ((p[p.length - 2] & 0xf0) >> 4) + ((p[p.length - 1] & 0x0f) << 4) : null,
    volume: p && p.length > 10 ? ((p[9] & 0xe0) >> 5) + ((p[10] & 0x0f) << 3) : null,
    chunks: [...chunks.keys()],
  };
}

export function decodeRawPatch(msg: ArrayLike<number>): RawPatch | null {
  const bytes = patchBytesFromSysex(msg);
  return bytes ? parsePTCF(bytes) : null;
}

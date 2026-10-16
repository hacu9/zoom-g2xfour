/**
 * Decoders for reply formats CONFIRMED on a real G2X FOUR (2026-10-15).
 * Fixtures: tests/fixtures/g2xfour-*.txt. Offsets are into the Zoom body
 * (the bytes after F0 52 00 <id>, without F7).
 */
import { isZoomSysex, zoomBody } from './zoom';

/** Little-endian 7-bit groups: b0 | b1<<7 | b2<<14 | ... (used for sizes). */
export function septetsLE(bytes: number[]): number {
  return bytes.reduce((acc, b, i) => acc + (b & 0x7f) * 2 ** (7 * i), 0);
}

const text = (bytes: number[]) =>
  String.fromCharCode(...bytes.slice(0, bytes.includes(0) ? bytes.indexOf(0) : bytes.length));

/** 60 29 → 60 04 29 00 00 08 00 <total 5 septets> <free 5 septets> … */
export function decodeFlashInfo(msg: ArrayLike<number>): { totalBytes: number; freeBytes: number } | null {
  if (!isZoomSysex(msg)) return null;
  const b = zoomBody(msg);
  if (b[0] !== 0x60 || b[1] !== 0x04 || b[2] !== 0x29 || b.length < 17) return null;
  return { totalBytes: septetsLE(b.slice(7, 12)), freeBytes: septetsLE(b.slice(12, 17)) };
}

/** 60 25 / 60 26 → 60 04 25 … <name 8.3, NUL-padded, at 11> <size 4 septets at 26> */
export function decodeFileEntry(msg: ArrayLike<number>): { name: string; sizeBytes: number } | null {
  if (!isZoomSysex(msg)) return null;
  const b = zoomBody(msg);
  if (b[0] !== 0x60 || b[1] !== 0x04 || b[2] !== 0x25 || b.length < 30) return null;
  const name = text(b.slice(11, 24));
  return name ? { name, sizeBytes: septetsLE(b.slice(26, 30)) } : null;
}

export interface DisplayParam {
  label: string;
  value: string;
}
export interface DisplaySlot {
  slot: number;
  on: boolean;
  effect: string;
  params: DisplayParam[];
}

const RECORD = 14;

/**
 * 64 02 00 07 00 → 64 01 + N records of 14 bytes:
 * [slot] [row] [0 = value | 1 = label] 00 <10 ASCII bytes, NUL-padded>.
 * Row 0 = On/Off, row 1 = effect name, rows 2+ = the parameters the pedal
 * screen shows. It is the screen text, not the stored values.
 */
export function decodePatchDisplay(msg: ArrayLike<number>): DisplaySlot[] | null {
  if (!isZoomSysex(msg)) return null;
  const b = zoomBody(msg);
  if (b[0] !== 0x64 || b[1] !== 0x01 || (b.length - 2) % RECORD !== 0) return null;
  const cells = new Map<string, string>();
  const slots = new Set<number>();
  for (let i = 2; i < b.length; i += RECORD) {
    const [slot, row, kind] = b.slice(i, i + 3);
    slots.add(slot);
    cells.set(`${slot}.${row}.${kind}`, text(b.slice(i + 4, i + RECORD)));
  }
  return [...slots].sort((x, y) => x - y).map((slot) => {
    const params: DisplayParam[] = [];
    for (let row = 2; cells.has(`${slot}.${row}.1`); row++) {
      params.push({ label: cells.get(`${slot}.${row}.1`)!, value: cells.get(`${slot}.${row}.0`) ?? '' });
    }
    return { slot, on: cells.get(`${slot}.0.0`) === '1', effect: cells.get(`${slot}.1.0`) ?? '', params };
  });
}

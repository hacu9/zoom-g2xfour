/**
 * Zoom SysEx framing. Everything in here is a HYPOTHESIS taken from
 * github.com/mungewell/zoom-zt2 issues #46 and #64 (B1/B2/G1 FOUR, MS+ series).
 * Nothing is verified on a G2X FOUR yet — the probe exists to verify it.
 */
export const ZOOM_MANUFACTURER = 0x52;

/**
 * Default "device ID" byte. Issue #46 shows the MS-60B+ and MS-70CDR+ also answer
 * to F0 52 00 6E, so 6E looks like a shared address for this generation,
 * not a per-model ID.
 */
export const DEFAULT_ZOOM_ID = 0x6e;

export function zoomSysex(deviceId: number, body: number[]): number[] {
  return [0xf0, ZOOM_MANUFACTURER, 0x00, deviceId & 0x7f, ...body, 0xf7];
}

export function isZoomSysex(bytes: ArrayLike<number>): boolean {
  return bytes.length >= 5 && bytes[0] === 0xf0 && bytes[1] === ZOOM_MANUFACTURER && bytes[2] === 0x00;
}

/** Returns the command body: the bytes between the device ID and F7. */
export function zoomBody(bytes: ArrayLike<number>): number[] {
  const end = bytes[bytes.length - 1] === 0xf7 ? bytes.length - 1 : bytes.length;
  return Array.from(bytes).slice(4, end);
}

/**
 * Unpack MIDI 7-bit data to 8-bit. Each group of up to 8 bytes starts with one
 * byte that holds the high bits of the next 7 bytes (bit 0 -> first byte).
 * The bit order is a hypothesis; the UI shows the raw bytes next to this.
 */
export function unpack7to8(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 8) {
    const msbs = data[i];
    for (let j = 1; j < 8 && i + j < data.length; j++) {
      out.push(data[i + j] | (((msbs >> (j - 1)) & 1) << 7));
    }
  }
  return out;
}

/** Printable ASCII runs of at least minLen chars — useful to spot file names. */
export function asciiRuns(bytes: number[], minLen = 3): string[] {
  const runs: string[] = [];
  let cur = '';
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= minLen) runs.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) runs.push(cur);
  return runs;
}

import { ZOOM_MANUFACTURER } from './zoom';

export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

export interface IdentityReply {
  channel: number;
  manufacturer: number[];
  manufacturerName: string;
  family: number;
  familyBytes: [number, number];
  member: number;
  memberBytes: [number, number];
  version: number[];
  versionAscii: string;
  /** For Zoom: the family code LSB, which older Zoom pedals reuse as the SysEx device ID. */
  zoomDeviceId: number | null;
}

const KNOWN_MANUFACTURERS: Record<number, string> = {
  [ZOOM_MANUFACTURER]: 'Zoom Corporation',
};

/** Parse a Universal Identity Reply: F0 7E <ch> 06 02 <mfr 1 or 3> <fam 2> <member 2> <ver 4> F7. */
export function parseIdentityReply(bytes: ArrayLike<number>): IdentityReply | null {
  const b = Array.from(bytes);
  if (b.length < 15 || b[0] !== 0xf0 || b[1] !== 0x7e || b[3] !== 0x06 || b[4] !== 0x02) return null;
  let i = 5;
  const manufacturer = b[i] === 0x00 ? b.slice(i, i + 3) : [b[i]];
  i += manufacturer.length;
  if (b.length < i + 9) return null;
  // The 4 version bytes must be data bytes; a short reply would otherwise read F7 as version.
  if (b.slice(i, i + 8).some((v) => v > 0x7f)) return null;
  const familyBytes: [number, number] = [b[i], b[i + 1]];
  const memberBytes: [number, number] = [b[i + 2], b[i + 3]];
  const version = b.slice(i + 4, i + 8);
  const isZoom = manufacturer.length === 1 && manufacturer[0] === ZOOM_MANUFACTURER;
  return {
    channel: b[2],
    manufacturer,
    manufacturerName: manufacturer.length === 1 ? (KNOWN_MANUFACTURERS[manufacturer[0]] ?? 'Unknown') : 'Extended ID',
    family: familyBytes[0] | (familyBytes[1] << 7),
    familyBytes,
    member: memberBytes[0] | (memberBytes[1] << 7),
    memberBytes,
    version,
    versionAscii: version.map((v) => (v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : '.')).join(''),
    zoomDeviceId: isZoom ? familyBytes[0] : null,
  };
}

export function isIdentityReply(bytes: ArrayLike<number>): boolean {
  return bytes.length >= 5 && bytes[0] === 0xf0 && bytes[1] === 0x7e && bytes[3] === 0x06 && bytes[4] === 0x02;
}

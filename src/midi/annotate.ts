import { byteHex, toHex } from './hex';
import { isIdentityReply, parseIdentityReply, ZOOM_6E_MEMBERS } from './identity';
import { asciiRuns, isZoomSysex, unpack7to8, zoomBody } from './zoom';

/** Human notes for an incoming message. Decodes only what is known; flags the rest as guesses. */
export function annotate(bytes: ArrayLike<number>): string[] {
  const b = Array.from(bytes);
  const notes: string[] = [];
  if (isIdentityReply(b)) {
    const id = parseIdentityReply(b);
    if (id) {
      notes.push(
        `Identity reply: manufacturer ${id.manufacturer.map(byteHex).join(' ')} (${id.manufacturerName}), ` +
          `family ${id.familyBytes.map(byteHex).join(' ')}, member ${id.memberBytes.map(byteHex).join(' ')}, version "${id.versionAscii}"`,
      );
      if (id.zoomDeviceId !== null) notes.push(`Zoom device ID candidate (family LSB): ${byteHex(id.zoomDeviceId)}`);
      const model = id.zoomDeviceId === 0x6e ? ZOOM_6E_MEMBERS[id.member] : undefined;
      if (model) notes.push(`Model (observed member code): ${model}`);
    }
    return notes;
  }
  if (isZoomSysex(b)) {
    const body = zoomBody(b);
    notes.push(`Zoom SysEx, ID ${byteHex(b[3])}, cmd ${body.slice(0, 2).map(byteHex).join(' ')}, body ${body.length} bytes`);
    const runs = asciiRuns(body);
    if (runs.length) notes.push(`ASCII: ${runs.map((r) => JSON.stringify(r)).join(', ')}`);
    if (body.length > 8) notes.push(`7→8 unpack GUESS (from body byte 2, bit0→first byte; verify before use): ${toHex(unpack7to8(body.slice(2)))}`);
    return notes;
  }
  const status = b[0] & 0xf0;
  const names: Record<number, string> = { 0x80: 'Note Off', 0x90: 'Note On', 0xa0: 'Poly AT', 0xb0: 'Control Change', 0xc0: 'Program Change', 0xd0: 'Channel AT', 0xe0: 'Pitch Bend' };
  if (names[status]) notes.push(`${names[status]} ch ${(b[0] & 0x0f) + 1}${status === 0xc0 ? `, program ${b[1]}` : ''}`);
  return notes;
}

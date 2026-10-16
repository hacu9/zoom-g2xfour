import { byteHex } from './hex';
import { isIdentityReply, parseIdentityReply, ZOOM_6E_MEMBERS } from './identity';
import { displayValue, effectById } from '../catalog/g2four';
import { decodeFileEntry, decodeFlashInfo, decodePatchDisplay } from './decode';
import { decodeRawPatch } from './ptcf';
import { asciiRuns, isZoomSysex, zoomBody } from './zoom';

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
    const flash = decodeFlashInfo(b);
    if (flash) return [...notes, `Flash: ${flash.totalBytes} bytes total, ${flash.freeBytes} bytes free`];
    const file = decodeFileEntry(b);
    if (file) return [...notes, `File: ${file.name} (${file.sizeBytes} bytes)`];
    const raw = decodeRawPatch(b);
    if (raw) {
      return [
        ...notes,
        `Raw patch "${raw.name ?? raw.shortName}" — chunks ${raw.chunks.join(' ')}; tempo ${raw.tempo ?? '?'}, volume ${raw.volume ?? '?'} (PRM2 layout unverified)`,
        ...raw.effects.map((e) => {
          const fx = effectById(e.id);
          const params = fx ? fx.parameters.map((p, i) => `${p.name}=${displayValue(p, e.params[i])}`).join(', ') : e.params.join(' ');
          return `Slot ${e.slot}: ${e.on ? 'ON ' : 'off'} ${fx?.name ?? 'unknown'} (id ${e.id.toString(16).padStart(8, '0')}) — ${params}`;
        }),
      ];
    }
    const patch = decodePatchDisplay(b);
    if (patch) {
      return [
        ...notes,
        ...patch.map((s) => `Slot ${s.slot}: ${s.on ? 'ON ' : 'off'} ${s.effect}${s.params.length ? ' — ' + s.params.map((p) => `${p.label}=${p.value}`).join(', ') : ''}`),
      ];
    }
    const runs = asciiRuns(body);
    if (runs.length) notes.push(`ASCII: ${runs.map((r) => JSON.stringify(r)).join(', ')}`);
    return notes;
  }
  const status = b[0] & 0xf0;
  const names: Record<number, string> = { 0x80: 'Note Off', 0x90: 'Note On', 0xa0: 'Poly AT', 0xb0: 'Control Change', 0xc0: 'Program Change', 0xd0: 'Channel AT', 0xe0: 'Pitch Bend' };
  if (names[status]) notes.push(`${names[status]} ch ${(b[0] & 0x0f) + 1}${status === 0xc0 ? `, program ${b[1]}` : ''}`);
  return notes;
}

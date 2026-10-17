import { patchBytesFromSlotDump } from './backup';
import { parsePTCF } from './ptcf';
import { isZoomSysex } from './zoom';

export interface SyxEntry {
  slot: number;
  name: string;
  msg: number[];
}

/** Split a .syx into 45 slot dumps. */
export function parseSyx(bytes: Uint8Array, perBank: number): SyxEntry[] {
  const out: SyxEntry[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i;
    else if (bytes[i] === 0xf7 && start >= 0) {
      const msg = Array.from(bytes.slice(start, i + 1));
      start = -1;
      if (!isZoomSysex(msg) || msg[4] !== 0x45) continue;
      const slot = (msg[7] | (msg[8] << 7)) * perBank + (msg[9] | (msg[10] << 7));
      const p = parsePTCF(patchBytesFromSlotDump(msg) ?? []);
      out.push({ slot, name: p?.name ?? p?.shortName ?? '?', msg });
    }
  }
  return out;
}

/**
 * Read every stored patch with 46 00 00 <bank 2> <program 2> (read-only, from
 * thammer/zoom-explorer ZoomDevice.downloadPatchFromMemorySlot). The reply is
 * 45 00 00 <bank 2> <program 2> <length 2> <7-bit PTCF> [<5-byte CRC>]; it
 * echoes bank/program, so a dump is only accepted for the slot that was asked.
 */
import { parsePTCF, type RawPatch } from './ptcf';
import type { ProbeSession } from './session';
import { isZoomSysex, unpack7to8, unpackedLength, zoomBody, zoomSysex } from './zoom';

export interface SlotDump {
  slot: number;
  bank: number;
  program: number;
  /** The full SysEx reply, exactly as received. */
  sysex: Uint8Array | null;
  patch: RawPatch | null;
  /** Hex of the 8-bit patch bytes, for duplicate detection. */
  fingerprint: string | null;
}

const split14 = (n: number) => [n & 0x7f, (n >> 7) & 0x7f];

export function slotRequest(deviceId: number, slot: number, perBank: number): number[] {
  const bank = Math.floor(slot / perBank);
  const program = slot % perBank;
  return zoomSysex(deviceId, [0x46, 0x00, 0x00, ...split14(bank), ...split14(program)]);
}

export function patchBytesFromSlotDump(msg: ArrayLike<number>): number[] | null {
  if (!isZoomSysex(msg)) return null;
  const b = zoomBody(msg);
  if (b[0] !== 0x45 || b[1] !== 0x00 || b[2] !== 0x00 || b.length < 10) return null;
  const declared = b[7] | (b[8] << 7);
  let seven = b.slice(9);
  if (unpackedLength(seven.length - 5) === declared) seven = seven.slice(0, -5);
  return unpack7to8(seven).slice(0, declared);
}

export async function readSlot(session: ProbeSession, deviceId: number, slot: number, perBank: number, timeoutMs = 2000): Promise<SlotDump> {
  const req = slotRequest(deviceId, slot, perBank);
  const echo = req.slice(7, 11);
  const reply = await session.request(
    req,
    `backup: read slot ${slot}`,
    (d) => isZoomSysex(d) && d[4] === 0x45 && d[5] === 0x00 && d[6] === 0x00 && echo.every((x, i) => d[7 + i] === x),
    timeoutMs,
  );
  const bytes = reply ? patchBytesFromSlotDump(reply) : null;
  return {
    slot,
    bank: Math.floor(slot / perBank),
    program: slot % perBank,
    sysex: reply,
    patch: bytes ? parsePTCF(bytes) : null,
    fingerprint: bytes ? bytes.map((x) => x.toString(16).padStart(2, '0')).join('') : null,
  };
}

export async function backupAll(
  session: ProbeSession,
  deviceId: number,
  opts: { count: number; perBank: number; signal?: AbortSignal; onProgress?: (done: number) => void },
): Promise<SlotDump[]> {
  const out: SlotDump[] = [];
  for (let slot = 0; slot < opts.count; slot++) {
    if (opts.signal?.aborted) break;
    out.push(await readSlot(session, deviceId, slot, opts.perBank));
    opts.onProgress?.(slot + 1);
  }
  return out;
}

/** Standard .syx: the raw replies back to back. */
export function toSyx(dumps: SlotDump[]): Uint8Array<ArrayBuffer> {
  const parts = dumps.filter((d) => d.sysex).map((d) => d.sysex!);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

/** Groups of slots whose stored bytes are identical. */
export function duplicateGroups(dumps: SlotDump[]): number[][] {
  const by = new Map<string, number[]>();
  for (const d of dumps) if (d.fingerprint) by.set(d.fingerprint, [...(by.get(d.fingerprint) ?? []), d.slot]);
  return [...by.values()].filter((g) => g.length > 1);
}

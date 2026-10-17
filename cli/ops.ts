import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupAll, readBankInfo, toSyx, type SlotDump } from '../src/midi/backup';
import type { ProbeSession } from '../src/midi/session';
import type { WritePolicy } from '../src/midi/writes';

export const nameOf = (d: SlotDump) => d.patch?.name?.trimEnd() ?? d.patch?.shortName ?? '?';

export interface FullBackup {
  count: number;
  perBank: number;
  dumps: SlotDump[];
  file: string;
}

/**
 * The full read the app runs on connect, saved as .syx (+ a .json name list):
 * the file is the undo. Throws when a patch does not decode: no writes without
 * a complete backup. The file is saved first, also then.
 */
export async function saveFullBackup(session: ProbeSession, deviceId: number, dir: string, onProgress?: (done: number, count: number) => void): Promise<FullBackup> {
  const { count, perBank } = await readBankInfo(session, deviceId);
  const dumps = await backupAll(session, deviceId, { count, perBank, onProgress: (n) => onProgress?.(n, count) });
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `g2xfour-backup-${stamp}.syx`);
  writeFileSync(file, toSyx(dumps));
  writeFileSync(file.replace(/\.syx$/, '.json'), JSON.stringify(dumps.map((d) => ({ slot: d.slot, name: nameOf(d) })), null, 1));
  const decoded = dumps.filter((d) => d.patch).length;
  if (decoded !== count) throw new Error(`Only ${decoded} of ${count} patches decoded (saved anyway: ${file}). No writes without a complete backup.`);
  return { count, perBank, dumps, file };
}

export function policyFrom(b: { count: number; perBank: number; dumps: SlotDump[] }, currentSlot: number | null): WritePolicy {
  return {
    backupTaken: true,
    scratchSlots: new Set(b.dumps.filter((d) => nameOf(d) === 'Empty').map((d) => d.slot)),
    currentSlot,
    perBank: b.perBank,
    patchCount: b.count,
    allowRealPatchEdits: false,
    confirmedSlot: null,
    slotNames: new Map(b.dumps.map((d) => [d.slot, nameOf(d)])),
  };
}

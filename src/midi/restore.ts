import { assertStillEmpty } from '../recipe/apply';
import { patchBytesFromSlotDump, patchFingerprint, readSlot } from './backup';
import type { ProbeSession } from './session';
import type { SyxEntry } from './syx';
import { isZoomSysex } from './zoom';
import { retargetSlotDump, type WritePolicy } from './writes';

export interface RestoreResult {
  /** The slot now holds the source patch byte for byte. */
  verified: boolean;
  /** The name the slot reads back with. */
  name: string;
}

/**
 * Uploads one slot dump into `slot` and reads it back. A target outside the
 * Empty list needs `confirmed` (the user typed its number). The pedal must not
 * be on `slot`: auto-save may undo the restore when the patch changes.
 */
export async function restoreEntry(session: ProbeSession, deviceId: number, src: SyxEntry, slot: number, policy: WritePolicy, confirmed = false): Promise<RestoreResult> {
  const isScratch = policy.scratchSlots.has(slot);
  if (!isScratch && !confirmed) throw new Error(`Slot ${slot} holds a real patch. Confirm the overwrite first.`);
  if (policy.currentSlot === null) throw new Error('The app does not know which slot the pedal is on yet. Wait for the screen to show it, then try again.');
  if (slot === policy.currentSlot) throw new Error(`The pedal is on slot ${slot}. Switch to another patch first, or auto-save may undo the restore.`);
  // Read the target again: it must still hold what the backup (or this tab) says.
  // An Empty target needs no typed confirmation; a confirmed one was confirmed for that patch.
  if (isScratch || policy.slotNames?.has(slot)) await assertStillEmpty(session, deviceId, slot, policy);
  const msg = retargetSlotDump(src.msg, slot, policy.perBank);
  const w: WritePolicy = { ...policy, confirmedSlot: isScratch ? null : slot };
  await session.request(msg, `restore "${src.name}" → slot ${slot}`, (d) => isZoomSysex(d) && d[4] === 0x00, 3000, w);
  const back = await readSlot(session, deviceId, slot, policy.perBank);
  const want = patchFingerprint(patchBytesFromSlotDump(src.msg) ?? []);
  return { verified: back.fingerprint === want, name: back.patch?.name?.trimEnd() ?? '?' };
}

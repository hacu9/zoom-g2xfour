/**
 * Writes a Plan into a scratch slot with live edits (64 20 00), then lets the
 * pedal's auto-save store it by changing patch, and verifies the stored slot
 * with a 46 read. Edit → ack shapes verified on a G2X FOUR on 2026-10-15.
 */
import { readSlot } from '../midi/backup';
import { decodeRawPatch, type RawPatch } from '../midi/ptcf';
import type { ProbeSession } from '../midi/session';
import { nameEdit, paramEdit, tempoEdit, type WritePolicy } from '../midi/writes';
import { isZoomSysex, zoomSysex } from '../midi/zoom';
import { MAX_NAME, MAX_SLOTS, type Plan } from './translate';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const is = (d: Uint8Array, ...b: number[]) => isZoomSysex(d) && b.every((x, i) => d[4 + i] === x);

/**
 * Bank select + program change, then confirm the slot. The pedal reports patch
 * changes (64 26) only while edit reports (50) are on — observed 2026-10-15 —
 * so 50 goes first, and 33 (current bank/program) is the fallback check.
 */
export async function selectSlot(session: ProbeSession, deviceId: number, slot: number, perBank: number): Promise<boolean> {
  const bank = Math.floor(slot / perBank);
  const prog = slot % perBank;
  await session.request(zoomSysex(deviceId, [0x50]), 'edit reports on', (d) => is(d, 0x00, 0x00), 1000);
  session.send([0xb0, 0x00, 0x00], `select slot ${slot}: bank MSB`);
  session.send([0xb0, 0x20, bank], `select slot ${slot}: bank LSB`);
  if (await session.request([0xc0, prog], `select slot ${slot}: program`, (d) => is(d, 0x64, 0x26) && d[8] === bank && d[10] === prog, 1500)) return true;
  let seenBank = -1;
  const off = session.subscribe((d) => {
    if (d[0] === 0xb0 && d[1] === 0x20) seenBank = d[2];
  });
  try {
    const pc = await session.request(zoomSysex(deviceId, [0x33]), `confirm slot ${slot}`, (d) => d[0] === 0xc0, 1500);
    return pc !== null && pc[1] === prog && seenBank === bank;
  } finally {
    off();
  }
}

export interface ApplyResult {
  ok: boolean;
  steps: string[];
  mismatches: string[];
}

/**
 * Reads the slot again right before a write. The writable list comes from this
 * tab's backup, which can be out of date: another tab or a pedal edit may have
 * filled the slot since. Passes for "Empty", or for the patch this tab wrote there.
 */
export async function assertStillEmpty(session: ProbeSession, deviceId: number, slot: number, policy: WritePolicy): Promise<void> {
  const name = (await readSlot(session, deviceId, slot, policy.perBank)).patch?.name?.trimEnd();
  const expected = policy.slotNames?.get(slot)?.trimEnd() ?? 'Empty';
  if (name === 'Empty' || name === expected) return;
  throw new Error(
    name === undefined
      ? `Could not read slot ${slot} to check that it is still free. Nothing written.`
      : `Slot ${slot} now holds "${name}", not ${expected === 'Empty' ? 'Empty' : `"${expected}"`}. Nothing written. Click "Back up again" to refresh the list.`,
  );
}

export async function applyPlan(
  session: ProbeSession,
  deviceId: number,
  plan: Plan,
  target: number,
  returnTo: number,
  policy: WritePolicy,
): Promise<ApplyResult> {
  const steps: string[] = [];
  const mismatches: string[] = [];
  if (!policy.scratchSlots.has(target)) throw new Error(`Slot ${target} is not a scratch ("Empty") slot.`);
  await assertStillEmpty(session, deviceId, target, policy);

  if (!(await selectSlot(session, deviceId, target, policy.perBank))) throw new Error(`Pedal did not confirm the change to slot ${target}.`);
  const w: WritePolicy = { ...policy, currentSlot: target };
  steps.push(`on slot ${target}`);

  // Stop at once if the pedal leaves the target slot (footswitch, another app):
  // every later edit would land on that other patch and be auto-saved there.
  // selectSlot() turned edit reports (50) on, so a change arrives as 64 26.
  let movedTo: number | null = null;
  const off = session.subscribe((d) => {
    if (!is(d, 0x64, 0x26)) return;
    const slot = (d[8] | (d[9] << 7)) * policy.perBank + (d[10] | (d[11] << 7));
    if (slot !== target) movedTo = slot;
  });
  const guard = () => {
    if (movedTo !== null) throw new Error(`The pedal changed to slot ${movedTo} during the write. Stopped. Check slot ${movedTo} and restore it from the backup if needed.`);
  };

  let patch: RawPatch | null = null;
  try {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const fx = plan.effects[slot];
      guard();
      // Changing the effect makes the pedal push the patch (64 12 00); empty slots may not.
      await session.request(paramEdit(deviceId, slot, 1, fx ? fx.id : 0), `slot ${slot} effect ${fx?.name ?? 'empty'}`, (d) => is(d, 0x64, 0x12), 1500, w);
      if (!fx) continue;
      guard();
      await session.request(paramEdit(deviceId, slot, 0, 1), `slot ${slot} on`, (d) => is(d, 0x64, 0x20, 0x01) && d[7] === slot && d[8] === 0, 1000, w);
      for (const p of fx.params) {
        guard();
        // No ack when the value is already set; the read-back below is the real check.
        await session.request(
          paramEdit(deviceId, slot, p.index + 2, p.value),
          `slot ${slot} ${fx.name} ${p.name}=${p.display}`,
          (d) => is(d, 0x64, 0x20, 0x01) && d[7] === slot && d[8] === p.index + 2,
          1000,
          w,
        );
      }
      steps.push(`slot ${slot}: ${fx.name} (${fx.params.map((p) => `${p.name}=${p.display}`).join(', ')})`);
    }

    if (plan.tempo) {
      guard();
      session.send(tempoEdit(deviceId, plan.tempo), `patch tempo ${plan.tempo}`, { write: w });
      await sleep(100);
      steps.push(`tempo ${plan.tempo} BPM`);
    }

    const name = plan.name.padEnd(MAX_NAME, ' ').slice(0, MAX_NAME);
    for (let i = 0; i < MAX_NAME; i++) {
      guard();
      session.send(nameEdit(deviceId, i, name[i]), `name[${i}]`, { write: w });
      await sleep(25);
    }
    steps.push(`name "${plan.name}"`);

    // Read back the edit buffer before it is stored.
    const live = await session.request(zoomSysex(deviceId, [0x64, 0x13]), 'verify edit buffer', (d) => is(d, 0x64, 0x12), 2000);
    guard();
    patch = live ? decodeRawPatch(live) : null;
  } finally {
    off();
  }
  compare('edit buffer', patch, plan, mismatches);
  if (patch && patch.name?.trimEnd() !== plan.name) mismatches.push(`name: wanted "${plan.name}", got "${patch.name}"`);

  // Auto-save stores the patch when the pedal changes patch. A program change
  // to the SAME slot neither saves reliably nor reloads the edit buffer (seen
  // 2026-10-15: buffer showed "Empty" after it), so hop via a neighbour.
  if (returnTo === target) await selectSlot(session, deviceId, (target + 1) % policy.patchCount, policy.perBank);
  await selectSlot(session, deviceId, returnTo, policy.perBank);
  await sleep(500);
  const stored = await readSlot(session, deviceId, target, policy.perBank);
  if (stored.patch?.name?.trimEnd() !== plan.name) mismatches.push(`stored slot ${target} name is "${stored.patch?.name}" — auto-save may be off`);
  else compare('stored', stored.patch, plan, mismatches);
  steps.push(`back on slot ${returnTo}; stored slot ${target} = "${stored.patch?.name}"`);
  return { ok: mismatches.length === 0, steps, mismatches };
}

function compare(where: string, patch: RawPatch | null | undefined, plan: Plan, out: string[]) {
  if (!patch) {
    out.push(`${where}: could not be read`);
    return;
  }
  plan.effects.forEach((fx, slot) => {
    const got = patch.effects[slot];
    if (got?.id !== fx.id) out.push(`${where} slot ${slot}: wanted ${fx.name}, got id ${got?.id.toString(16)}`);
    for (const p of fx.params) if (got && got.params[p.index] !== p.value) out.push(`${where} slot ${slot} ${p.name}: wanted ${p.display}, got index ${got.params[p.index]}`);
  });
  if (plan.tempo && patch.tempo !== plan.tempo) out.push(`${where} tempo: wanted ${plan.tempo}, got ${patch.tempo}`);
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The slot as the pedal reports it right before the write (null = no reply).
let slotName: string | null = 'Empty';
vi.mock('../src/midi/backup', async (orig) => ({
  ...(await orig<typeof import('../src/midi/backup')>()),
  readSlot: async (_s: unknown, _d: number, slot: number) => ({ slot, patch: slotName === null ? null : { name: slotName } }),
}));
import rain from '../src/recipe/recipes/rain-rob-scallon.json';
import { applyPlan } from '../src/recipe/apply';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';
import type { ProbeSession } from '../src/midi/session';
import type { WritePolicy } from '../src/midi/writes';

const policy: WritePolicy = { backupTaken: true, scratchSlots: new Set([250]), currentSlot: 140, perBank: 10, patchCount: 300, allowRealPatchEdits: false, confirmedSlot: null };
const z = (...b: number[]) => new Uint8Array([0xf0, 0x52, 0x00, 0x6e, ...b, 0xf7]);
const patchChange = (slot: number) => z(0x64, 0x26, 0, 0, Math.floor(slot / 10), 0, slot % 10, 0);

/** A fake pedal: acks 50, confirms program changes, acks edits — and can jump to another patch. */
function fakePedal(jumpAfterEdits: number | null) {
  const subs = new Set<(d: Uint8Array) => void>();
  const sent: number[][] = [];
  let edits = 0;
  let bank = 0;
  const emit = (d: Uint8Array) => subs.forEach((s) => s(d));
  const reply = (bytes: number[]): Uint8Array | null => {
    if (bytes[0] === 0xb0 && bytes[1] === 0x20) bank = bytes[2];
    if (bytes[0] === 0xc0) return patchChange(bank * 10 + bytes[1]);
    if (bytes[4] === 0x50) return z(0x00, 0x00);
    if (bytes[4] === 0x64 && bytes[5] === 0x20) {
      edits++;
      if (edits === jumpAfterEdits) setTimeout(() => emit(patchChange(14)), 0);
      return z(0x64, 0x20, 0x01, bytes[7], bytes[8], 0, 0, 0, 0, 0);
    }
    return null;
  };
  const session = {
    subscribe: (cb: (d: Uint8Array) => void) => (subs.add(cb), () => subs.delete(cb)),
    send: (bytes: number[]) => {
      sent.push(bytes);
      const r = reply(bytes);
      if (r) setTimeout(() => emit(r), 0);
    },
    request: (bytes: number[], _l: string, match: (d: Uint8Array) => boolean, timeoutMs = 50) =>
      new Promise<Uint8Array | null>((resolve) => {
        const off = session.subscribe((d) => {
          if (match(d)) {
            off();
            resolve(d);
          }
        });
        setTimeout(() => (off(), resolve(null)), Math.min(timeoutMs, 30));
        session.send(bytes);
      }),
  };
  return { session: session as unknown as ProbeSession, sent };
}

describe('applyPlan', () => {
  const plan = translate(rain as ToneRecipe);
  beforeEach(() => {
    slotName = 'Empty';
  });

  it('refuses a slot that a stale backup lists as Empty but now holds a patch', async () => {
    slotName = 'AKFG Crunch   ';
    const { session, sent } = fakePedal(null);
    await expect(applyPlan(session, 0x6e, plan, 250, 140, policy)).rejects.toThrow(/now holds "AKFG Crunch", not Empty/);
    expect(sent.filter((b) => b[4] === 0x64)).toEqual([]);
  });

  it('lets this tab write again over the patch it wrote there', async () => {
    slotName = 'Rain Scallon';
    const own = { ...policy, slotNames: new Map([[250, 'Rain Scallon']]) };
    const err = await applyPlan(fakePedal(null).session, 0x6e, plan, 250, 140, own).then(() => null, (e: Error) => e.message);
    expect(err ?? '').not.toMatch(/now holds|Could not read/);
  });

  it('refuses when the slot cannot be read', async () => {
    slotName = null;
    const { session, sent } = fakePedal(null);
    await expect(applyPlan(session, 0x6e, plan, 250, 140, policy)).rejects.toThrow(/Could not read slot 250/);
    expect(sent.filter((b) => b[4] === 0x64)).toEqual([]);
  });

  it('refuses a target that is not a scratch slot', async () => {
    await expect(applyPlan(fakePedal(null).session, 0x6e, plan, 140, 140, policy)).rejects.toThrow(/not a scratch/);
  });

  it('stops at once when the pedal changes patch mid-write (footswitch)', async () => {
    const { session, sent } = fakePedal(1);
    await expect(applyPlan(session, 0x6e, plan, 250, 140, policy)).rejects.toThrow(/changed to slot 14/);
    const editsSent = sent.filter((b) => b[4] === 0x64 && b[5] === 0x20).length;
    expect(editsSent).toBeLessThanOrEqual(2);
  });
});

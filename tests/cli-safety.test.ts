import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFullBackup } from '../cli/ops';
import { restoreEntry } from '../src/midi/restore';
import type { ProbeSession } from '../src/midi/session';
import type { WritePolicy } from '../src/midi/writes';

// What the pedal answers: slot names for 46 reads (null = no reply), and a 2-patch bank.
let pedal: Record<number, string | null> = {};
vi.mock('../src/midi/backup', async (orig) => ({
  ...(await orig<typeof import('../src/midi/backup')>()),
  readBankInfo: async () => ({ count: 2, perBank: 10 }),
  readSlot: async (_s: unknown, _d: number, slot: number) => dump(slot),
  backupAll: async (_s: unknown, _d: number, o: { count: number }) => Array.from({ length: o.count }, (_, slot) => dump(slot)),
}));
const dump = (slot: number) => ({ slot, sysex: null, patch: pedal[slot] == null ? null : { name: pedal[slot] }, fingerprint: null });

/** A session that fails the test if anything is sent. */
const sent: string[] = [];
const silent = {
  request: (_b: number[], label: string) => (sent.push(label), Promise.reject(new Error('sent'))),
  send: (_b: number[], label: string) => sent.push(label),
  subscribe: () => () => {},
} as unknown as ProbeSession;

const policy: WritePolicy = {
  backupTaken: true,
  scratchSlots: new Set([259]),
  currentSlot: 140,
  perBank: 10,
  patchCount: 300,
  allowRealPatchEdits: false,
  confirmedSlot: null,
  slotNames: new Map([
    [141, 'Real One'],
    [259, 'Empty'],
  ]),
};
const src = { slot: 140, name: 'Evil Eye 1984', msg: [] };

beforeEach(() => {
  sent.length = 0;
});

describe('restore reads the target again before it uploads', () => {
  it('stops when an Empty slot is no longer Empty (another tab wrote it)', async () => {
    pedal = { 259: 'AKFG Crunch' };
    await expect(restoreEntry(silent, 0x6e, src, 259, policy)).rejects.toThrow(/now holds "AKFG Crunch"/);
    expect(sent).toEqual([]);
  });
  it('stops when a confirmed real slot holds a different patch than the backup said', async () => {
    pedal = { 141: 'Something Else' };
    await expect(restoreEntry(silent, 0x6e, src, 141, policy, true)).rejects.toThrow(/now holds "Something Else", not "Real One"/);
    expect(sent).toEqual([]);
  });
  it('goes on when the slot still holds what the backup said', async () => {
    pedal = { 141: 'Real One' };
    await expect(restoreEntry(silent, 0x6e, src, 141, policy, true)).rejects.toThrow('sent');
    expect(sent).toHaveLength(1);
  });
});

describe('the CLI backup', () => {
  it('refuses an incomplete backup, but saves the file first', async () => {
    pedal = { 0: 'Smorking2021', 1: null };
    const dir = mkdtempSync(join(tmpdir(), 'g2x-'));
    await expect(saveFullBackup(silent, 0x6e, dir)).rejects.toThrow(/Only 1 of 2 patches decoded/);
    expect(readdirSync(dir).filter((f) => f.endsWith('.syx'))).toHaveLength(1);
  });
  it('returns the dumps when every patch decodes', async () => {
    pedal = { 0: 'Smorking2021', 1: 'Empty' };
    const bk = await saveFullBackup(silent, 0x6e, mkdtempSync(join(tmpdir(), 'g2x-')));
    expect(bk.dumps.map((d) => d.patch?.name)).toEqual(['Smorking2021', 'Empty']);
  });
});

describe('restore needs to know where the pedal is', () => {
  it('refuses while the current slot is unknown', async () => {
    pedal = { 259: 'Empty' };
    await expect(restoreEntry(silent, 0x6e, src, 259, { ...policy, currentSlot: null })).rejects.toThrow(/does not know which slot/);
    expect(sent).toEqual([]);
  });
});

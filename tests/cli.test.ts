import { describe, expect, it } from 'vitest';
import { findRecipe, parseArgs, parseSlot, ranges } from '../cli/args';
import { restoreEntry } from '../src/midi/restore';
import type { ProbeSession } from '../src/midi/session';
import type { WritePolicy } from '../src/midi/writes';

describe('g2x arguments', () => {
  it('splits command, positionals and flags', () => {
    const a = parseArgs(['restore', 'b.syx', '140', '259', '--confirm', '259', '--verbose']);
    expect(a.command).toBe('restore');
    expect(a.positional).toEqual(['b.syx', '140', '259']);
    expect(a.flags.get('--confirm')).toBe('259');
    expect(a.flags.get('--verbose')).toBe(true);
    expect(parseArgs([]).command).toBe('help');
  });
  it('accepts only real slot numbers', () => {
    expect(parseSlot('0')).toBe(0);
    expect(parseSlot('299')).toBe(299);
    for (const bad of ['300', '-1', '12a', '', undefined]) expect(() => parseSlot(bad)).toThrow(/not a slot/);
  });
  it('finds a recipe by number, patch name or song, accents ignored', () => {
    expect(findRecipe('0')?.patchName).toBe('Rain Scallon');
    expect(findRecipe('akfg crunch')?.patchName).toBe('AKFG Crunch');
    expect(findRecipe('coraline cln')?.patchName).toBe('Coraline Cln');
    expect(findRecipe('maneskin coraline (clean)')).toBeNull(); // not one string in the label
    expect(findRecipe('Coraline')).toBeNull(); // two match: ask for one
    expect(findRecipe('wind')?.patchName).toBe('Wind Acoustic');
    expect(findRecipe('99')).toBeNull();
  });
  it('prints slot ranges', () => {
    expect(ranges([259, 260, 261, 264, 266, 267])).toBe('259-261, 264, 266-267');
    expect(ranges([])).toBe('none');
  });
});

describe('restoreEntry refuses before it sends anything', () => {
  const policy: WritePolicy = { backupTaken: true, scratchSlots: new Set([259]), currentSlot: 140, perBank: 10, patchCount: 300, allowRealPatchEdits: false, confirmedSlot: null };
  const silent = { request: () => Promise.reject(new Error('sent')), send: () => { throw new Error('sent'); }, subscribe: () => () => {} } as unknown as ProbeSession;
  const src = { slot: 140, name: 'Evil Eye 1984', msg: [] };
  it('a real patch without confirmation', async () => {
    await expect(restoreEntry(silent, 0x6e, src, 141, policy)).rejects.toThrow(/real patch/);
  });
  it('the slot the pedal is on', async () => {
    await expect(restoreEntry(silent, 0x6e, src, 140, policy, true)).rejects.toThrow(/pedal is on slot 140/);
  });
});

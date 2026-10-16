import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { duplicateGroups, patchBytesFromSlotDump, patchFingerprint, slotRequest, toSyx, type SlotDump } from '../src/midi/backup';
import { parsePTCF } from '../src/midi/ptcf';
import { classify } from '../src/midi/safety';

const txt = readFileSync(new URL('./fixtures/g2xfour-rawpatch-2026-10-15.txt', import.meta.url), 'utf8');
const raw = [...txt.matchAll(/ IN\s+(F0 [0-9A-F ]+ F7)/g)].map((m) => m[1].split(' ').map((h) => parseInt(h, 16))).find((m) => m[4] === 0x64 && m[5] === 0x12)!;

/** Same 7-bit payload as the real 64 12 dump, framed as a 45 slot dump for bank 14 / program 0. */
const slotDump = [0xf0, 0x52, 0x00, 0x6e, 0x45, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, raw[7], raw[8], ...raw.slice(9, -1), 0xf7];

describe('slot backup', () => {
  it('builds the documented 46 request, and the gate calls it read-only', () => {
    const req = slotRequest(0x6e, 140, 10);
    expect(req).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x46, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00, 0xf7]);
    expect(classify(req).verdict).toBe('read');
  });

  it('decodes a 45 slot dump to the same PTCF patch', () => {
    expect(parsePTCF(patchBytesFromSlotDump(slotDump)!)?.name).toBe('Evil Eye 1984');
  });

  it('groups identical slots and writes a .syx of raw replies', () => {
    const d = (slot: number, fp: string | null, sysex: number[] | null): SlotDump => ({
      slot, bank: 0, program: slot, fingerprint: fp, patch: null, sysex: sysex ? new Uint8Array(sysex) : null,
    });
    const dumps = [d(0, 'aa', [0xf0, 1, 0xf7]), d(1, 'bb', null), d(2, 'aa', [0xf0, 2, 0xf7]), d(3, 'bb', [0xf0, 3, 0xf7])];
    expect(duplicateGroups(dumps)).toEqual([[0, 2], [1, 3]]);
    expect([...toSyx(dumps)]).toEqual([0xf0, 1, 0xf7, 0xf0, 2, 0xf7, 0xf0, 3, 0xf7]);
  });
});

describe('patchFingerprint', () => {
  it('ignores the leftover tail after the PTCF length (seen on real slots)', () => {
    const bytes = patchBytesFromSlotDump(slotDump)!;
    const len = bytes[4] | (bytes[5] << 8);
    const dirty = [...bytes];
    dirty[len + 10] ^= 0xff;
    expect(patchFingerprint(dirty)).toBe(patchFingerprint(bytes));
    const changed = [...bytes];
    changed[len - 20] ^= 0x01;
    expect(patchFingerprint(changed)).not.toBe(patchFingerprint(bytes));
  });
});

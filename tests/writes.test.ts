import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMockBackend } from '../src/midi/mock';
import { ProbeSession, SafetyError } from '../src/midi/session';
import { classifyWrite, nameEdit, paramEdit, retargetSlotDump, tempoEdit, type WritePolicy } from '../src/midi/writes';
import { zoomSysex } from '../src/midi/zoom';

const txt = readFileSync(new URL('./fixtures/g2xfour-rawpatch-2026-10-15.txt', import.meta.url), 'utf8');
const raw = [...txt.matchAll(/ IN\s+(F0 [0-9A-F ]+ F7)/g)].map((m) => m[1].split(' ').map((h) => parseInt(h, 16))).find((m) => m[4] === 0x64 && m[5] === 0x12)!;
const upload = (bank: number, prog: number) => [0xf0, 0x52, 0x00, 0x6e, 0x45, 0x00, 0x00, bank, 0x00, prog, 0x00, raw[7], raw[8], ...raw.slice(9, -1), 0xf7];

const policy = (over: Partial<WritePolicy> = {}): WritePolicy => ({
  backupTaken: true, scratchSlots: new Set([250, 299]), currentSlot: 299, perBank: 10, patchCount: 300, allowRealPatchEdits: false, confirmedSlot: null, ...over,
});

describe('write encoders', () => {
  it('encodes values as 5 septets (verified: Comp id, Sense 9)', () => {
    expect(paramEdit(0x6e, 0, 1, 0x01000010)).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x64, 0x20, 0x00, 0x00, 0x01, 0x10, 0x00, 0x00, 0x08, 0x00, 0xf7]);
    expect(paramEdit(0x6e, 0, 2, 9)).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x64, 0x20, 0x00, 0x00, 0x02, 0x09, 0x00, 0x00, 0x00, 0x00, 0xf7]);
    expect(nameEdit(0x6e, 3, 'R')).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x64, 0x20, 0x00, 0x5f, 0x03, 0x52, 0, 0, 0, 0, 0xf7]);
  });
  it('retargets a slot dump without touching the data', () => {
    const m = retargetSlotDump(upload(14, 0), 299, 10);
    expect(m.slice(7, 11)).toEqual([29, 0, 9, 0]);
    expect(m.slice(11)).toEqual(upload(14, 0).slice(11));
  });
});

describe('classifyWrite', () => {
  it('allows edits and uploads on scratch slots only', () => {
    expect(classifyWrite(paramEdit(0x6e, 0, 2, 9), policy())).toMatchObject({ ok: true, kind: 'param-edit', slot: 299 });
    expect(classifyWrite(upload(25, 0), policy())).toMatchObject({ ok: true, kind: 'slot-upload', slot: 250 });
    expect(classifyWrite(upload(14, 0), policy()).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 2, 9), policy({ currentSlot: 140 })).ok).toBe(false);
  });
  it('needs a backup, a known slot, and explicit consent for real patches', () => {
    expect(classifyWrite(paramEdit(0x6e, 0, 2, 9), policy({ backupTaken: false })).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 2, 9), policy({ currentSlot: null })).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 2, 9), policy({ currentSlot: 140, allowRealPatchEdits: true })).ok).toBe(true);
    expect(classifyWrite(upload(14, 0), policy({ confirmedSlot: 140 })).ok).toBe(true);
  });
  it('rejects everything that is not one of the three shapes', () => {
    for (const body of [[0x5b], [0x01], [0x64, 0x47], [0x64, 0x20, 0x00, 0x64, 0x0f, 0x01, 0, 0, 0, 0], [0x28, 0x00], [0x64, 0x20, 0x00, 0x08, 0x02, 0, 0, 0, 0, 0]]) {
      expect(classifyWrite(zoomSysex(0x6e, body), policy({ allowRealPatchEdits: true })).ok, body.join(',')).toBe(false);
    }
  });
  it('rejects an upload whose payload is not a PTCF patch', () => {
    expect(classifyWrite(zoomSysex(0x6e, [0x45, 0, 0, 25, 0, 0, 0, 0x40, 0x06, 1, 2, 3, 4, 5]), policy()).ok).toBe(false);
  });
});

describe('session write path', () => {
  it('never lets a blocked command out through write mode', () => {
    const b = createMockBackend(1);
    const sent: number[][] = [];
    const out = b.outputs().find((p) => p.name.includes('ZOOM'))!;
    const s = new ProbeSession(b.inputs().find((p) => p.name.includes('ZOOM'))!, { ...out, send: (x) => sent.push(x) }, { onIn: () => {}, onOut: () => {} });
    for (const body of [[0x5b], [0x01], [0x64, 0x47]]) {
      expect(() => s.send(zoomSysex(0x6e, body), 'x', { write: policy({ allowRealPatchEdits: true }) })).toThrow(SafetyError);
    }
    expect(sent).toHaveLength(0);
    s.send(paramEdit(0x6e, 0, 2, 9), 'x', { write: policy() });
    expect(sent).toHaveLength(1);
  });
});

describe('tempo write', () => {
  it('allows patch tempo 40-250 only, and no other 64 20 00 64 xx', () => {
    expect(classifyWrite(tempoEdit(0x6e, 123), policy())).toMatchObject({ ok: true, kind: 'tempo' });
    expect(classifyWrite(tempoEdit(0x6e, 300), policy()).ok).toBe(false);
    expect(classifyWrite(zoomSysex(0x6e, [0x64, 0x20, 0x00, 0x64, 0x0f, 0x01, 0, 0, 0, 0]), policy()).ok).toBe(false);
  });
});

describe('write gate bounds (review findings)', () => {
  it('rejects out-of-range program, nonexistent slot and truncated uploads', () => {
    expect(classifyWrite(upload(0, 122), policy({ scratchSlots: new Set([122]) })).ok).toBe(false);
    expect(classifyWrite(upload(31, 0), policy({ scratchSlots: new Set([310]) })).ok).toBe(false);
    const cut = upload(25, 0);
    cut.splice(200, 40);
    expect(classifyWrite(cut, policy()).ok).toBe(false);
  });
  it('bounds name index, param number and value', () => {
    expect(classifyWrite(nameEdit(0x6e, 13, 'x'), policy()).ok).toBe(true);
    expect(classifyWrite(nameEdit(0x6e, 100, 'x'), policy()).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 127, 1), policy()).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 1, 2 ** 29), policy()).ok).toBe(false);
    expect(classifyWrite(paramEdit(0x6e, 0, 1, 0x0b000010), policy())).toMatchObject({ ok: true });
  });
  it('rejects name edits with a non-zero tail or control characters', () => {
    expect(classifyWrite(zoomSysex(0x6e, [0x64, 0x20, 0x00, 0x5f, 0x01, 0x41, 0x01, 0, 0, 0]), policy()).ok).toBe(false);
    expect(classifyWrite(zoomSysex(0x6e, [0x64, 0x20, 0x00, 0x5f, 0x01, 0x0a, 0, 0, 0, 0]), policy()).ok).toBe(false);
  });
  it('tempo needs a zero tail and 40 BPM or more', () => {
    expect(classifyWrite(tempoEdit(0x6e, 39), policy()).ok).toBe(false);
    expect(classifyWrite(zoomSysex(0x6e, [0x64, 0x20, 0x00, 0x64, 0x02, 0x7b, 0x00, 0x01, 0, 0]), policy()).ok).toBe(false);
  });
  it('rejects a write with a backup but on a real patch', () => {
    expect(classifyWrite(nameEdit(0x6e, 0, 'A'), policy({ currentSlot: 140 })).ok).toBe(false);
    expect(classifyWrite(tempoEdit(0x6e, 120), policy({ currentSlot: 140 })).ok).toBe(false);
  });
});

describe('research mode cannot carry a write', () => {
  it('known write shapes need the write gate even with research mode on', () => {
    const b = createMockBackend(1);
    const sent: number[][] = [];
    const out = b.outputs().find((p) => p.name.includes('ZOOM'))!;
    const s = new ProbeSession(b.inputs().find((p) => p.name.includes('ZOOM'))!, { ...out, send: (x) => sent.push(x) }, { onIn: () => {}, onOut: () => {} });
    for (const msg of [paramEdit(0x6e, 0, 2, 9), nameEdit(0x6e, 0, 'A'), tempoEdit(0x6e, 120)]) {
      expect(() => s.send(msg, 'x', { researchMode: true })).toThrow(SafetyError);
    }
    expect(sent).toHaveLength(0);
  });
});

describe('writableAfter', () => {
  it('keeps a recipe slot writable, but a restored real patch is not', async () => {
    const { writableAfter } = await import('../src/midi/writes');
    const afterRecipe = writableAfter(new Set([263]), 263, 'Coraline Dst', 'recipe');
    expect(afterRecipe.has(263)).toBe(true);
    // Restoring "My Lead" over the recipe slot: no longer free to overwrite.
    expect(writableAfter(afterRecipe, 263, 'My Lead', 'restore').has(263)).toBe(false);
    expect(writableAfter(new Set(), 262, 'Empty     ', 'restore').has(262)).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayValue, effectById, catalogSize } from '../src/catalog/g2four';
import { decodePatchDisplay } from '../src/midi/decode';
import { decodeRawPatch, readBits } from '../src/midi/ptcf';

const txt = readFileSync(new URL('./fixtures/g2xfour-rawpatch-2026-10-15.txt', import.meta.url), 'utf8');
const msgs = [...txt.matchAll(/ IN\s+(F0 [0-9A-F ]+ F7)/g)].map((m) => m[1].split(' ').map((h) => parseInt(h, 16)));
const rawMsg = msgs.find((m) => m[4] === 0x64 && m[5] === 0x12)!;
const screenMsg = msgs.find((m) => m[4] === 0x64 && m[5] === 0x01)!;

describe('readBits', () => {
  it('reads little-endian bit fields', () => {
    expect(readBits([0b0000_0011], 0, 1)).toBe(1);
    expect(readBits([0b0000_0010, 0b1], 1, 8)).toBe(0b1000_0001);
  });
});

describe('real G2X FOUR raw patch (64 12), captured 2026-10-15', () => {
  const patch = decodeRawPatch(rawMsg)!;

  it('parses PTCF with name and chunks', () => {
    expect(patch.name).toBe('Evil Eye 1984');
    expect(patch.chunks).toEqual(['TXJ1', 'TXE1', 'EDTB', 'PRM2', 'NAME']);
    expect(patch.effects).toHaveLength(8);
  });

  it('agrees with the screen dump for every non-empty effect slot', () => {
    const screen = decodePatchDisplay(screenMsg)!;
    for (const s of screen.slice(0, 4)) {
      const e = patch.effects[s.slot];
      const fx = effectById(e.id)!;
      expect(fx.name.replace(/\s/g, '')).toBe(s.effect.replace(/\s/g, ''));
      s.params.forEach((p, i) => {
        expect(fx.parameters[i].name).toBe(p.label);
        expect(displayValue(fx.parameters[i], e.params[i])).toBe(p.value);
      });
    }
  });

  it('marks empty slots with id 0', () => {
    expect(patch.effects[4].id).toBe(0);
    expect(patch.effects[5].id).toBe(0);
  });

  it('has the vendored catalog loaded', () => {
    expect(catalogSize).toBe(157);
  });
});

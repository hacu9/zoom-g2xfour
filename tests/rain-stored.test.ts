import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayValue, effectById } from '../src/catalog/g2four';
import { patchBytesFromSlotDump } from '../src/midi/backup';
import { parsePTCF } from '../src/midi/ptcf';

// Slot 250 as the pedal stored it after the Rain recipe, captured 2026-10-15.
const msg = readFileSync(new URL('./fixtures/g2xfour-rain-slot250.hex', import.meta.url), 'utf8').trim().split(' ').map((h) => parseInt(h, 16));
const patch = parsePTCF(patchBytesFromSlotDump(msg)!)!;
const show = (slot: number) => {
  const e = patch.effects[slot];
  const fx = effectById(e.id)!;
  return { on: e.on, name: fx.name, params: Object.fromEntries(fx.parameters.map((q, i) => [q.name, displayValue(q, e.params[i])])) };
};

describe('stored Rain patch (slot 250, real pedal)', () => {
  it('holds the recipe exactly', () => {
    expect(patch.name?.trimEnd()).toBe('Rain Scallon');
    expect(show(0)).toMatchObject({ on: true, name: 'Comp', params: { Sense: '4' } });
    expect(show(1)).toMatchObject({ on: true, name: 'FD TWIN-R', params: { Gain: '32', Bass: '50', MID: '55', Treble: '59' } });
    expect(show(2)).toMatchObject({ on: true, name: 'AnalogDly', params: { Mode: 'BPM SYNC', Repeat: '35', Mix: '48' } });
    expect(patch.effects[2].params[0]).toBe(945); // dotted eighth
    expect(patch.tempo).toBe(123);
    expect(show(3)).toMatchObject({ on: true, name: 'Hall REV', params: { Decay: '13', Mix: '30' } });
  });
});

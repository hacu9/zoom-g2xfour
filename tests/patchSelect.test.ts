import { describe, expect, it } from 'vitest';
import { patchSelect, stepSlot } from '../src/midi/patchSelect';
import { classify } from '../src/midi/safety';
import { shapeOf } from '../src/midi/writes';

describe('patch select', () => {
  it('sends Bank Select MSB 0, LSB bank, then Program Change', () => {
    expect(patchSelect(259, 10)).toEqual([
      [0xb0, 0x00, 0x00],
      [0xb0, 0x20, 25],
      [0xc0, 9],
    ]);
    expect(patchSelect(0, 10)).toEqual([[0xb0, 0, 0], [0xb0, 0x20, 0], [0xc0, 0]]);
  });
  it('is never a write and never needs research mode', () => {
    for (const m of patchSelect(140, 10)) {
      expect(shapeOf(m)).toBeNull();
      const c = classify(m);
      expect(c.verdict).not.toBe('blocked');
      expect(c.needsResearchMode).toBe(false);
    }
  });
  it('refuses slots outside the MIDI range', () => {
    expect(() => patchSelect(-1, 10)).toThrow();
    expect(() => patchSelect(1280, 10)).toThrow();
  });
  it('wraps at both ends like the pedal', () => {
    expect(stepSlot(299, 1, 300)).toBe(0);
    expect(stepSlot(0, -1, 300)).toBe(299);
    expect(stepSlot(250, 1, 300)).toBe(251);
  });
});

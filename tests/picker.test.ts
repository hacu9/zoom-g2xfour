import { describe, expect, it } from 'vitest';
import { categoryOf, matches } from '../src/editor/EffectPicker';

const item = { id: 0x08000020, name: 'AnalogDly', category: 'Delay', knobs: 'Time · Mode · Repeat · Mix' };

describe('effect search', () => {
  it('matches every word against name, category or knobs, any case', () => {
    expect(matches(item, 'analog')).toBe(true);
    expect(matches(item, 'delay repeat')).toBe(true);
    expect(matches(item, 'DELAY mix')).toBe(true);
    expect(matches(item, 'delay chorus')).toBe(false);
    expect(matches(item, '')).toBe(true);
  });
  it('maps effect IDs to categories', () => {
    expect(categoryOf(0x08000020)).toBe('Delay');
    expect(categoryOf(0x04000050)).toBe('Amp');
    expect(categoryOf(0x0b000010)).toBe('Pedal');
  });
});

import { describe, expect, it } from 'vitest';
import { parseHex, toAscii, toHex, validateMidiMessage } from '../src/midi/hex';

describe('parseHex', () => {
  it('accepts spaced, comma, 0x and packed forms', () => {
    for (const s of ['F0 52 00 6E F7', 'f0,52,00,6e,f7', '0xF0 0x52 0x00 0x6E 0xF7', 'F052006EF7', 'F0 52\n00 6e f7']) {
      expect(parseHex(s)).toEqual({ ok: true, bytes: [0xf0, 0x52, 0x00, 0x6e, 0xf7] });
    }
  });
  it('rejects junk and odd packed tokens', () => {
    expect(parseHex('').ok).toBe(false);
    expect(parseHex('F0 ZZ').ok).toBe(false);
    expect(parseHex('F05').ok).toBe(false);
  });
});

describe('format', () => {
  it('formats hex and ascii', () => {
    expect(toHex([0, 0x6e, 0xf7])).toBe('00 6E F7');
    expect(toAscii([0x41, 0x00, 0x7f, 0x2e])).toBe('A...');
  });
});

describe('validateMidiMessage', () => {
  it('requires closed SysEx with 7-bit data', () => {
    expect(validateMidiMessage([0xf0, 0x52, 0xf7])).toBeNull();
    expect(validateMidiMessage([0xf0, 0x52])).toMatch(/F7/);
    expect(validateMidiMessage([0xf0, 0x80, 0xf7])).toMatch(/00-7F/);
    expect(validateMidiMessage([0x52])).toMatch(/status/);
  });
});

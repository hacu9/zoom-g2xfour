import { describe, expect, it } from 'vitest';
import { asciiRuns, unpack7to8, zoomBody, zoomSysex } from '../src/midi/zoom';

describe('zoom framing', () => {
  it('builds and splits a message', () => {
    const m = zoomSysex(0x6e, [0x60, 0x29]);
    expect(m).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x60, 0x29, 0xf7]);
    expect(zoomBody(m)).toEqual([0x60, 0x29]);
  });
  it('unpacks 7-bit groups MSB-first: header bit 6 to the first byte', () => {
    expect(unpack7to8([0x40, 0x7f, 0x00])).toEqual([0xff, 0x00]);
    expect(unpack7to8([0x20, 0x00, 0x01])).toEqual([0x00, 0x81]);
    expect(unpack7to8([0x01, 1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5, 6, 0x87]);
    // zoom-explorer comment: 64 12 01 50 06 | 00 50 54 43 46 -> "PTCF"
    expect(String.fromCharCode(...unpack7to8([0x00, 0x50, 0x54, 0x43, 0x46]))).toBe('PTCF');
  });
  it('finds ASCII runs', () => {
    expect(asciiRuns([0, 0x41, 0x42, 0x43, 0, 0x44])).toEqual(['ABC']);
  });
});

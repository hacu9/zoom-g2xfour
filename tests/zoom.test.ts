import { describe, expect, it } from 'vitest';
import { asciiRuns, unpack7to8, zoomBody, zoomSysex } from '../src/midi/zoom';

describe('zoom framing', () => {
  it('builds and splits a message', () => {
    const m = zoomSysex(0x6e, [0x60, 0x29]);
    expect(m).toEqual([0xf0, 0x52, 0x00, 0x6e, 0x60, 0x29, 0xf7]);
    expect(zoomBody(m)).toEqual([0x60, 0x29]);
  });
  it('unpacks 7-bit groups, bit 0 of the header to the first byte', () => {
    expect(unpack7to8([0x01, 0x7f, 0x00])).toEqual([0xff, 0x00]);
    expect(unpack7to8([0x02, 0x00, 0x01])).toEqual([0x00, 0x81]);
    expect(unpack7to8([0x00, 1, 2, 3, 4, 5, 6, 7, 0x7f, 0x7f])).toEqual([1, 2, 3, 4, 5, 6, 7, 0xff]);
  });
  it('finds ASCII runs', () => {
    expect(asciiRuns([0, 0x41, 0x42, 0x43, 0, 0x44])).toEqual(['ABC']);
  });
});

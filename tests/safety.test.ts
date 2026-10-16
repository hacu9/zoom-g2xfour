import { describe, expect, it } from 'vitest';
import { READ_COMMANDS } from '../src/midi/commands';
import { IDENTITY_REQUEST } from '../src/midi/identity';
import { classify } from '../src/midi/safety';
import { zoomSysex } from '../src/midi/zoom';

const z = (...b: number[]) => zoomSysex(0x6e, b);

describe('classify', () => {
  it('allows the identity request and every catalog command', () => {
    expect(classify(IDENTITY_REQUEST).verdict).toBe('read');
    for (const c of READ_COMMANDS) expect(classify(z(...c.body)).verdict, c.label).toBe('read');
  });
  it('allows catalog commands under any device ID', () => {
    expect(classify(zoomSysex(0x5f, [0x60, 0x29])).verdict).toBe('read');
  });
  it('hard-blocks 64 47 (new patch) even with extra bytes', () => {
    expect(classify(z(0x64, 0x47)).verdict).toBe('blocked');
    expect(classify(z(0x64, 0x47, 0x00)).verdict).toBe('blocked');
  });
  it('hard-blocks 60 xx file ops outside the read set', () => {
    for (const op of [0x20, 0x21, 0x22, 0x24, 0x28, 0x2a]) expect(classify(z(0x60, op, 0x00)).verdict).toBe('blocked');
  });
  it('blocks long payloads, foreign and universal SysEx', () => {
    expect(classify(z(0x64, 0x01, ...new Array(60).fill(0))).verdict).toBe('blocked');
    expect(classify([0xf0, 0x41, 0x10, 0x42, 0xf7]).verdict).toBe('blocked');
    expect(classify([0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]).verdict).toBe('blocked');
  });
  it('a near-miss of a read command is unknown and needs research mode', () => {
    const c = classify(z(0x64, 0x02, 0x00, 0x07, 0x01));
    expect(c.verdict).toBe('unknown');
    expect(c.needsResearchMode).toBe(true);
  });
  it('channel messages are unknown but do not need research mode', () => {
    const c = classify([0xc0, 0x05]);
    expect(c.verdict).toBe('unknown');
    expect(c.needsResearchMode).toBe(false);
  });
  it('blocks malformed messages', () => {
    expect(classify([0xf0, 0x52, 0x00]).verdict).toBe('blocked');
  });
});

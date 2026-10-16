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
    const c = classify(z(0x64, 0x02, 0x00, 0x07, 0x02));
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

describe('zoom-explorer documented dangers', () => {
  it('hard-blocks firmware mode, factory reset and patch writes', () => {
    for (const body of [[0x01], [0x04], [0x5b], [0x28, 0x00], [0x45, 0x00, 0x00], [0x64, 0x12, 0x01], [0x32, 0x01]]) {
      expect(classify(z(...body)).verdict, body.join(',')).toBe('blocked');
    }
  });
  it('blocks every undocumented one-byte command, even in research mode', () => {
    for (const cmd of [0x02, 0x06, 0x09, 0x12, 0x52, 0x56, 0x57, 0x5a, 0x7f]) {
      expect(classify(z(cmd)).verdict, cmd.toString(16)).toBe('blocked');
    }
  });
  it('blocks patch-structure and global settings edits (64 20 00 64 xx)', () => {
    expect(classify(z(0x64, 0x20, 0x00, 0x64, 0x09, 0x0b, 0, 0, 0, 0)).verdict).toBe('blocked');
    expect(classify(z(0x64, 0x20, 0x00, 0x64, 0x0f, 0x01, 0, 0, 0, 0)).verdict).toBe('blocked');
  });
  it('allows the documented reads, including shaped ones', () => {
    for (const body of [[0x64, 0x13], [0x33], [0x07], [0x50], [0x51], [0x64, 0x02, 0x00, 0x03, 0x01], [0x46, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00]]) {
      expect(classify(z(...body)).verdict, body.join(',')).toBe('read');
    }
  });
  it('a plain parameter edit stays unknown (research mode only)', () => {
    const c = classify(z(0x64, 0x20, 0x00, 0x01, 0x02, 0x10, 0x00, 0, 0, 0));
    expect(c.verdict).toBe('unknown');
    expect(c.needsResearchMode).toBe(true);
  });
});

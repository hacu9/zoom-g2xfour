import { describe, expect, it } from 'vitest';
import { parseIdentityReply } from '../src/midi/identity';

describe('parseIdentityReply', () => {
  it('decodes a Zoom-style reply', () => {
    const r = parseIdentityReply([0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x6e, 0x00, 0x01, 0x00, 0x31, 0x2e, 0x30, 0x30, 0xf7])!;
    expect(r.manufacturerName).toBe('Zoom Corporation');
    expect(r.zoomDeviceId).toBe(0x6e);
    expect(r.member).toBe(1);
    expect(r.versionAscii).toBe('1.00');
  });
  it('handles 3-byte manufacturer IDs and reports no Zoom ID', () => {
    const r = parseIdentityReply([0xf0, 0x7e, 0x10, 0x06, 0x02, 0x00, 0x20, 0x33, 0x01, 0x02, 0x03, 0x04, 0, 0, 0, 0, 0xf7])!;
    expect(r.manufacturer).toEqual([0x00, 0x20, 0x33]);
    expect(r.family).toBe(1 | (2 << 7));
    expect(r.zoomDeviceId).toBeNull();
  });
  it('rejects non-identity messages', () => {
    expect(parseIdentityReply([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])).toBeNull();
  });
});

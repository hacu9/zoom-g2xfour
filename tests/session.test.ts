import { describe, expect, it } from 'vitest';
import { listFiles } from '../src/midi/fileList';
import { isIdentityReply, IDENTITY_REQUEST, parseIdentityReply } from '../src/midi/identity';
import { createMockBackend } from '../src/midi/mock';
import { ProbeSession, SafetyError } from '../src/midi/session';
import { zoomSysex } from '../src/midi/zoom';

function setup() {
  const b = createMockBackend(1);
  const sent: number[][] = [];
  const received: Uint8Array[] = [];
  const input = b.inputs().find((p) => p.name.includes('ZOOM'))!;
  const rawOut = b.outputs().find((p) => p.name.includes('ZOOM'))!;
  const output = { ...rawOut, send: (bytes: number[]) => (sent.push(bytes), rawOut.send(bytes)) };
  const session = new ProbeSession(input, output, { onIn: (d) => received.push(d), onOut: () => {} });
  return { session, sent, received };
}

describe('ProbeSession against the mock pedal', () => {
  it('round-trips the identity request', async () => {
    const { session } = setup();
    const reply = await session.request(IDENTITY_REQUEST, 'id', isIdentityReply, 200);
    expect(parseIdentityReply(reply!)?.zoomDeviceId).toBe(0x6e);
  });

  it('never puts a blocked message on the wire', () => {
    const { session, sent } = setup();
    expect(() => session.send(zoomSysex(0x6e, [0x64, 0x47]), 'x', { researchMode: true })).toThrow(SafetyError);
    expect(() => session.send(zoomSysex(0x6e, [0x60, 0x24, 0x00]), 'x', { researchMode: true })).toThrow(SafetyError);
    expect(sent).toHaveLength(0);
  });

  it('refuses unknown Zoom commands unless research mode is on', () => {
    const { session, sent } = setup();
    // 05 is documented as harmless but not on the read list: unknown, research only.
    const edit = zoomSysex(0x6e, [0x05]);
    expect(() => session.send(edit, 'x')).toThrow(/Research mode/);
    expect(sent).toHaveLength(0);
    session.send(edit, 'x', { researchMode: true });
    expect(sent).toHaveLength(1);
  });

  it('times out to null when nothing answers', async () => {
    const { session } = setup();
    const reply = await session.request(zoomSysex(0x5f, [0x60, 0x29]), 'wrong id', () => true, 30);
    expect(reply).toBeNull();
  });

  it('lists files and always closes the search with 60 27', async () => {
    const { session, sent } = setup();
    const r = await listFiles(session, 0x6e, { timeoutMs: 200 });
    expect(r.entries.map((e) => e.name)).toEqual(['AMP_ZCLN.ZDL', 'COMP.ZDL', 'TUBESCRM.ZDL', 'ANLGDLY.ZDL', 'HALL.ZDL']);
    expect(r.stopReason).toMatch(/no file name/);
    expect(sent.at(-1)).toEqual(zoomSysex(0x6e, [0x60, 0x27]));
  });

  it('stops the listing on timeout when the ID is wrong', async () => {
    const { session, sent } = setup();
    const r = await listFiles(session, 0x5f, { timeoutMs: 20 });
    expect(r.entries).toHaveLength(0);
    expect(r.stopReason).toMatch(/No reply/);
    expect(sent.at(-1)).toEqual(zoomSysex(0x5f, [0x60, 0x27]));
  });
});

describe('ProbeSession lifecycle (C2)', () => {
  it('a blocked request rejects instead of hanging', async () => {
    const { session } = setup();
    await expect(session.request(zoomSysex(0x6e, [0x64, 0x47]), 'x', () => true, 50)).rejects.toThrow(SafetyError);
  });
});

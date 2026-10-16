import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotate } from '../src/midi/annotate';
import { autoSelect, requestWebMidi } from '../src/midi/backend';
import { parseIdentityReply } from '../src/midi/identity';
import { classify } from '../src/midi/safety';
import { exportText } from '../src/log/log';

describe('one message per send (S1)', () => {
  it('blocks a write that rides behind a channel or realtime message', () => {
    for (const bytes of [
      [0xc0, 0x05, 0xf0, 0x52, 0x00, 0x6e, 0x64, 0x47, 0xf7],
      [0xf8, 0xf0, 0x52, 0x00, 0x6e, 0x60, 0x24, 0x00, 0xf7],
      [0xf0, 0x52, 0x00, 0x6e, 0x60, 0x29, 0xf7, 0xf0, 0x52, 0x00, 0x6e, 0x64, 0x47, 0xf7],
      [0xb0, 0x07, 0x7f, 0xc0, 0x01],
    ]) expect(classify(bytes).verdict, bytes.join(',')).toBe('blocked');
  });
  it('still accepts single well-formed channel messages', () => {
    expect(classify([0xc0, 0x05]).verdict).toBe('unknown');
    expect(classify([0xb0, 0x07, 0x7f]).verdict).toBe('unknown');
    expect(classify([0xc0]).verdict).toBe('blocked');
  });
});

describe('file-op block (S3)', () => {
  it('blocks a bare 60 body', () => {
    expect(classify([0xf0, 0x52, 0x00, 0x6e, 0x60, 0xf7]).verdict).toBe('blocked');
  });
});

describe('identity parser (C5)', () => {
  it('rejects a short reply instead of reading F7 as a version byte', () => {
    expect(parseIdentityReply([0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x6e, 0x00, 0x00, 0x00, 0x31, 0x2e, 0x30, 0xf7, 0xf7])).toBeNull();
  });
});

describe('autoSelect', () => {
  it('matches ZOOM or G2 case-insensitively and skips disconnected ports', () => {
    const ports = [
      { name: 'Keyboard', state: 'connected' },
      { name: 'ZOOM G Series', state: 'disconnected' },
      { name: 'g2x four MIDI 1', state: 'connected' },
    ];
    expect(autoSelect(ports)?.name).toBe('g2x four MIDI 1');
    expect(autoSelect([{ name: 'Keyboard', state: 'connected' }])).toBeUndefined();
  });
});

describe('exportText / annotate', () => {
  it('writes header, hex, ascii and notes', () => {
    const txt = exportText(
      [{ seq: 1, wall: new Date(0), rel: 1.5, dir: 'in', bytes: [0xf0, 0x41, 0xf7], text: '', notes: ['n1'] }],
      { backend: 'mock' },
    );
    expect(txt).toContain('# backend: mock');
    expect(txt).toContain('F0 41 F7');
    expect(txt).toContain('ascii: .A.');
    expect(txt).toContain('    n1');
  });
  it('annotates Zoom SysEx and file names', () => {
    const notes = annotate([0xf0, 0x52, 0x00, 0x6e, 0x60, 0x04, 0x41, 0x42, 0x43, 0xf7]);
    expect(notes[0]).toContain('ID 6E');
    expect(notes.join(' ')).toContain('"ABC"');
  });
});

describe('requestWebMidi (requirement 1, C1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeAccess() {
    const mk = (id: string, name: string) => ({
      id, name, manufacturer: 'Zoom', state: 'connected', connection: 'closed',
      open: vi.fn(async () => {}), close: vi.fn(async () => {}),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), send: vi.fn(),
    });
    return {
      sysexEnabled: true,
      inputs: new Map([['i1', mk('i1', 'ZOOM G2X FOUR')]]),
      outputs: new Map([['o1', mk('o1', 'ZOOM G2X FOUR')]]),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
  }

  it('asks for sysex and returns the SAME wrapper objects on every call', async () => {
    const access = fakeAccess();
    const request = vi.fn(async () => access);
    vi.stubGlobal('navigator', { requestMIDIAccess: request });
    vi.stubGlobal('window', { isSecureContext: true });
    const b = await requestWebMidi();
    expect(request).toHaveBeenCalledWith({ sysex: true });
    expect(b.inputs()[0]).toBe(b.inputs()[0]);
    expect(b.outputs()[0]).toBe(b.outputs()[0]);
  });

  it('maps a permission denial to a readable error', async () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => { throw new DOMException('no', 'SecurityError'); } });
    vi.stubGlobal('window', { isSecureContext: true });
    await expect(requestWebMidi()).rejects.toThrow(/permission denied/);
  });
});

describe('real G2X FOUR identity reply (captured 2026-10-15)', () => {
  const reply = [0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x6e, 0x00, 0x1c, 0x00, 0x31, 0x2e, 0x30, 0x30, 0xf7];
  it('decodes family 6E, member 1C and names the model', () => {
    const id = parseIdentityReply(reply)!;
    expect(id.zoomDeviceId).toBe(0x6e);
    expect(id.member).toBe(0x1c);
    expect(annotate(reply).join(' ')).toContain('G2 FOUR / G2X FOUR');
  });
});

describe('port open/close ordering (hot-reload race)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a close() followed by open() ends with the port open', async () => {
    let open = false;
    const port = {
      id: 'i1', name: 'ZOOM G2X FOUR', manufacturer: 'Zoom', state: 'connected',
      // close is slow, open is fast: without ordering, the close lands last.
      close: () => new Promise<void>((r) => setTimeout(() => { open = false; r(); }, 30)),
      open: () => new Promise<void>((r) => setTimeout(() => { open = true; r(); }, 1)),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => ({ sysexEnabled: true, inputs: new Map([['i1', port]]), outputs: new Map(), addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    vi.stubGlobal('window', { isSecureContext: true });
    const b = await requestWebMidi();
    const w = b.inputs()[0];
    const c = w.close();
    const o = w.open();
    await Promise.all([c, o]);
    expect(open).toBe(true);
  });
});

import type { InputPort, MidiBackend, OutputPort } from './backend';

const noopOpen = { open: async () => {}, close: async () => {} };
import { IDENTITY_REQUEST } from './identity';
import { isZoomSysex, zoomBody } from './zoom';

/**
 * A fake pedal for UI testing without hardware. EVERY reply here is invented,
 * except 64 11, which copies the G1 FOUR reply from zoom-zt2 issue #46.
 * Never treat mock output as evidence about the G2X FOUR.
 */
const MOCK_FILES = ['AMP_ZCLN.ZDL', 'COMP.ZDL', 'TUBESCRM.ZDL', 'ANLGDLY.ZDL', 'HALL.ZDL'];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

export function mockReply(bytes: number[], state: { fileIndex: number }): number[] | null {
  if (bytes.length === IDENTITY_REQUEST.length && bytes.every((b, i) => b === IDENTITY_REQUEST[i])) {
    return [0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x6e, 0x00, 0x00, 0x00, ...ascii('1.00'), 0xf7];
  }
  if (!isZoomSysex(bytes) || bytes[3] !== 0x6e) return null;
  const body = zoomBody(bytes);
  const z = (...b: number[]) => [0xf0, 0x52, 0x00, 0x6e, ...b, 0xf7];
  const [c0, c1] = body;

  if (c0 === 0x60 && c1 === 0x29) return z(0x60, 0x04, 0x00, 0x00, 0x54, 0x7b, 0x2c, 0x02, 0x00, 0x34, 0x2f, 0x58, 0x00);
  if (c0 === 0x60 && (c1 === 0x25 || c1 === 0x26)) {
    if (c1 === 0x25) state.fileIndex = 0;
    const name = MOCK_FILES[state.fileIndex++];
    return name ? z(0x60, 0x04, 0x00, 0x00, ...ascii(name), 0x00) : z(0x60, 0x04, 0x01, 0x00);
  }
  if (c0 === 0x60 && c1 === 0x27) return z(0x60, 0x04, 0x00, 0x00);
  if (c0 === 0x64 && c1 === 0x02) return z(0x64, 0x01, 0x00, 0x07, 0x00, ...ascii('MOCK PATCH'), 0x00, 0x00);
  if (c0 === 0x64 && c1 === 0x42) return z(0x64, 0x43, 0x01, 0x01, 0x00, 0x00);
  if (c0 === 0x64 && c1 === 0x11) return z(0x64, 0x10, 0x66, 0x01, 0x04, 0x01, 0x00);
  if (c0 === 0x55) return z(0x54, 0x20, 0x00, 0x00);
  return null;
}

export function createMockBackend(latencyMs = 15): MidiBackend {
  const listeners = new Set<(data: Uint8Array, ts: number) => void>();
  const state = { fileIndex: 0 };

  const zoomIn: InputPort = {
    id: 'mock-in',
    name: 'ZOOM G2X FOUR (MOCK)',
    manufacturer: 'mock',
    state: 'connected',
    ...noopOpen,
    listen(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const otherIn: InputPort = { id: 'mock-other-in', name: 'Some Keyboard (MOCK)', manufacturer: 'mock', state: 'connected', ...noopOpen, listen: () => () => {} };
  const zoomOut: OutputPort = {
    id: 'mock-out',
    name: 'ZOOM G2X FOUR (MOCK)',
    manufacturer: 'mock',
    state: 'connected',
    ...noopOpen,
    send(bytes) {
      const reply = mockReply(bytes, state);
      if (!reply) return;
      setTimeout(() => {
        const data = new Uint8Array(reply);
        listeners.forEach((l) => l(data, performance.now()));
      }, latencyMs);
    },
  };
  const otherOut: OutputPort = { id: 'mock-other-out', name: 'Microsoft GS Wavetable Synth (MOCK)', manufacturer: 'mock', state: 'connected', ...noopOpen, send: () => {} };

  return {
    kind: 'mock',
    sysexEnabled: true,
    inputs: () => [otherIn, zoomIn],
    outputs: () => [otherOut, zoomOut],
    onChange: () => () => {},
  };
}

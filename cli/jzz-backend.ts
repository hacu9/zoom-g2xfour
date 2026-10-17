import JZZ from 'jzz';
import type { InputPort, MidiBackend, OutputPort } from '../src/midi/backend';

/**
 * The app's port interface over jzz, a Web MIDI shim for Node. Its inputs have
 * only onmidimessage (no addEventListener), so one handler fans out to every
 * listener.
 */
export async function requestJzzMidi(): Promise<MidiBackend> {
  const access = await JZZ.requestMIDIAccess({ sysex: true });
  const inputs = [...access.inputs.values()].map((p): InputPort => {
    const listeners = new Set<(data: Uint8Array, ts: number) => void>();
    return {
      id: p.id,
      name: p.name,
      manufacturer: p.manufacturer,
      get state() {
        return p.state;
      },
      open: async () => void (await p.open()),
      close: async () => void (await p.close()),
      listen(cb) {
        listeners.add(cb);
        p.onmidimessage = (ev) => listeners.forEach((l) => l(ev.data, ev.timeStamp));
        return () => {
          listeners.delete(cb);
          if (listeners.size === 0) p.onmidimessage = null;
        };
      },
    };
  });
  const outputs = [...access.outputs.values()].map(
    (p): OutputPort => ({
      id: p.id,
      name: p.name,
      manufacturer: p.manufacturer,
      get state() {
        return p.state;
      },
      open: async () => void (await p.open()),
      close: async () => void (await p.close()),
      send: (bytes) => p.send(bytes),
    }),
  );
  return { kind: 'webmidi', sysexEnabled: access.sysexEnabled, inputs: () => inputs, outputs: () => outputs, onChange: () => () => {} };
}

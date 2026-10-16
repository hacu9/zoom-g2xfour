/** Thin port abstraction so the real Web MIDI API and the mock pedal share one interface. */
export interface InputPort {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  listen(cb: (data: Uint8Array, timeStamp: number) => void): () => void;
}

export interface OutputPort {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  send(bytes: number[]): void;
}

export interface MidiBackend {
  kind: 'webmidi' | 'mock';
  sysexEnabled: boolean;
  inputs(): InputPort[];
  outputs(): OutputPort[];
  onChange(cb: () => void): () => void;
}

export const AUTO_SELECT = /zoom|g2/i;

export function autoSelect<T extends { name: string; state: string }>(ports: T[]): T | undefined {
  return ports.find((p) => AUTO_SELECT.test(p.name) && p.state !== 'disconnected');
}

export class MidiUnavailableError extends Error {}

export async function requestWebMidi(): Promise<MidiBackend> {
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    throw new MidiUnavailableError('This browser has no Web MIDI API. Use desktop Chrome or Edge.');
  }
  if (!window.isSecureContext) {
    throw new MidiUnavailableError('Web MIDI needs a secure context. Open the page via http://localhost or https.');
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess({ sysex: true });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'SecurityError' || name === 'NotAllowedError') {
      throw new MidiUnavailableError(
        'MIDI/SysEx permission denied. Click the site-settings icon in the address bar, allow "MIDI device control & reprogram", then reload.',
      );
    }
    throw e;
  }

  const wrapInput = (p: MIDIInput): InputPort => ({
    id: p.id,
    name: p.name ?? '(unnamed)',
    manufacturer: p.manufacturer ?? '',
    state: p.state,
    listen(cb) {
      const handler = (ev: Event) => {
        const me = ev as MIDIMessageEvent;
        if (me.data) cb(me.data, me.timeStamp);
      };
      // addEventListener does not open the port implicitly (onmidimessage would); open it explicitly.
      void p.open();
      p.addEventListener('midimessage', handler);
      return () => p.removeEventListener('midimessage', handler);
    },
  });
  const wrapOutput = (p: MIDIOutput): OutputPort => ({
    id: p.id,
    name: p.name ?? '(unnamed)',
    manufacturer: p.manufacturer ?? '',
    state: p.state,
    send: (bytes) => p.send(bytes),
  });

  return {
    kind: 'webmidi',
    sysexEnabled: access.sysexEnabled,
    inputs: () => Array.from(access.inputs.values(), wrapInput),
    outputs: () => Array.from(access.outputs.values(), wrapOutput),
    onChange(cb) {
      access.addEventListener('statechange', cb);
      return () => access.removeEventListener('statechange', cb);
    },
  };
}

/** Thin port abstraction so the real Web MIDI API and the mock pedal share one interface. */
interface PortBase {
  id: string;
  name: string;
  manufacturer: string;
  readonly state: string;
  /** Rejects when the OS will not give us the port (Windows: another app holds it). */
  open(): Promise<void>;
  close(): Promise<void>;
}

export interface InputPort extends PortBase {
  listen(cb: (data: Uint8Array, timeStamp: number) => void): () => void;
}

export interface OutputPort extends PortBase {
  send(bytes: number[]): void;
}

export interface MidiBackend {
  kind: 'webmidi' | 'mock';
  sysexEnabled: boolean;
  inputs(): InputPort[];
  outputs(): OutputPort[];
  /** cb gets a short description, e.g. 'output "ZOOM G2/G2X FOUR" connected/open'. */
  onChange(cb: (what: string) => void): () => void;
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

  // One wrapper per port id, so a statechange (which Chrome also fires when a
  // port merely opens) never hands React new objects and never tears down a session.
  const cache = new Map<string, InputPort | OutputPort>();
  const base = (p: MIDIPort) => ({
    id: p.id,
    name: p.name ?? '(unnamed)',
    manufacturer: p.manufacturer ?? '',
    get state() {
      return p.state;
    },
    open: async () => {
      await p.open();
    },
    close: async () => {
      await p.close();
    },
  });
  const wrapInput = (p: MIDIInput): InputPort => {
    const hit = cache.get(p.id);
    if (hit) return hit as InputPort;
    const w: InputPort = {
      ...base(p),
      get state() {
        return p.state;
      },
      listen(cb) {
        const handler = (ev: Event) => {
          const me = ev as MIDIMessageEvent;
          if (me.data) cb(me.data, me.timeStamp);
        };
        // addEventListener does not open the port implicitly (onmidimessage would); the session opens it.
        p.addEventListener('midimessage', handler);
        return () => p.removeEventListener('midimessage', handler);
      },
    };
    cache.set(p.id, w);
    return w;
  };
  const wrapOutput = (p: MIDIOutput): OutputPort => {
    const hit = cache.get(p.id);
    if (hit) return hit as OutputPort;
    const w: OutputPort = {
      ...base(p),
      get state() {
        return p.state;
      },
      send: (bytes) => p.send(bytes),
    };
    cache.set(p.id, w);
    return w;
  };

  return {
    kind: 'webmidi',
    sysexEnabled: access.sysexEnabled,
    inputs: () => Array.from(access.inputs.values(), wrapInput),
    outputs: () => Array.from(access.outputs.values(), wrapOutput),
    onChange(cb) {
      // Fires on plug/unplug AND whenever a port opens or closes.
      const handler = (ev: Event) => {
        const p = (ev as MIDIConnectionEvent).port;
        cb(p ? `${p.type} "${p.name}" ${p.state}/${p.connection}` : 'unknown port');
      };
      access.addEventListener('statechange', handler);
      return () => access.removeEventListener('statechange', handler);
    },
  };
}

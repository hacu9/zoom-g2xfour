/** The part of jzz's Web MIDI shim that the CLI uses. jzz is installed next to the bundle on Windows, not in this repo. */
declare module 'jzz' {
  interface JzzPort {
    id: string;
    name: string;
    manufacturer: string;
    state: string;
    open(): Promise<unknown>;
    close(): Promise<unknown>;
  }
  interface JzzInput extends JzzPort {
    onmidimessage: ((ev: { data: Uint8Array; timeStamp: number }) => void) | null;
  }
  interface JzzOutput extends JzzPort {
    send(data: number[]): void;
  }
  interface JzzAccess {
    sysexEnabled: boolean;
    inputs: Map<string, JzzInput>;
    outputs: Map<string, JzzOutput>;
  }
  const JZZ: { requestMIDIAccess(opts: { sysex: boolean }): Promise<JzzAccess> };
  export default JZZ;
}

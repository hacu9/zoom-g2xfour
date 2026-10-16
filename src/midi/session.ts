import type { InputPort, OutputPort } from './backend';
import { classify, type Classification } from './safety';

export interface SessionEvents {
  onIn(data: Uint8Array, timeStamp: number): void;
  onOut(bytes: number[], cls: Classification, label: string): void;
}

export class SafetyError extends Error {}

/** One input + one output, with the safety gate in front of every send. */
export class ProbeSession {
  private waiters = new Set<(data: Uint8Array) => boolean>();
  private unlisten: () => void;

  constructor(
    private input: InputPort,
    private output: OutputPort,
    private events: SessionEvents,
  ) {
    this.unlisten = input.listen((data, ts) => {
      this.events.onIn(data, ts);
      for (const w of [...this.waiters]) if (w(data)) this.waiters.delete(w);
    });
  }

  get portNames() {
    return { input: this.input.name, output: this.output.name };
  }

  /**
   * The only path to the output port. Blocked messages never leave; unknown
   * Zoom commands leave only when the caller passes researchMode.
   */
  send(bytes: number[], label: string, opts: { researchMode?: boolean } = {}): Classification {
    const cls = classify(bytes);
    if (cls.verdict === 'blocked') throw new SafetyError(cls.reason);
    if (cls.needsResearchMode && !opts.researchMode) {
      throw new SafetyError(`Research mode is off. ${cls.reason}`);
    }
    this.output.send(bytes);
    this.events.onOut(bytes, cls, label);
    return cls;
  }

  /** Send, then resolve with the first incoming message that matches, or null on timeout. */
  request(
    bytes: number[],
    label: string,
    match: (data: Uint8Array) => boolean,
    timeoutMs = 1000,
  ): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const waiter = (data: Uint8Array) => {
        if (!match(data)) return false;
        clearTimeout(timer);
        resolve(data);
        return true;
      };
      this.waiters.add(waiter);
      timer = setTimeout(() => {
        this.waiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      try {
        this.send(bytes, label);
      } catch (e) {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        reject(e);
      }
    });
  }

  /** Open both ports up front, so the first send() does not trigger an implicit open. */
  open(): Promise<void> {
    return Promise.all([this.input.open(), this.output.open()]).then(() => undefined);
  }

  /** Release the ports so other apps (Handy Guitar Lab) can use them again. */
  close() {
    this.unlisten();
    this.waiters.clear();
    void this.input.close().catch(() => {});
    void this.output.close().catch(() => {});
  }
}

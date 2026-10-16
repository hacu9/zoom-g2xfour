/**
 * Expression pedal as a remote control for the recorder.
 *
 * The protocol doc has no verified fact about what the G2X FOUR sends over
 * USB when the expression pedal moves. So the app learns it: the user moves
 * the pedal, and the first message that looks like a control is kept as the
 * pedal's signature. Two shapes are possible:
 *  - a Control Change (Bn cc vv), or
 *  - a Zoom edit report (64 20 00|01 <slot> <param> <value: septets>) for the
 *    knob that the pedal drives in the current patch.
 */

export interface PedalSignature {
  kind: 'cc' | 'zoom';
  /** Bytes that stay the same while the pedal moves. */
  key: string;
  label: string;
}

export interface PedalReading {
  sig: PedalSignature;
  value: number;
}

const hex = (b: number) => b.toString(16).padStart(2, '0').toUpperCase();

/** Reads a pedal-like control from one MIDI message, or null. */
export function readControl(d: Uint8Array): PedalReading | null {
  if (d.length === 3 && (d[0] & 0xf0) === 0xb0) {
    // CC 0 and 32 are Bank Select: the pedal echoes them on every patch change.
    if (d[1] === 0x00 || d[1] === 0x20) return null;
    const ch = (d[0] & 0x0f) + 1;
    return { sig: { kind: 'cc', key: `cc:${d[0]}:${d[1]}`, label: `CC ${d[1]} (channel ${ch})` }, value: d[2] };
  }
  // F0 52 00 6E 64 20 <00|01> <slot> <param> <value…> F7
  if (d.length >= 11 && d[0] === 0xf0 && d[1] === 0x52 && d[3] === 0x6e && d[4] === 0x64 && d[5] === 0x20 && d[6] <= 0x01) {
    const slot = d[7];
    const param = d[8];
    // 5F = name, 64 = tempo/global: patch data, not a control. Params 0 and 1 are on/off and the effect id.
    if (slot > 0x05 || param < 2) return null;
    let value = 0;
    for (let i = 9, shift = 0; i < d.length - 1 && shift < 35; i++, shift += 7) value += d[i] * 2 ** shift;
    return {
      sig: { kind: 'zoom', key: `zoom:${slot}:${param}`, label: `effect ${slot + 1}, knob ${param - 1}` },
      value,
    };
  }
  return null;
}

/** A range smaller than this is noise, not a pedal sweep. */
export const MIN_SPAN = 10;

/**
 * Turns pedal readings into a 0–1 position and a "toe down" event.
 * The range is learned from what the pedal sends, also for CC: the first
 * heel-to-toe sweep only calibrates and never fires.
 */
export class PedalTracker {
  private min = Infinity;
  private max = -Infinity;
  private armed = false;

  constructor(readonly sig: PedalSignature) {}

  /** Returns the position, and toe = true once each time the pedal reaches the toe end. */
  feed(r: PedalReading): { position: number; toe: boolean } | null {
    if (r.sig.key !== this.sig.key) return null;
    // A new top is calibration, not a push: disarm until the pedal comes back.
    if (r.value > this.max) this.armed = false;
    this.min = Math.min(this.min, r.value);
    this.max = Math.max(this.max, r.value);
    const span = this.max - this.min;
    const position = span > 0 ? (r.value - this.min) / span : 0;
    if (span < MIN_SPAN) return { position, toe: false };
    // Hysteresis: back below half arms it, then the toe end fires once.
    if (position <= 0.5) this.armed = true;
    const toe = this.armed && position >= 0.95;
    if (toe) this.armed = false;
    return { position, toe };
  }
}

export const describeBytes = (d: Uint8Array) => Array.from(d, hex).join(' ');

/**
 * Metronome timing. Pure: no Web Audio here, so the tests can check every click.
 *
 * A song is a tempo map: sections in order, each with a tempo, a meter and a
 * length in bars. A section with no length loops until the user moves on.
 * A section with `toBpm` ramps linearly from `bpm` to `toBpm` over its beats.
 */

export interface Section {
  name?: string;
  bpm: number;
  /** Beats per bar (the top number of the meter). */
  beats: number;
  /** The note that gets one beat (the bottom number of the meter). Default 4. */
  unit?: number;
  /** Bars in this section. Leave out to loop until "next section". */
  bars?: number;
  /** End tempo for a ramp (accelerando or ritardando). */
  toBpm?: number;
}

export interface Click {
  /** Seconds after the start. */
  time: number;
  section: number;
  bar: number;
  beat: number;
  /** Beat 1 of a bar. */
  accent: boolean;
  bpm: number;
}

/**
 * Click lengths of one bar, in quarter notes. The tempo always counts quarter
 * notes, like Guitar Pro and Songsterr. x/1, x/2, x/4 click every beat; x/8
 * clicks every eighth (6/8 = 6 clicks); x/16 and x/32 click quarters and end on
 * the short rest of the bar (21/32 = 1, 1, 0.625).
 */
export function barPulses(beats: number, unit = 4): number[] {
  if (unit <= 8) return Array.from({ length: beats }, () => 4 / unit);
  const total = (beats * 4) / unit;
  const out = Array.from({ length: Math.floor(total) }, () => 1);
  const rest = total - out.length;
  if (rest > 1e-9) out.push(rest);
  return out;
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

/** Tempo of beat `i` (0-based) of a section with `total` beats: a step-wise linear ramp. */
export function beatBpm(s: Section, i: number, total: number): number {
  if (s.toBpm === undefined || total <= 1) return s.bpm;
  return s.bpm + ((s.toBpm - s.bpm) * i) / (total - 1);
}

/**
 * Walks a tempo map, one click per beat. `next` returns the next click; call
 * `skip()` to jump to the next section at the next bar line.
 * The walk ends after the last section, unless that section loops.
 */
export class ClickWalker {
  private section = 0;
  private bar = 0;
  private beat = 0;
  private time = 0;
  private jumpTo: number | null = null;
  /** Play sections from..to (inclusive) again and again. */
  loop: { from: number; to: number } | null = null;

  constructor(private readonly map: readonly Section[], startSection = 0) {
    this.section = Math.max(0, Math.min(startSection, map.length - 1));
  }

  /** Move on to the next section when the current bar ends. */
  skip(): void {
    this.jumpTo = this.section + 1;
  }

  /** Seconds from the start to the next click. */
  get elapsed(): number {
    return this.time;
  }

  /** Jump to a section when the current bar ends. */
  skipTo(section: number): void {
    this.jumpTo = section;
  }

  next(): Click | null {
    const s = this.map[this.section];
    if (!s) return null;
    const pulses = barPulses(s.beats, s.unit);
    const total = s.bars === undefined ? 0 : s.bars * pulses.length;
    const index = this.bar * pulses.length + this.beat;
    const bpm = s.bars === undefined ? s.bpm : beatBpm(s, index, total);
    const click: Click = { time: this.time, section: this.section, bar: this.bar, beat: this.beat, accent: this.beat === 0, bpm };
    this.time += (pulses[this.beat] * 60) / bpm;
    this.beat++;
    if (this.beat >= pulses.length) {
      this.beat = 0;
      this.bar++;
      if (this.jumpTo !== null) {
        this.section = this.jumpTo;
        this.jumpTo = null;
        this.bar = 0;
      } else if (s.bars !== undefined && this.bar >= s.bars) {
        this.bar = 0;
        this.section = this.loop && this.section === this.loop.to ? this.loop.from : this.section + 1;
      }
    }
    return click;
  }
}

/** Tap tempo: the average of the last taps, reset after a pause of 2 s. */
export function tapBpm(taps: readonly number[]): number | null {
  const recent: number[] = [];
  for (let i = taps.length - 1; i >= 0; i--) {
    if (recent.length && recent[0] - taps[i] > 2000) break;
    recent.unshift(taps[i]);
    if (recent.length === 5) break;
  }
  if (recent.length < 2) return null;
  return clampBpm((60000 * (recent.length - 1)) / (recent[recent.length - 1] - recent[0]));
}

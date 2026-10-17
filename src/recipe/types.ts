/**
 * A "tone recipe" describes a song's chain in device-neutral terms;
 * translate.ts maps it onto real G2X FOUR effects from the catalog and
 * clamps values to their ranges. See docs/recipes.md.
 */
export type NoteValue = '1/1' | '1/2' | '1/4' | '1/4.' | '1/4T' | '1/8' | '1/8.' | '1/8T' | '1/16' | '1/16.' | '1/16T';

/**
 * Optional on every part: `model` picks an exact catalog effect ("MS 800"),
 * `knobs` sets knobs by their catalog name — a number is 0-100 of the knob's
 * range, a string is an exact display value ("ON", "HI").
 */
export interface PartOverrides {
  model?: string;
  knobs?: Record<string, number | string>;
}

export interface ToneRecipe {
  song: string;
  /** Patch name on the pedal, max 14 characters. Defaults to the song. */
  patchName?: string;
  /** Where the settings come from. */
  source?: string;
  artist?: string;
  bpm?: number;
  compressor?: { amount: number } & PartOverrides;
  drive?: { type: 'overdrive' | 'distortion' | 'fuzz' | 'boost'; gain: number; tone?: number } & PartOverrides;
  amp?: { type: 'clean' | 'crunch' | 'high-gain' | 'american' | 'british'; gain?: number } & PartOverrides;
  eq?: { low?: number; mid?: number; high?: number };
  /** Extra effects right after the amp, in order (e.g. a graphic EQ in the amp's loop). */
  afterAmp?: (PartOverrides & { model: string })[];
  modulation?: { type: 'chorus' | 'flanger' | 'phaser' | 'tremolo' | 'vibrato'; rate?: number; depth?: number; mix?: number } & PartOverrides;
  /**
   * Give timeMs, or a note: the delay syncs to the patch tempo (bpm, or the
   * pedal's tempo when bpm is missing). type: digital (clean repeats, default),
   * analog (darker, repeats fade fast), tape.
   */
  delay?: { type?: 'digital' | 'analog' | 'tape'; timeMs?: number; note?: NoteValue; feedback: number; mix: number } & PartOverrides;
  reverb?: { type: 'room' | 'hall' | 'plate' | 'spring'; decay?: number; mix: number } & PartOverrides;
}


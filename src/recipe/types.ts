/**
 * PHASE 2 — design only. A "tone recipe" describes a song's chain in
 * device-neutral terms; translate.ts (not built) maps it onto real
 * G2X FOUR effects from the catalog and clamps values to their ranges.
 */
export type NoteValue = '1/1' | '1/2' | '1/4' | '1/4.' | '1/4T' | '1/8' | '1/8.' | '1/8T' | '1/16' | '1/16.' | '1/16T';

export interface ToneRecipe {
  song: string;
  artist?: string;
  bpm?: number;
  compressor?: { amount: number };
  drive?: { type: 'overdrive' | 'distortion' | 'fuzz' | 'boost'; gain: number; tone?: number };
  amp?: { type: 'clean' | 'crunch' | 'high-gain' | 'american' | 'british'; gain?: number };
  eq?: { low?: number; mid?: number; high?: number };
  modulation?: { type: 'chorus' | 'flanger' | 'phaser' | 'tremolo' | 'vibrato'; rate?: number; depth?: number; mix?: number };
  /** Give either timeMs or note (+ bpm); the delay calculator resolves note -> ms. */
  delay?: { timeMs?: number; note?: NoteValue; feedback: number; mix: number };
  reverb?: { type: 'room' | 'hall' | 'plate' | 'spring'; decay?: number; mix: number };
}

/** What the translator returns: the patch plus every compromise it made. */
export interface TranslationResult<P> {
  patch: P;
  warnings: string[];
}

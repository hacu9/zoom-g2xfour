/** PHASE 2 — design only. Shape of g2x-four.catalog.json. */
export type EffectCategory =
  | 'dynamics' | 'filter' | 'drive' | 'amp' | 'cab' | 'modulation'
  | 'sfx' | 'delay' | 'reverb' | 'pedal' | 'other';

export interface ParamDef {
  name: string;
  min: number;
  max: number;
  default?: number;
  unit?: 'ms' | 'Hz' | 'dB' | '%' | 'note' | '';
  /** For stepped params such as a delay note value. */
  options?: string[];
}

export interface EffectDef {
  /** Stable key, e.g. "TS_DRIVE". */
  id: string;
  /** Name exactly as printed in Zoom's Effects List PDF. */
  name: string;
  category: EffectCategory;
  /** DSP cost if the PDF or the probe reveals it. */
  dspUnits?: number;
  /** Wire-level ID, filled in from probe dumps. Unknown until then. */
  wireId?: number;
  params: ParamDef[];
}

export interface Catalog {
  device: 'G2X FOUR';
  firmware?: string;
  source: string;
  effects: EffectDef[];
}

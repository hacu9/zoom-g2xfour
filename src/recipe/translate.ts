/**
 * ToneRecipe → G2 FOUR plan. Picks effects by name from the catalog and maps
 * recipe values onto each parameter's real value list. Every compromise
 * becomes a warning. The plan holds raw value indices, ready for 64 20 00.
 */
import { effectByName, type CatalogEffect, type CatalogParam } from '../catalog/g2four';
import { NOTE_FACTORS } from '../tempo/delay';
import type { NoteValue, PartOverrides, ToneRecipe } from './types';

export const MAX_SLOTS = 6;
export const MAX_NAME = 14;

export interface PlannedParam {
  index: number;
  name: string;
  value: number;
  display: string;
}
export interface PlannedEffect {
  role: string;
  id: number;
  name: string;
  params: PlannedParam[];
}
export interface Plan {
  name: string;
  /** Patch tempo, set when a delay syncs to BPM. */
  tempo?: number;
  effects: PlannedEffect[];
  warnings: string[];
}

type Target = { pct: number } | { num: number } | { text: string } | { note: NoteValue };

/**
 * The note values after the millisecond range of a G2 FOUR delay Time list,
 * shortest first, in quarter notes (catalog order: 16th, 8th triplet, dotted
 * 16th, 8th, quarter triplet, dotted 8th, quarter, dotted quarter, then x2..x16).
 */
const NOTE_ORDER = [0.25, 1 / 3, 0.375, 0.5, 2 / 3, 0.75, 1, 1.5, ...Array.from({ length: 15 }, (_, i) => i + 2)];

const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);

/** Value index for a target: exact text, nearest number, or a percentage of the numeric range. */
export function resolveValue(p: CatalogParam, t: Target): number | null {
  const vals = p.values.map((v) => v.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))));
  if ('note' in t) {
    const first = vals.findIndex((v) => Number.isNaN(num(v)));
    const k = NOTE_ORDER.findIndex((f) => Math.abs(f - NOTE_FACTORS[t.note]) < 1e-9);
    return first >= 0 && k >= 0 && first + k < vals.length ? first + k : null;
  }
  if ('text' in t) {
    const i = vals.findIndex((v) => v.toUpperCase() === t.text.toUpperCase());
    return i >= 0 ? i : null;
  }
  const numeric = vals.map(num).map((n, i) => ({ n, i })).filter((x) => !Number.isNaN(x.n));
  if (numeric.length === 0) return null;
  const want = 'num' in t ? t.num : numeric[0].n + ((numeric[numeric.length - 1].n - numeric[0].n) * Math.min(100, Math.max(0, t.pct))) / 100;
  return numeric.reduce((best, x) => (Math.abs(x.n - want) < Math.abs(best.n - want) ? x : best)).i;
}

const ROLE_EFFECT = {
  compressor: 'Comp',
  drive: { overdrive: 'TS Drive', distortion: 'DIST One', fuzz: 'NYC Muff', boost: 'RC Drive' },
  amp: { clean: 'FD TWIN-R', crunch: 'UK 30A', 'high-gain': 'RectiDual', american: 'FD DLX-R', british: 'MS 1959' },
  modulation: { chorus: 'ChorusOne', flanger: 'VinFLNGR', phaser: 'Phaser', tremolo: 'Tremolo', vibrato: 'SwellVibe' },
  delay: { digital: 'Delay', analog: 'AnalogDly', tape: 'TapeEcho' },
  reverb: { room: 'RoomREV', hall: 'Hall REV', plate: 'Plate REV', spring: 'SpringREV' },
} as const;

export function translate(r: ToneRecipe): Plan {
  const warnings: string[] = [];
  const effects: PlannedEffect[] = [];
  let tempo: number | undefined;

  const add = (role: string, effectName: string, settings: Record<string, Target | undefined>, part?: PartOverrides) => {
    const fx = effectByName(part?.model ?? effectName);
    if (!fx) {
      warnings.push(`${role}: effect "${part?.model ?? effectName}" not in the catalog — skipped.`);
      return;
    }
    // Explicit knobs win over the generic mapping.
    const all: Record<string, Target | undefined> = { ...settings };
    for (const [k, v] of Object.entries(part?.knobs ?? {})) {
      for (const key of Object.keys(all)) if (key.toUpperCase() === k.toUpperCase()) delete all[key];
      all[k] = typeof v === 'number' ? { pct: v } : { text: v };
    }
    const params = plan(role, fx.effect, all, warnings);
    for (const k of Object.keys(part?.knobs ?? {})) {
      if (!fx.effect.parameters.some((p) => p.name.toUpperCase() === k.toUpperCase())) warnings.push(`${role}: ${fx.effect.name} has no knob "${k}".`);
    }
    effects.push({ role, id: fx.id, name: fx.effect.name, params });
  };

  if (r.compressor) add('compressor', ROLE_EFFECT.compressor, { Sense: { pct: r.compressor.amount } }, r.compressor);
  if (r.drive) add('drive', ROLE_EFFECT.drive[r.drive.type], { Gain: { pct: r.drive.gain }, Drive: { pct: r.drive.gain }, Tone: r.drive.tone === undefined ? undefined : { pct: r.drive.tone } }, r.drive);
  if (r.amp) {
    add('amp', ROLE_EFFECT.amp[r.amp.type], {
      Gain: r.amp.gain === undefined ? undefined : { pct: r.amp.gain },
      Bass: r.eq?.low === undefined ? undefined : { pct: r.eq.low },
      MID: r.eq?.mid === undefined ? undefined : { pct: r.eq.mid },
      Treble: r.eq?.high === undefined ? undefined : { pct: r.eq.high },
    }, r.amp);
  }
  for (const extra of r.afterAmp ?? []) add('after amp', extra.model, {}, extra);
  if (!r.amp && r.eq) warnings.push('eq: no amp in the recipe, and the output EQ has no verified write command — skipped.');
  if (r.modulation) {
    const m = r.modulation;
    add('modulation', ROLE_EFFECT.modulation[m.type], {
      Rate: m.rate === undefined ? undefined : { pct: m.rate },
      Depth: m.depth === undefined ? undefined : { pct: m.depth },
      Mix: m.mix === undefined ? undefined : { pct: m.mix },
    }, m);
  }
  if (r.delay) {
    const d = r.delay;
    const model = ROLE_EFFECT.delay[d.type ?? 'digital'];
    if (d.note) {
      // Sync to the patch tempo, so tap tempo still works live. Without a bpm
      // the patch keeps the pedal's tempo: set it with tap tempo.
      if (r.bpm) tempo = Math.round(r.bpm);
      else warnings.push('delay: no bpm — synced to the pedal tempo; use tap tempo.');
      add('delay', model, { Time: { note: d.note }, Mode: { text: 'BPM SYNC' }, Repeat: { pct: d.feedback }, Mix: { pct: d.mix } }, d);
    } else {
      if (d.timeMs !== undefined) warnings.push('delay: millisecond time with Mode left as the pedal sets it (SHORT/LONG meaning unverified).');
      add('delay', model, { Time: d.timeMs === undefined ? undefined : { num: Math.round(d.timeMs) }, Repeat: { pct: d.feedback }, Mix: { pct: d.mix } }, d);
    }
  }
  if (r.reverb) add('reverb', ROLE_EFFECT.reverb[r.reverb.type], { Decay: r.reverb.decay === undefined ? undefined : { pct: r.reverb.decay }, Mix: { pct: r.reverb.mix } }, r.reverb);

  if (effects.length > MAX_SLOTS) {
    warnings.push(`${effects.length} effects, the pedal has ${MAX_SLOTS} slots — dropped: ${effects.slice(MAX_SLOTS).map((e) => e.name).join(', ')}.`);
    effects.length = MAX_SLOTS;
  }
  const name = (r.patchName ?? r.song).slice(0, MAX_NAME);
  if ((r.patchName ?? r.song).length > MAX_NAME) warnings.push(`name cut to ${MAX_NAME} characters: "${name}".`);
  return { name, tempo, effects, warnings };
}

function plan(role: string, fx: CatalogEffect, settings: Record<string, Target | undefined>, warnings: string[]): PlannedParam[] {
  const out: PlannedParam[] = [];
  for (const [pname, target] of Object.entries(settings)) {
    if (!target) continue;
    const index = fx.parameters.findIndex((p) => p.name.toUpperCase() === pname.toUpperCase());
    if (index < 0) continue; // e.g. "Drive" on an effect that calls it "Gain"
    const value = resolveValue(fx.parameters[index], target);
    if (value === null) {
      warnings.push(`${role}: ${fx.name} ${pname} cannot take ${JSON.stringify(target)}.`);
      continue;
    }
    const display = fx.parameters[index].values[value].replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
    if ('num' in target && Number(display) !== target.num) warnings.push(`${role}: ${fx.name} ${pname} ${target.num} → nearest ${display}.`);
    out.push({ index, name: fx.parameters[index].name, value, display });
  }
  return out;
}

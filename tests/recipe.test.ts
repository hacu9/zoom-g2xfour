import { describe, expect, it } from 'vitest';
import rain from '../src/recipe/recipes/rain-rob-scallon.json';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';
import { delayMs } from '../src/tempo/delay';

describe('delay calculator', () => {
  it('ms = 60000 / BPM × note value', () => {
    expect(delayMs(120, '1/4')).toBe(500);
    expect(delayMs(120, '1/8.')).toBe(375);
    expect(Math.round(delayMs(123, '1/8.'))).toBe(366);
  });
});

describe('Rain (Rob Scallon) plan', () => {
  const plan = translate(rain as ToneRecipe);
  it('builds Comp → FD TWIN-R → Delay → Hall REV', () => {
    expect(plan.effects.map((e) => e.name)).toEqual(['Comp', 'FD TWIN-R', 'Delay', 'Hall REV']);
    expect(plan.name).toBe('Rain Scallon');
  });
  it('syncs the delay: dotted eighth, BPM SYNC, tempo 123, repeat 72, mix 80', () => {
    const d = plan.effects[2].params;
    expect(plan.tempo).toBe(123);
    expect(d.find((p) => p.name === 'Time')?.value).toBe(945);
    expect(d.find((p) => p.name === 'Mode')?.display).toBe('BPM SYNC');
    expect(d.find((p) => p.name === 'Repeat')?.display).toBe('72');
    expect(d.find((p) => p.name === 'Mix')?.display).toBe('80');
  });
  it('scales percentages onto odd ranges (amp 10..100, reverb decay 1..30)', () => {
    expect(plan.effects[1].params.find((p) => p.name === 'Gain')?.display).toBe('32');
    expect(plan.effects[3].params.find((p) => p.name === 'Decay')?.display).toBe('13');
  });
  it('warns when a recipe has more effects than slots', () => {
    const big: ToneRecipe = { song: 'x', compressor: { amount: 1 }, drive: { type: 'overdrive', gain: 1 }, amp: { type: 'clean' }, modulation: { type: 'chorus' }, delay: { timeMs: 300, feedback: 1, mix: 1 }, reverb: { type: 'room', mix: 1 } };
    expect(translate(big).effects).toHaveLength(6);
    expect(translate({ ...big, song: 'A very long patch name' }).warnings.join(' ')).toMatch(/name cut/);
  });
});

describe('note values on the delay Time list', () => {
  it('maps every note to its slot after the ms range', async () => {
    const { effectByName } = await import('../src/catalog/g2four');
    const { resolveValue } = await import('../src/recipe/translate');
    const time = effectByName('AnalogDly')!.effect.parameters[0];
    expect(resolveValue(time, { note: '1/16' })).toBe(940);
    expect(resolveValue(time, { note: '1/8' })).toBe(943);
    expect(resolveValue(time, { note: '1/4' })).toBe(946);
    expect(resolveValue(time, { note: '1/2' })).toBe(948);
    expect(resolveValue(time, { note: '1/1' })).toBe(950);
  });
});

describe('delay type', () => {
  it('maps digital / analog / tape, digital by default', () => {
    const base = { song: 'x', bpm: 120, delay: { note: '1/4' as const, feedback: 50, mix: 50 } };
    expect(translate(base).effects[0].name).toBe('Delay');
    expect(translate({ ...base, delay: { ...base.delay, type: 'analog' } }).effects[0].name).toBe('AnalogDly');
    expect(translate({ ...base, delay: { ...base.delay, type: 'tape' } }).effects[0].name).toBe('TapeEcho');
  });
});

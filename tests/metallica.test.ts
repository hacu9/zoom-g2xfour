import { describe, expect, it } from 'vitest';
import ftbClean from '../src/recipe/recipes/metallica-fade-to-black-clean.json';
import ftbDist from '../src/recipe/recipes/metallica-fade-to-black-dist.json';
import oneClean from '../src/recipe/recipes/metallica-one-clean.json';
import oneDist from '../src/recipe/recipes/metallica-one-dist.json';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';

const plan = (r: unknown) => translate(r as ToneRecipe);
const knob = (p: ReturnType<typeof plan>, fx: string, k: string) => p.effects.find((e) => e.name === fx)?.params.find((x) => x.name === k)?.display;

describe('Metallica recipes', () => {
  it('Fade to Black clean: twin, chorus, quarter delay at 116', () => {
    const p = plan(ftbClean);
    expect(p.effects.map((e) => e.name)).toEqual(['Comp', 'FD TWIN-R', 'ChorusOne', 'Delay', 'Hall REV']);
    expect(p.tempo).toBe(116);
    expect(knob(p, 'FD TWIN-R', 'BRGHT')).toBe('ON');
    expect(p.warnings).toEqual([]);
  });
  it('Fade to Black distorted: TS into MS 800 (JCM800)', () => {
    const p = plan(ftbDist);
    expect(p.effects.map((e) => e.name)).toEqual(['TS Drive', 'MS 800', 'Delay', 'RoomREV']);
    expect(knob(p, 'MS 800', 'Gain')).toBe('70');
    expect(knob(p, 'MS 800', 'PRESENC')).toBe('70');
    expect(knob(p, 'MS 800', 'Input')).toBe('HI');
    expect(knob(p, 'TS Drive', 'VOL')).toBe('85');
    expect(p.warnings).toEqual([]);
  });
  it('One clean and distorted use the Mesa (BG MARK3) and keep the pedal tempo', () => {
    for (const r of [oneClean, oneDist]) {
      const p = plan(r);
      expect(p.effects.some((e) => e.name === 'BG MARK3')).toBe(true);
      expect(p.tempo).toBeUndefined();
      expect(p.warnings).toEqual(['delay: no bpm — synced to the pedal tempo; use tap tempo.']);
    }
    expect(knob(plan(oneDist), 'BG MARK3', 'Gain1')).toBe('80');
    expect(knob(plan(oneClean), 'BG MARK3', 'Treble')).toBe('85');
  });
  it('names fit the pedal (14 characters)', () => {
    for (const r of [ftbClean, ftbDist, oneClean, oneDist]) expect(plan(r).name.length).toBeLessThanOrEqual(14);
  });
  it('warns about a knob the model does not have', () => {
    const p = plan({ song: 'x', amp: { type: 'clean', knobs: { Nope: 5 } } });
    expect(p.warnings.join(' ')).toMatch(/no knob "Nope"/);
  });
});

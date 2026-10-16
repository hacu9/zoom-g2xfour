import { describe, expect, it } from 'vitest';
import ftbClean from '../src/recipe/recipes/metallica-fade-to-black-clean.json';
import ftbDist from '../src/recipe/recipes/metallica-fade-to-black-dist.json';
import oneClean from '../src/recipe/recipes/metallica-one-clean.json';
import oneDist from '../src/recipe/recipes/metallica-one-dist.json';
import mopClean from '../src/recipe/recipes/metallica-master-of-puppets-clean.json';
import mopDist from '../src/recipe/recipes/metallica-master-of-puppets-dist.json';
import tdtncClean from '../src/recipe/recipes/metallica-day-that-never-comes-clean.json';
import tdtncDist from '../src/recipe/recipes/metallica-day-that-never-comes-dist.json';
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
    for (const r of [ftbClean, ftbDist, oneClean, oneDist, mopClean, mopDist, tdtncClean, tdtncDist]) {
      expect(plan(r).name.length).toBeLessThanOrEqual(14);
      expect(plan(r).effects.length).toBeLessThanOrEqual(6);
    }
  });
  it('warns about a knob the model does not have', () => {
    const p = plan({ song: 'x', amp: { type: 'clean', knobs: { Nope: 5 } } });
    expect(p.warnings.join(' ')).toMatch(/no knob "Nope"/);
  });
});

describe('Master of Puppets / The Day That Never Comes', () => {
  it('MoP distorted: TS → Mesa → V-curve GEQ after the amp', () => {
    const p = plan(mopDist);
    expect(p.effects.map((e) => e.name)).toEqual(['TS Drive', 'BG MARK3', 'Gt GEQ 7', 'Delay', 'RoomREV']);
    expect(knob(p, 'Gt GEQ 7', '800Hz')).toBe('-8.0');
    expect(knob(p, 'Gt GEQ 7', '6.4kHz')).toBe('4.0');
    expect(knob(p, 'BG MARK3', 'MID')).toBe('25');
    expect(p.warnings).toEqual(['delay: no bpm — synced to the pedal tempo; use tap tempo.']);
  });
  it('MoP clean, TDTNC clean and distorted build without surprises', () => {
    expect(plan(mopClean).effects.map((e) => e.name)).toEqual(['Comp', 'BG MARK3', 'ChorusOne', 'Delay', 'Hall REV']);
    expect(plan(tdtncClean).effects.map((e) => e.name)).toEqual(['Comp', 'FD TWIN-R', 'StereoCho', 'Delay', 'Plate REV']);
    const d = plan(tdtncDist);
    expect(d.effects.map((e) => e.name)).toEqual(['TS Drive', 'MS 1959', 'Delay', 'RoomREV']);
    expect(knob(d, 'MS 1959', 'Input1')).toBe('85');
    for (const r of [mopClean, tdtncClean, tdtncDist]) expect(plan(r).warnings).toEqual(['delay: no bpm — synced to the pedal tempo; use tap tempo.']);
  });
});

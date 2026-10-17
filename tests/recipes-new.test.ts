import { describe, expect, it } from 'vitest';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';
import { BUILT_IN } from '../src/recipe/builtin';

describe('every built-in recipe', () => {
  it.each(BUILT_IN.map((b) => [b.label, b.recipe] as const))('%s translates with real models and a short name', (_, recipe) => {
    const r = recipe as ToneRecipe;
    const out = translate(r);
    expect(out.name.length).toBeLessThanOrEqual(14);
    expect(out.effects.length).toBeGreaterThan(0);
    expect(out.effects.length).toBeLessThanOrEqual(6);
    expect(r.source, 'every recipe names its source').toBeTruthy();
    // a model the catalog does not have comes back as a warning
    expect(out.warnings.filter((w) => /not in the catalog|has no knob|no gain knob|cannot take|dropped/i.test(w))).toEqual([]);
  });
  it('sets the gain of a Plexi-style amp through Input1', () => {
    const out = translate({ song: 't', amp: { type: 'british', gain: 60 } });
    expect(out.effects[0].name).toBe('MS 1959');
    expect(out.effects[0].params.find((p) => p.name === 'Input1')?.display).toBe('60');
    expect(out.warnings).toEqual([]);
  });
  it('has unique patch names', () => {
    const names = BUILT_IN.map((b) => translate(b.recipe as ToneRecipe).name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('recipe tempo', () => {
  it('clamps a bpm outside the pedal range, with a warning', () => {
    const out = translate({ song: 't', bpm: 260, delay: { note: '1/4', feedback: 20, mix: 20 } });
    expect(out.tempo).toBe(250);
    expect(out.warnings.join(' ')).toMatch(/260 BPM is outside 40-250/);
  });
});

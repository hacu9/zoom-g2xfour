import { describe, expect, it } from 'vitest';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';
import { BUILT_IN } from '../src/editor/RecipePanel';

describe('every built-in recipe', () => {
  it.each(BUILT_IN.map((b) => [b.label, b.recipe] as const))('%s translates with real models and a short name', (_, recipe) => {
    const r = recipe as ToneRecipe;
    const out = translate(r);
    expect(out.name.length).toBeLessThanOrEqual(14);
    expect(out.effects.length).toBeGreaterThan(0);
    expect(out.effects.length).toBeLessThanOrEqual(6);
    expect(r.source, 'every recipe names its source').toBeTruthy();
    // a model the catalog does not have comes back as a warning
    expect(out.warnings.filter((w) => /not in the catalog|has no knob|cannot take|dropped/i.test(w))).toEqual([]);
  });
  it('has unique patch names', () => {
    const names = BUILT_IN.map((b) => translate(b.recipe as ToneRecipe).name);
    expect(new Set(names).size).toBe(names.length);
  });
});

import { BUILT_IN } from '../src/recipe/builtin';
import type { ToneRecipe } from '../src/recipe/types';

export interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

/** `g2x write akfg 264 --verbose` → command, positionals, flags. A flag takes the next word unless that is a flag too. */
export function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) positional.push(a);
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') && VALUE_FLAGS.has(a)) flags.set(a, rest[++i]);
    else flags.set(a, true);
  }
  return { command, positional, flags };
}

const VALUE_FLAGS = new Set(['--confirm', '--out']);

export function parseSlot(text: string | undefined, count = 300): number {
  const n = Number(text);
  if (text === undefined || !/^\d+$/.test(text) || n >= count) throw new Error(`"${text ?? ''}" is not a slot number (0-${count - 1}).`);
  return n;
}

/** A built-in recipe by menu number, patch name or song (case and accents ignored), or null. */
export function findRecipe(query: string): ToneRecipe | null {
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const all = BUILT_IN.map((b) => ({ label: b.label, r: b.recipe as ToneRecipe }));
  if (/^\d+$/.test(query)) return all[Number(query)]?.r ?? null;
  const q = fold(query);
  const exact = all.filter((x) => fold(x.r.patchName ?? '') === q || fold(x.r.song) === q);
  if (exact.length === 1) return exact[0].r;
  const part = all.filter((x) => fold(`${x.r.patchName ?? ''} ${x.label}`).includes(q));
  return part.length === 1 ? part[0].r : null;
}

/** [259, 260, 261, 264] → "259-261, 264". */
export function ranges(slots: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    let j = i;
    while (j + 1 < slots.length && slots[j + 1] === slots[j] + 1) j++;
    out.push(i === j ? `${slots[i]}` : `${slots[i]}-${slots[j]}`);
    i = j;
  }
  return out.join(', ') || 'none';
}

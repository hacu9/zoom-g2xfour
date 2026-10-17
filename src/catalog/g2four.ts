/** G2 FOUR effect + parameter catalog from thammer/zoom-explorer (MIT). See vendor/README.md. */
import raw from './vendor/zoom-explorer-g2four.json';

export interface CatalogParam {
  name: string;
  values: string[];
  max: number;
  default: number;
}
export interface CatalogEffect {
  name: string;
  screenName: string;
  parameters: CatalogParam[];
}

const catalog = raw as unknown as Record<string, CatalogEffect>;

export function effectById(id: number): CatalogEffect | undefined {
  return catalog[id.toString(16).padStart(8, '0')];
}

/** The catalog writes symbols as HTML entities ("&#119135;" = a quarter note). */
export const catalogText = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

export function displayValue(param: CatalogParam | undefined, value: number): string {
  const v = param?.values?.[value];
  return v === undefined ? String(value) : catalogText(v);
}

export const catalogSize = Object.keys(catalog).length;

export function effectByName(name: string): { id: number; effect: CatalogEffect } | undefined {
  for (const [key, effect] of Object.entries(catalog)) {
    if (effect.name.toUpperCase() === name.toUpperCase()) return { id: parseInt(key, 16), effect };
  }
  return undefined;
}

export function allEffects(): { id: number; effect: CatalogEffect }[] {
  return Object.entries(catalog).map(([key, effect]) => ({ id: parseInt(key, 16), effect }));
}

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

export function displayValue(param: CatalogParam | undefined, value: number): string {
  return param?.values?.[value] ?? String(value);
}

export const catalogSize = Object.keys(catalog).length;

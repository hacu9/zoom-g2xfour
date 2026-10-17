import type { NoteValue } from '../recipe/types';

/** Length in quarter notes. */
export const NOTE_FACTORS: Record<NoteValue, number> = {
  '1/1': 4, '1/2': 2, '1/4': 1, '1/4.': 1.5, '1/4T': 2 / 3,
  '1/8': 0.5, '1/8.': 0.75, '1/8T': 1 / 3, '1/16': 0.25, '1/16.': 0.375, '1/16T': 1 / 6,
};

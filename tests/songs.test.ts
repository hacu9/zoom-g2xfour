import { describe, expect, it } from 'vitest';
import { SONGS, findSongSlot, searchSongs } from '../src/songs/songs';
import { BUILT_IN } from '../src/editor/RecipePanel';

describe('songs', () => {
  it('finds songs by title or artist words in any order', () => {
    expect(searchSongs(SONGS, 'fade').map((s) => s.id)).toEqual(['fade-to-black']);
    expect(searchSongs(SONGS, 'metallica black').map((s) => s.id)).toEqual(['fade-to-black']);
    expect(searchSongs(SONGS, 'scallon').map((s) => s.id)).toEqual(['rain']);
    expect(searchSongs(SONGS, 'nothing here')).toEqual([]);
  });
  it('finds the patch on the pedal by name, padded or not', () => {
    const names = new Map([
      [250, 'Rain Scallon  '],
      [252, 'Fade2Black Dst'],
    ]);
    expect(findSongSlot(SONGS.find((s) => s.id === 'rain')!, names)).toEqual({ slot: 250, name: 'Rain Scallon' });
    // the clean patch is missing, so the distorted one is picked
    expect(findSongSlot(SONGS.find((s) => s.id === 'fade-to-black')!, names)).toEqual({ slot: 252, name: 'Fade2Black Dst' });
    expect(findSongSlot(SONGS[0], new Map())).toBeNull();
  });
  it('names only patches that a built-in recipe writes, with the recipe tempo', () => {
    const recipes = BUILT_IN.map((b) => b.recipe as { patchName?: string; song: string; bpm?: number });
    for (const s of SONGS) {
      for (const p of s.patches) {
        const r = recipes.find((x) => (x.patchName ?? x.song) === p);
        expect(r, p).toBeTruthy();
        if (r?.bpm) expect(s.sections[0].bpm, p).toBe(r.bpm);
      }
    }
  });
});

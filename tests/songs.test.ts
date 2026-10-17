import { describe, expect, it } from 'vitest';
import { SONGS, findSongSlot, partsOf, searchSongs } from '../src/songs/songs';
import { BUILT_IN } from '../src/recipe/builtin';

describe('songs', () => {
  it('finds songs by title or artist words in any order', () => {
    expect(searchSongs(SONGS, 'fade').map((s) => s.id)).toEqual(['metallica-fade-to-black']);
    expect(searchSongs(SONGS, 'metallica black').map((s) => s.id)).toEqual(['metallica-blackened', 'metallica-fade-to-black']);
    expect(searchSongs(SONGS, 'scallon').map((s) => s.id)).toEqual(['rob-scallon-rain']);
    expect(searchSongs(SONGS, 'devuelveme').map((s) => s.id)).toEqual(['hombres-g-devuelveme-a-mi-chica']); // accents ignored
    expect(searchSongs(SONGS, 'nothing here')).toEqual([]);
  });
  it('finds the patch on the pedal by name, padded or not', () => {
    const names = new Map([
      [250, 'Rain Scallon  '],
      [252, 'Fade2Black Dst'],
    ]);
    expect(findSongSlot(SONGS.find((s) => s.id === 'rob-scallon-rain')!, names)).toEqual({ slot: 250, name: 'Rain Scallon' });
    // the clean patch is missing, so the distorted one is picked
    expect(findSongSlot(SONGS.find((s) => s.id === 'metallica-fade-to-black')!, names)).toEqual({ slot: 252, name: 'Fade2Black Dst' });
    expect(findSongSlot(SONGS.find((s) => s.id === 'rob-scallon-rain')!, new Map())).toBeNull();
  });
  it('names only patches that a built-in recipe writes', () => {
    const recipes = BUILT_IN.map((b) => b.recipe as { patchName?: string; song: string });
    for (const s of SONGS) for (const p of s.patches) expect(recipes.some((x) => (x.patchName ?? x.song) === p), p).toBe(true);
  });
  it('has a tempo and a meter for every section, and a source for every song', () => {
    for (const s of SONGS) {
      expect(s.source, s.id).toBeTruthy();
      for (const x of s.sections) {
        expect(x.bpm, s.id).toBeGreaterThan(20);
        expect(x.beats, s.id).toBeGreaterThan(0);
        expect([undefined, 1, 2, 4, 8, 16, 32]).toContain(x.unit);
      }
    }
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });
  it('keeps the Fade to Black map from Songsterr: 113, 119 at bar 57, 142 from bar 112', () => {
    const f = SONGS.find((s) => s.id === 'metallica-fade-to-black')!;
    const at = (bar: number) => {
      let n = 0;
      for (const x of f.sections) {
        n += x.bars!;
        if (bar <= n) return x.bpm;
      }
    };
    expect([at(1), at(56), at(57), at(73), at(97), at(112), at(220)]).toEqual([113, 113, 119, 113, 119, 142, 142]);
  });
  it('groups sections into parts by name', () => {
    const parts = partsOf([
      { name: 'Verse', bpm: 212, beats: 4, bars: 3 },
      { name: 'Verse', bpm: 212, beats: 21, unit: 32, bars: 1 },
      { name: 'Chorus', bpm: 212, beats: 4, bars: 8 },
    ]);
    expect(parts).toEqual([
      { name: 'Verse', from: 0, to: 1, bars: 4 },
      { name: 'Chorus', from: 2, to: 2, bars: 8 },
    ]);
  });
});

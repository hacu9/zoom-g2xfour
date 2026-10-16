import type { Section } from '../audio/metronome';

/**
 * Songs for the metronome. Each one carries its tempo map and the patch names
 * that the built-in recipes write, so picking a song can select its patch.
 * Every tempo needs a source in `source`; an unknown tempo stays out.
 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  sections: Section[];
  /** Patch names on the pedal, first one is selected when you pick the song. */
  patches: string[];
  source: string;
}

export const SONGS: Song[] = [
  {
    id: 'rain',
    title: 'Rain',
    artist: 'Rob Scallon',
    sections: [{ bpm: 123, beats: 4 }],
    patches: ['Rain Scallon'],
    source: 'Fan settings for the dotted-eighth delay at 123 BPM (Line 6 CustomTone 3964711, ToneLib forum).',
  },
  {
    id: 'fade-to-black',
    title: 'Fade to Black',
    artist: 'Metallica',
    sections: [{ bpm: 116, beats: 4 }],
    patches: ['Fade2Black Cln', 'Fade2Black Dst'],
    source: 'The tempo of the recipe delay (docs/recipes.md).',
  },
];

/** Search by title or artist, any order of words. */
export function searchSongs(songs: readonly Song[], query: string): Song[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...songs];
  return songs.filter((s) => {
    const hay = `${s.title} ${s.artist}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The slot of the first patch of the song that exists on the pedal. */
export function findSongSlot(song: Song, names: ReadonlyMap<number, string>): { slot: number; name: string } | null {
  for (const want of song.patches) {
    for (const [slot, name] of names) if (name.trimEnd() === want) return { slot, name: want };
  }
  return null;
}

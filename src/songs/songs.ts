import type { Section } from '../audio/metronome';
import maps from './tempo-maps.json';
import { foldText } from '../text';

/**
 * Songs for the metronome. Each one carries its tempo map (sections in the
 * order of the recording) and, when a built-in recipe exists, the patch names
 * it writes, so picking a song can select its patch.
 *
 * tempo-maps.json comes from Songsterr's per-bar data (tempo events, meters,
 * section markers), one song per entry with its Songsterr id and revision.
 * Most maps were checked against the recording length; docs/songs.md has the details.
 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  sections: Section[];
  /** Patch names on the pedal; the first one found is selected. */
  patches: string[];
  source: string;
  url?: string;
  /** Things to know: conflicting sources, half-time, dropped tempo spikes. */
  notes: string[];
}

interface MapEntry {
  id: string;
  title: string;
  artist: string;
  songsterrId: number;
  revision: number;
  sections: Section[];
  notes: string[];
}

/** Patch names written by the built-in recipes, in the order the song needs them. */
const PATCHES: Record<string, string[]> = {
  'metallica-fade-to-black': ['Fade2Black Cln', 'Fade2Black Dst'],
  'metallica-master-of-puppets': ['MoP Dist', 'MoP Clean'],
  'metallica-one': ['One Clean', 'One Dist'],
  'metallica-the-day-that-never-comes': ['TDTNC Clean', 'TDTNC Dist'],
  'metallica-enter-sandman': ['Sandman Clean', 'Sandman Dist'],
  'metallica-nothing-else-matters': ['NEM Clean', 'NEM Dist'],
  'the-strokes-reptilia': ['Reptilia'],
  'scouting-for-girls-this-ain-t-a-love-song': ['Aint LoveSong'],
  'hombres-g-te-quiero': ['Te Quiero'],
  'hombres-g-devuelveme-a-mi-chica': ['Devuelveme'],
  'the-killers-mr-brightside': ['Brightside'],
  'arctic-monkeys-i-bet-you-look-good-on-the-dancefloor': ['Dancefloor'],
  'asian-kung-fu-generation-haruka-kanata': ['AKFG Crunch'],
  'asian-kung-fu-generation-rewrite': ['AKFG Crunch'],
  'akeboshi-wind': ['Wind Acoustic'],
  'maneskin-coraline': ['Coraline Cln', 'Coraline Dst'],
};

const NOTES: Record<string, string[]> = {
  'metallica-fade-to-black': ['The recipe delay uses 116 BPM, a single-number estimate. The song runs at 113, 119 in the choruses, and 142 from the bridge.'],
  'metallica-one': ['The end section is written at 222. That is double time; the same pulse at half speed is 111. Use Tempo 50 % to hear it at 111.'],
  'metallica-master-of-puppets': ['Every 4th bar of the verse riff is 21/32. The click plays it as two quarters and a short pulse, so beat 1 stays on time.'],
  'bon-jovi-this-ain-t-a-love-song': ['Written at 60 BPM. Many players feel it at 120: use Tempo 200 % for that.'],
};

const fromMaps: Song[] = (maps as MapEntry[]).map((m) => ({
  id: m.id,
  title: m.title,
  artist: m.artist,
  sections: m.sections,
  patches: PATCHES[m.id] ?? [],
  source: `Songsterr song ${m.songsterrId}, revision ${m.revision}`,
  url: `https://www.songsterr.com/a/wa/song?id=${m.songsterrId}`,
  notes: [...(NOTES[m.id] ?? []), ...m.notes],
}));

export const SONGS: Song[] = [
  {
    id: 'rob-scallon-rain',
    title: 'Rain',
    artist: 'Rob Scallon',
    sections: [{ name: 'Whole song', bpm: 123, beats: 4 }],
    patches: ['Rain Scallon'],
    source: 'songbpm.com (automatic analysis) and the fan delay settings at 123 BPM (Line 6 CustomTone 3964711).',
    notes: ['Sources disagree: Songsterr writes 120. The Rain patch delay is set for 123.'],
  },
  ...fromMaps,
].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

/** Search by title or artist, any order of words, accents ignored. */
export function searchSongs(songs: readonly Song[], query: string): Song[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...songs];
  return songs.filter((s) => {
    const hay = foldText(`${s.title} ${s.artist}`);
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

/** Consecutive sections with the same name form one part: the unit you jump to and loop. */
export interface Part {
  name: string;
  from: number;
  to: number;
  bars: number | null;
}

export function partsOf(sections: readonly Section[]): Part[] {
  const parts: Part[] = [];
  sections.forEach((s, i) => {
    const name = s.name ?? `Part ${parts.length + 1}`;
    const last = parts[parts.length - 1];
    if (last && last.name === name) {
      last.to = i;
      last.bars = last.bars === null || s.bars === undefined ? null : last.bars + s.bars;
    } else parts.push({ name, from: i, to: i, bars: s.bars ?? null });
  });
  return parts;
}

/** Bars of the part before section `i` (to show "bar 3 of 16"). */
export function barsBefore(sections: readonly Section[], part: Part, i: number): number {
  let n = 0;
  for (let k = part.from; k < i; k++) n += sections[k].bars ?? 0;
  return n;
}

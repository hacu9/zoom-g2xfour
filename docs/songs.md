# Song tempo maps

The metronome's song list lives in `src/songs/tempo-maps.json` (generated) and
`src/songs/songs.ts` (the hand-written entries, patch links and notes).

## Where the maps come from

Each map comes from Songsterr's per-bar tab data for that song: tempo events,
time signatures and section markers. Each entry records the Songsterr song id
and revision, and the app links to the song page.

The import (a research script, not part of the app) did this:

1. It found the song by title and artist with Songsterr's search.
2. It read the most viewed guitar track. Tempo events are song-wide.
3. It started a new section at each change of tempo, meter or section marker.
4. It expanded simple repeats, so the bars follow the recording. No song in the list used them.
5. It moved tempo events that start in the middle of a bar to the bar start, and flagged them.
6. It dropped one-bar tempo spikes that jump by more than 40 % and come back.
   Tabs use these to write a held note. Each dropped spike shows as a note on the song.

We store only the tempo, the meter, the bar counts and the section names. No
notes or tabs.

## How the maps were checked

- **Length:** for 29 songs, the map's total length (bars × meter ÷ tempo) is
  within 4 % of the recording length. The recording lengths came from memory, not
  from a lookup, so this is a sanity check only. It shows that the bar order
  follows the recording.
- **Fade to Black:** a second fetch read the tempo events directly. They are
  113, then 119 at bar 57, 113 at bar 73, 119 at bar 97 and 142 at bar 112. A
  test pins these values. Hooktheory agrees on 113 (verse) and 142 (outro).
- **Master of Puppets:** 212 BPM is confirmed by four sources (Songsterr,
  Hooktheory, an HdM Stuttgart analysis, TalkingBass). The 21/32 bars are
  confirmed by the HdM analysis. The interlude is 106 here, 104 (HdM) or 103
  (Hooktheory) elsewhere.

## What to know

- **One tab, one opinion.** A transcriber wrote each tempo. Where other sources
  disagree, the song carries a note.
- **Double and half time.** One's last section is written at 222. That is the
  same pulse as 111 at half speed. Bon Jovi's "This Ain't a Love Song" is written
  at 60. Use the Tempo % control.
- **Rain (Rob Scallon)** is not from Songsterr: 123 (songbpm, fan delay
  settings) against 120 (Songsterr). The patch delay uses 123.
- **Fade to Black recipe:** the recipe sets its delay at 116 BPM, a single-number
  estimate. The song runs at 113, 119 and 142.
- **Odd meters:** x/8 meters click eighth notes. x/16 and x/32 click quarter notes
  and end the bar on a short pulse (21/32 = 1 + 1 + 0.625 quarters), so beat 1
  stays on time.

## Add a song

Add an entry to `SONGS` in `songs.ts` with `sections` (bpm, beats, unit, bars,
name), a `source`, and, if a recipe writes a patch for it, `patches`. Every
tempo needs a source. If you do not know the tempo, leave the song out.

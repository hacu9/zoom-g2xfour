# autotab: a draft guitar tab from a recording

`tools/autotab` turns a song file into a draft tab. It is for songs nobody has
tabbed (Los Mesoneros, for example). The result is a **draft**: expect wrong
and missing notes, more so on distorted guitar. Fix it by ear.

Use a recording you own (a purchase, a CD rip). Do not download songs from
YouTube: its terms forbid it. Keep the tabs for your own practice.

## How it works

1. **Separate:** Demucs `htdemucs_6s` takes the guitar out of the mix. It has
   one guitar output for all guitars.
2. **Two guitars:** many rock mixes put one guitar on the left and one on the
   right. When the two channels of the guitar stem differ (correlation below
   0.85), each side becomes its own track: "Guitar L" and "Guitar R". `--mono`
   turns this off.
3. **Beats:** beat_this finds the beats and the downbeats in the full mix. The
   tab's bar lines and its sixteenth-note grid follow the band, not a fixed
   tempo.
4. **Notes:** basic-pitch (ONNX model) finds the notes, from 70 Hz to 1400 Hz.
5. **Overtones:** a note an octave, a twelfth or two octaves above a louder note
   that starts at the same time is dropped. `--keep-overtones` turns this off.
6. **Frets:** `fretting.py` picks a string and fret for every note. A Viterbi
   pass prefers narrow hand shapes, low positions and small hand moves.
7. **Write:** `song.tex` (alphaTex), `song.txt` (ASCII tab), one `.mid` per
   track, and `song.json` (tempo, note counts, hints).

Open `song.tex` in the app's **Tabs** panel: it draws the tab and plays it, so
you can compare it with the record by ear.

## Set up

```bash
cd tools/autotab
python3 -m venv .venv
.venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
.venv/bin/pip install demucs soundfile "basic-pitch[onnx]" beat-this pytest
```

The RTX 50 series needs a CUDA 12.8 build of PyTorch. Without a GPU it runs on
the CPU, slower.

## Run

```bash
.venv/bin/python autotab.py ~/music/cicatrices.mp3 --out out/cicatrices
.venv/bin/python autotab.py song.mp3 --out out/intro --start 0 --end 25   # one section
.venv/bin/python autotab.py song.mp3 --out out/song --tuning half-down    # E♭ tuning
```

| Option | Use |
|---|---|
| `--start`, `--end` | Tab one section (seconds). A section where one guitar plays alone gives the best result. |
| `--tuning` | `standard`, `half-down`, `drop-d`, `full-down`. `song.json` hints when many notes fall below the low string. |
| `--mono` | One track, even when left and right differ. |
| `--no-separate` | The file is already a guitar-only recording. |
| `--onset`, `--frame`, `--min-ms` | basic-pitch sensitivity: higher onset = fewer, surer notes. |
| `--keep-overtones` | Keep the notes the overtone filter drops. |

## How good is it

`eval_guitarset.py` scores the tool on GuitarSet (CC BY 4.0): real guitar
recordings with the true string and fret of every note.

- **Note F1:** right pitch, onset within 50 ms.
- **Tab F1:** also on the right string.

Measured on 24 recordings that the tuning never saw (2026-10-17):

| Setting | Note F1 | Tab F1 | Notes written per true note |
|---|---|---|---|
| First version | 0.782 | 0.362 | 0.97 |
| Tuned (current defaults) | 0.781 | **0.396** | 0.90 |

`tune_guitarset.py` tunes on 24 recordings and checks on 24 others. It chose
onset 0.6 (fewer ghost notes) and fret weights span 0.5, position 0.05, move
0.35 (higher positions and wider shapes than before). About 4 in 5 notes come
out right; only about 2 in 5 land on the right string. The same pitch exists on
several strings, and the audio alone rarely tells which one was played: check
the positions by ear and by hand.

GuitarSet is clean, solo acoustic guitar. This is the best case. A band mix
with distorted guitars scores lower, and two guitars in the same channel merge
into one track. Judge the tool on the song itself.

### On real songs: compare with a Songsterr tab

GuitarSet is clean solo guitar. To score the tool on a real band mix, use a
song that has a Songsterr tab, for example Los Mesoneros' "Indeleble"
(Songsterr 382134: "Luis (Rythym)" and "Juan (Lead)").

```bash
.venv/bin/python autotab.py ~/music/indeleble.mp3 --out out/indeleble
.venv/bin/python compare_songsterr.py out/indeleble/indeleble-notes.json --song 382134
```

- Every draft track is scored against every Songsterr guitar track: note F1
  and tab F1, as above. The pairing with the best score shows which side of
  the mix holds which guitar.
- It compares in beats, on the draft's own detected beats, so tempo drift is
  not an error. It finds the offset where the two line up (all same-pitch note
  pairs vote for a shift) and tries double and half tempo.
- The Songsterr tab is cached in `~/.cache/autotab/songsterr` and only used for
  the score. Nothing of it is printed or saved in the repo.
- Songsterr tabs are fan transcriptions: the score means "agrees with that tab".

**Result on Indeleble (2026-10-17, current defaults):**

| Draft track | vs | Rhythm F1 | Note F1 | Tab F1 |
|---|---|---|---|---|
| Guitar R | Luis (rhythm) | 0.58 | 0.18 | 0.09 |
| Guitar L | Luis (rhythm) | 0.53 | 0.12 | 0.04 |
| either | Juan (lead) | ≤ 0.34 | ≤ 0.09 | ≤ 0.02 |

- About half the strums and picks fall where the tab has them. Fewer than 1 in
  5 pitches agree, and about 1 in 10 strings. Even when each 8-bar section of
  the tab may align on its own (a generous upper bound), note F1 stays at
  0.20–0.26.
- The tempo and the tuning agree with the tab (72–74 BPM, standard), and a
  transposition of ±1 or ±2 semitones scores lower, so the low score is the
  notes themselves: distorted chords give basic-pitch many false pitches.
- Both draft tracks match the rhythm guitar, not the lead: in this mix the
  rhythm part sits on both sides, so the left/right split does not separate
  rhythm from lead.

On a distorted band mix, read the draft as rhythm and rough positions, not as
notes.

## Tests

```bash
.venv/bin/python -m pytest -q
```

The tests cover the parts without audio: string/fret choice, overtones, the
grid, bars and the writers.

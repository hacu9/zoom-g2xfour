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
7. **Write:** `song.tex` (alphaTex, opens in alphaTab), `song.txt` (ASCII tab),
   one `.mid` per track, and `song.json` (tempo, note counts, hints).

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

GuitarSet is clean, solo acoustic guitar. This is the best case. A band mix
with distorted guitars scores lower, and two guitars in the same channel merge
into one track. Judge the tool on the song itself.

## Tests

```bash
.venv/bin/python -m pytest -q
```

The tests cover the parts without audio: string/fret choice, overtones, the
grid, bars and the writers.

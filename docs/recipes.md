# Tone recipes

A tone recipe describes a song's sound in pedal-neutral terms. The app turns
it into a G2X FOUR patch (`src/recipe/translate.ts`) and writes it into an
Empty slot (`src/recipe/apply.ts`). Recipes live in `src/recipe/recipes/`.

## Format

```json
{
  "song": "Rain",
  "artist": "Rob Scallon",
  "patchName": "Rain Scallon",
  "source": "where the settings come from",
  "bpm": 123,
  "compressor": { "amount": 40 },
  "drive": { "type": "overdrive", "gain": 35, "tone": 60 },
  "amp": { "type": "clean", "gain": 25 },
  "eq": { "low": 45, "mid": 50, "high": 55 },
  "modulation": { "type": "chorus", "rate": 30, "depth": 40, "mix": 30 },
  "delay": { "type": "digital", "note": "1/8.", "feedback": 72, "mix": 80 },
  "reverb": { "type": "hall", "decay": 40, "mix": 30 }
}
```

Every part is optional except `song`. Values are 0–100. The translator maps
them onto each knob's real range (for example 25 on an amp `Gain` of 10–100
gives 32). `patchName` is cut to 14 characters.

## How parts map to effects

| Recipe part | G2X FOUR effect |
|---|---|
| `compressor` | Comp (`amount` → Sense) |
| `drive` | overdrive → TS Drive, distortion → DIST One, fuzz → NYC Muff, boost → RC Drive |
| `amp` | clean → FD TWIN-R, crunch → UK 30A, high-gain → RectiDual, american → FD DLX-R, british → MS 1959. `eq` sets the amp's Bass/MID/Treble. |
| `modulation` | chorus → ChorusOne, flanger → VinFLNGR, phaser → Phaser, tremolo → Tremolo, vibrato → SwellVibe |
| `delay` | `type`: digital → Delay (default), analog → AnalogDly, tape → TapeEcho |
| `reverb` | room → RoomREV, hall → Hall REV, plate → Plate REV, spring → SpringREV |

Order in the chain: compressor → drive → amp → modulation → delay → reverb.
The pedal has 6 slots; the translator drops anything beyond 6 and warns.

## Delay time

With `bpm` and a `note`, the delay syncs to the patch tempo: Mode = BPM SYNC,
Time = the note, patch tempo = `bpm`. Tap tempo then still works live. Notes:
`1/1 1/2 1/4 1/4. 1/4T 1/8 1/8. 1/8T 1/16 1/16.` (`1/16T` is not on the pedal).

Without `bpm`, or with `timeMs`, Time is set in milliseconds:
`ms = 60000 / BPM × note value` (`src/tempo/delay.ts`). Example: 123 BPM,
dotted eighth (0.75) → 366 ms. The delay Mode is then left as the pedal sets
it, because the meaning of SHORT and LONG is not verified.

## Not supported yet

- The patch output EQ (no known write command). Use the amp's EQ knobs.
- Effects outside the mapping table. Add them to `ROLE_EFFECT` in `translate.ts`.

## Rain — Rob Scallon (slot 250)

| Slot | Effect | Settings |
|---|---|---|
| 1 | Comp | Sense 4 |
| 2 | FD TWIN-R | Gain 32, Bass 50, MID 55, Treble 59 |
| 3 | **Delay** | Dotted eighth, BPM SYNC, **Repeat 72, Mix 80** |
| 4 | Hall REV | Decay 13, Mix 30 |
| — | Tempo | 123 BPM |

### Why v1 failed

v1 (written 2026-10-15) used **AnalogDly with Repeat 35 and Mix 48**. The pedal
held exactly those values, and the delay was ON. But on the pedal it sounded
like no repeating delay at all:

- **35 came from a Line 6 preset**, where feedback uses a different scale. On a
  Zoom delay, 35 is low for a song built on repeats (an estimate — the user
  heard no repeating delay; nobody measured the echo count). The Zoom-based fan preset
  (B1on, StompDly) used F.B 63.
- **AnalogDly darkens every repeat**, so the few echoes vanish in the mix.

**Lesson for recipes:** a "%" from another brand is not a Zoom knob value.
Check feedback by ear, and prefer the clean `Delay` for songs built on
audible repeats.

v2 changed slot 3 live with the editor (search → Delay, then Time, Mode,
Repeat, Mix 55) and the pedal confirmed every value. v3 raised Mix to 70 for
louder repeats (pedal ack `64 20 01 02 05 46`). v4 = Repeat 72, Mix 80 for
more and louder echoes (acks `… 02 04 48`, `… 02 05 50`). The recipe JSON now
writes v4. Above Repeat ~75 the repeats may build into runaway feedback. `tests/fixtures/g2xfour-rain-slot250.hex` still holds the v1 dump, as a
real-data decode test.

The settings come from fan posts, not from Rob Scallon. Tune Mix and Gain by
ear. Sources:

- [Line 6 CustomTone: Rain Rob Scallon](https://line6.com/customtone/tone/3964711/) — dotted 1/8 at 123 BPM, feedback 35%, mix 48%
- [ToneLib forum: Rob Scallon – Rain delay + tone](https://tonelib.net/forums/threads/rob-scallon-rain-delay-tone.19412/)
- [ToneLib forum: Rain (Rob Scallon)](https://tonelib.net/forums/threads/rain-rob-scallon.4777/)
- [ToneLib forum: Rob Scallon – Rain](https://tonelib.net/forums/threads/rob-scallon-rain.8243/)
- [Rain (Live & Acoustic), YouTube](https://www.youtube.com/watch?v=o-woP9ghLVE)

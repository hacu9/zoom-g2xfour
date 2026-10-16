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
  "delay": { "type": "digital", "note": "1/8.", "feedback": 72, "mix": 90 },
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

## Format extras: `model` and `knobs`

Every part also takes `model` (an exact catalog effect name, for example
`"MS 800"`) and `knobs` (knobs by catalog name: a number is 0–100 of the
knob's range, a string is an exact value such as `"ON"` or `"HI"`). `knobs`
wins over the generic values. An unknown knob name gives a warning.

`afterAmp` adds extra effects right after the amp, in order — for example a
graphic EQ in the amp's loop: `"afterAmp": [{ "model": "Gt GEQ 7", "knobs": { "800Hz": "-8.0" } }]`.
GEQ values are exact dB strings in 0.5 steps, from `"-12.0"` to `"12.0"`.

A `note` without `bpm` syncs the delay to the pedal's current tempo and does
not change it — set it with tap tempo.

## Metallica (slots 251–258)

Written and verified on the pedal on 2026-10-15. Clean and distorted versions
sit next to each other. All values are starting points from fan sources —
tune by ear.

| Slot | Patch | Chain |
|---|---|---|
| 251 | Fade2Black Cln | Comp → FD TWIN-R (bright, Gain 23) → ChorusOne (Mix 25) → Delay ¼ (Repeat 25, Mix 25) → Hall REV (Mix 20); 116 BPM |
| 252 | Fade2Black Dst | TS Drive (Gain 15, VOL 85) → **MS 800** = JCM800 (Gain 70, Treble 70, Presence 70) → Delay ¼ (Repeat 30, Mix 25) → RoomREV (Mix 15); 116 BPM |
| 253 | One Clean | Comp → **BG MARK3** = Mesa, clean (Gain 8, Treble 85) → ChorusOne (Mix 35) → AnalogDly ¼ (Repeat 35, Mix 30) → Hall REV (Mix 25); tap tempo |
| 254 | One Dist | TS Drive (Gain 10, VOL 85) → **BG MARK3** (Gain 80, Mid 40, Presence 70) → Delay ¼ (Repeat 25, Mix 15) → RoomREV (Mix 10); tap tempo |
| 255 | MoP Clean | Comp → BG MARK3 clean (Gain 10, Treble 75) → ChorusOne (Mix 20) → Delay ¼ (Repeat 25, Mix 20) → Hall REV (Mix 25); tap tempo |
| 256 | MoP Dist | TS Drive (Gain 10, VOL 85) → **BG MARK3** (Gain 85, Mid 25, Treble 80) → **Gt GEQ 7 V-curve** (100 Hz +4, 400 Hz −3, 800 Hz −8, 1.6 kHz −3, 3.2 kHz +3, 6.4 kHz +4) → Delay ¼ (Mix 12) → RoomREV (Mix 8); tap tempo |
| 257 | TDTNC Clean | Comp → FD TWIN-R (Gain 23) → StereoCho (Mix 30) → Delay dotted ⅛ (Repeat 30, Mix 25) → Plate REV (Mix 25); tap tempo |
| 258 | TDTNC Dist | TS Drive (Gain 15, VOL 85) → **MS 1959** = Marshall Super Lead (Input1 85, Input2 60, Treble 70) → Delay ¼ (Mix 15) → RoomREV (Mix 10); tap tempo |

Notes:

- 116 BPM for Fade to Black comes from two tab transcriptions. No reliable
  tempo was found for One, so its delays follow tap tempo.
- The recorded intro of Fade to Black is acoustic; slot 251 is the clean
  electric part. Its chorus and delay are a choice, not documented.
- The pedal has no Mark IIC+; BG MARK3 (Mesa Mark III) is the closest model.
- Master of Puppets: several sources call the V-shaped graphic EQ in the amp's
  loop the key element; slot 256 rebuilds it with Gt GEQ 7 after the amp. No
  source gives settings for the clean middle section — slot 255 is a choice.
- The Day That Never Comes: producer Greg Fidelman (via tonesmatch) names a
  blend of a Mark IIC+ and a modded Marshall Super Lead; slot 258 uses the
  Super Lead model. The clean intro/verses (Wikipedia) have no documented
  settings — slot 257 is a choice. One unconfirmed tab says 60 BPM; not used.

Sources: [tonemirror — Fade to Black](https://www.tonemirror.so/tones/metallica-fade-to-black),
[tonesmatch — riff clean](https://tonesmatch.com/tones/fade-to-black-metallica-riff-clean-5054),
[tonesmatch — solo](https://tonesmatch.com/tones/fade-to-black-metallica-solo-distorted-1592),
[rigtone](https://www.rigtone.com/tone/fade-to-black-amp-settings),
[Skyminds tab (116 BPM)](https://www.skyminds.net/metallica/fade.tab),
[Guitar Tabs Explorer bass tab (116 BPM)](https://www.guitartabsexplorer.com/metallica/fade-to-black-(ver2)-btab),
[tonemirror — One](https://www.tonemirror.so/tones/metallica-one),
[tonesmatch — One](https://tonesmatch.com/tones/one-metallica-solo-clean-50),
[Guitar Chalk — One](https://www.guitarchalk.com/amp-settings-one-metallica/),
[Wikipedia — Mark IIC+](https://en.wikipedia.org/wiki/Mesa/Boogie_Mark_IIC%2B),
[Guitar Chalk — Master of Puppets](https://www.guitarchalk.com/master-of-puppets-metallica-amp-settings/),
[mixdownmag — Master of Puppets tone](https://mixdownmag.com.au/features/how-to-get-the-metallica-master-of-puppets-tone/),
[tonemirror — Master of Puppets](https://www.tonemirror.so/tones/metallica-master-of-puppets),
[rigtone — Master of Puppets](https://www.rigtone.com/tone/master-of-puppets-amp-settings),
[Wikipedia — The Day That Never Comes](https://en.wikipedia.org/wiki/The_Day_That_Never_Comes),
[tonesmatch — The Day That Never Comes](https://tonesmatch.com/tones/the-day-that-never-comes-metallica-riff-distorted-6217).

## Rain — Rob Scallon (slot 250)

| Slot | Effect | Settings |
|---|---|---|
| 1 | Comp | Sense 4 |
| 2 | FD TWIN-R | Gain 32, Bass 50, MID 55, Treble 59 |
| 3 | **Delay** | Dotted eighth, BPM SYNC, **Repeat 72, Mix 90** |
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
more and louder echoes (acks `… 02 04 48`, `… 02 05 50`). v5 = Mix 90 (ack
`… 02 05 5A`). The recipe JSON now writes v5. Above Repeat ~75 the repeats may build into runaway feedback. `tests/fixtures/g2xfour-rain-slot250.hex` still holds the v1 dump, as a
real-data decode test.

The settings come from fan posts, not from Rob Scallon. Tune Mix and Gain by
ear. Sources:

- [Line 6 CustomTone: Rain Rob Scallon](https://line6.com/customtone/tone/3964711/) — dotted 1/8 at 123 BPM, feedback 35%, mix 48%
- [ToneLib forum: Rob Scallon – Rain delay + tone](https://tonelib.net/forums/threads/rob-scallon-rain-delay-tone.19412/)
- [ToneLib forum: Rain (Rob Scallon)](https://tonelib.net/forums/threads/rain-rob-scallon.4777/)
- [ToneLib forum: Rob Scallon – Rain](https://tonelib.net/forums/threads/rob-scallon-rain.8243/)
- [Rain (Live & Acoustic), YouTube](https://www.youtube.com/watch?v=o-woP9ghLVE)

## Enter Sandman, Nothing Else Matters, Reptilia, This Ain't a Love Song, Hombres G, Mr. Brightside, Dancefloor

Written 2026-10-16. All recipes are starting points, not official settings.
Tune them by ear against the record.

### How to read this file

- **Sourced** means a page states the fact. The URL follows it.
- **Estimate** means no source gives the value. I chose it.
- **Model mapping** means the real gear is not on the G2 FOUR, and the recipe
  uses the closest model. The real amp behind each Zoom model name (for example
  UK 30A = Vox AC30, ORG120 = Orange, FD TWIN-R = Fender Twin Reverb) is an
  assumption from the Zoom naming style. I found no Zoom document that lists
  the models it copies. Zoom's product page names only its six original amps.
- Amp dials from other sources are on a 0–10 scale. The recipe uses 0–100 of
  the knob range. The Fender models (FD TWIN-R) have a 10–100 range, so the
  translator moves each value up a little (for example eq 50 gives 55).
- I opened most pages directly. These I read only as search-result excerpts,
  because the page did not load or I did not open it: the Guitar Player
  Keuning quote, the LinkedIn article, Mixdown's Alex Turner rundown, Equipboard
  Jamie Cook and the justinguitar post. Treat them as less checked.
- All recipes passed the repo translator (`translate()`) with no unknown model
  and no unknown knob.

### Shared model mappings

| Real gear | G2 FOUR model | Why |
|---|---|---|
| Fender Hot Rod DeVille | FD TWIN-R | Fender clean with a MID knob. FD DLX-R has no MID knob. |
| Roland JC-120 | FD TWIN-R (BRGHT ON) + ChorusOne | The pedal has no JC-120. Bright, clean Fender plus a chorus is the closest. |
| Mesa Mark IIC+ | BG MARK3 | The pedal has no Mark IIC+ (same choice as the existing Metallica recipes). |
| Vox AC30 | UK 30A | Name suggests an AC30-style amp. |
| Orange AD30 | ORG120 | The only Orange-style name in the catalog. |
| ProCo RAT 2 | SqueakDST | Assumed. Its FLTR knob matches the RAT Filter control. Zoom's MS-50G page confirms a RAT model exists in the Zoom range, but I did not find which name it has. |
| Visual Sound Jekyll & Hyde | TS Drive | The overdrive side is a mild overdrive. TS Drive is the default overdrive. |

---

### 1. The Strokes — Reptilia (`strokes-reptilia.json`)

Chain: TS Drive → FD TWIN-R. No reverb, no delay.

| Value | Status |
|---|---|
| Hot Rod DeVille, Jekyll & Hyde overdrive, MXR Micro Amp for leads (Is This It / Room on Fire) | Sourced (Mixdown, Gearnews) |
| Amp gain 6–7 → 65, treble 8 → 80, mids 4 → 40, bass 5 → 50 | Sourced (Killer Rig "Reptilia" row) |
| No reverb | Sourced (Killer Rig gives no reverb for Reptilia) |
| TS Drive gain 40, tone 65 | Estimate |
| The Micro Amp solo boost is not in the patch | Choice — raise the amp VOL or TS gain for the solo |

- https://mixdownmag.com.au/features/rig-rundown-the-strokes/ — "nothing more than a Visual Sound Jekyll and Hyde ... plus an MXR Micro Amp for lead passages" for Is This It and Room on Fire; Hot Rod DeVille 2×12.
- https://www.gearnews.com/the-strokes-guitar-tone-guitar/ — both played Hot Rod DeVilles; producer Gordon Raphael mic'd them with MD 421s.
- https://killerrig.com/?p=15650 — "Sound Like The Strokes: Amp Settings and Gear", table row "Reptilia: gain 6-7, treble 8, mids 4, bass 5". A fan guide, not from the band.

### 2. Scouting for Girls — This Ain't a Love Song (`scouting-for-girls-this-aint-a-love-song.json`)

Chain: Comp → TS Drive → UK 30A → RoomREV.

**Everything is an estimate.** I found no gear source for the band or the
recording. I did not invent one. The patch is a generic pop-rock rhythm crunch.

- https://en.wikipedia.org/wiki/This_Ain%27t_a_Love_Song_(Scouting_for_Girls_song) — credits only: guitar and piano Roy Stride, producer Andy Green, studio Heliocentric, released March 2010.
- https://equipboard.com/pros/roy-stride — lists no gear (checked 2026-10-16).

### 3. Hombres G — Te quiero (`hombres-g-te-quiero.json`)

Chain: FD TWIN-R (BRGHT ON) → ChorusOne → SpringREV.

| Value | Status |
|---|---|
| Roland Jazz Chorus imposed by an early manager, "súper limpio" | Sourced (Danny Gómez interview) |
| He always had a chorus on his board | Sourced (same) |
| That "Te quiero" used the JC-120 and a clean tone | **Estimate** — no song-specific source. Check against the record; if it is crunchy, use the Devuelveme patch with chorus added. |
| All knob values | Estimate |

- https://dannygomez.net/2018/05/10/rafagutierrezhombresg/ — Rafa Gutiérrez on his amps (Peavey Bandit, Gallien-Krueger, Roland Jazz Chorus, Vox AC30) and pedals (one or two distortions, chorus, tuner, compressor as solo boost). Undated against specific albums.
- https://en.wikipedia.org/wiki/La_cagaste..._Burt_Lancaster — the song is track 5 of the 1986 album, producer Paco Trinidad.

### 4. Hombres G — Devuélveme a mi chica (`hombres-g-devuelveme-a-mi-chica.json`)

Chain: UK 30A (gain 80, Tone Cut 40) → RoomREV.

| Value | Status |
|---|---|
| Vintage Vox AC30, all knobs maxed, a blanket over it, for distortion | Sourced (Danny Gómez interview) |
| That this 1985 song used that setup | **Estimate** — the interview does not name songs |
| Gain 80 (not 100), Tone Cut 40 to stand in for the blanket's darker sound | Estimate |
| Small room reverb | Estimate |

- https://dannygomez.net/2018/05/10/rafagutierrezhombresg/ — AC30 quote.
- https://guitarsexchange.com/en/unplugged/67/rafa-gutierrez-hombres-g/ — his guitars (Kramer from 1980, SG, Strat with a humbucker). No amp settings.

### 5. Metallica — Enter Sandman

### Distorted (`metallica-enter-sandman-dist.json`)

Chain: BG MARK3 → Gt GEQ 7 (mid cut) → RoomREV.

| Value | Status |
|---|---|
| Mesa Mark II-series amp as the core (Hetfield, Guitar World Oct 1991: "the same Mesa Boogie Simul-Class Mark II") | Sourced (Ground Guitar) |
| Blend with a Jose-modded Marshall, 9–11 cabinets, Aphex EQ in the loop, 1.2 kHz cut for a tight rhythm | Sourced (Guitar Chalk, unattributed claims) |
| Amp knobs: average of three fan pages (gain/bass/mid/treble/presence): tonemirror 7/6/5/6/6, rigtone 7/3/3/9/4, Guitar Chalk 7/6/3/6/5 → 70/50/35/70/50 | Sourced, averaged |
| The Marshall half of the blend | Not built — one chain cannot blend two amps |
| GEQ: 800 Hz −4 and 1.6 kHz −4 (around 1.2 kHz), slight low and top trims | Estimate, from the 1.2 kHz cut (Guitar Chalk) and the Kuassa mid scoop |
| No TS Drive | Choice — no Black Album source names one |
| RoomREV mix 10 | Estimate |

- https://www.groundguitar.com/james-hetfield-guitars-and-gear/james-hetfields-mesa-boogie-mark-iic/
- https://www.guitarchalk.com/amp-settings-enter-sandman-metallica/ — Rectifier-style settings 7/6/3/6/5; rig claims above.
- https://www.tonemirror.so/tones/metallica-enter-sandman — Mark IIC+ 7/6/5/6/6.
- https://www.rigtone.com/tone/enter-sandman-amp-settings — Mark IIC+ 7/3/3/9/4, "based on known Mark IIC+ settings for Black Album".
- https://www.kuassa.com/?p=8186 — rhythm recreation scoops the mids and trims lows and highs (no numbers).

### Clean intro (`metallica-enter-sandman-clean.json`)

The song needs one: the intro riff is clean before the band comes in.
**Weak sources.** Tab sites say the intro is clean. The JC-120 is sourced only
for Nothing Else Matters; this patch assumes the same clean amp. All values
are estimates.

- https://www.bonedo.de/?p=1422237 — "Der verwendete Verstärker war, zumindest für das Intro, ein Roland JC120 Jazz Chorus" (Nothing Else Matters).
- https://community.justinguitar.com/t/metallica-enter-sandman-rythm-guitar-full-song/78940 — a player calls the clean riff the hardest rhythm part (community post).

### 6. Metallica — Nothing Else Matters

### Clean (`metallica-nothing-else-matters-clean.json`)

Chain: Comp → FD TWIN-R (BRGHT ON) → ChorusOne → Hall REV.

| Value | Status |
|---|---|
| Roland JC-120 for the intro, amp "maximal clean" | Sourced (Bonedo) |
| JC-120 chorus probably on, set subtly | Sourced (Bonedo, says "vermutlich" = probably) |
| Hetfield used an MXR Dyna Comp; light comp and reverb suggested | Sourced (Bonedo) |
| Chorus mix 20, comp 25, hall mix 18, amp values | Estimate |

- https://www.bonedo.de/?p=1422237

### Distorted — solo and heavy parts (`metallica-nothing-else-matters-dist.json`)

Chain: BG MARK3 → Delay ¼ (tap tempo) → Hall REV.

| Value | Status |
|---|---|
| Album amps: modified Marshalls, Mesa Mark IIC+ and IV | Sourced (Bonedo solo workshop) |
| Neck humbucker, "an amp with plenty of gain", "a light delay and some reverb" | Sourced (Bonedo) |
| Amp knobs: Enter Sandman averages, MID 45 for the neck pickup | Estimate |
| Delay ¼, Repeat 25, Mix 18, no `bpm` | Estimate. No sourced tempo, so the delay follows tap tempo. |

- https://www.bonedo.de/artikel/die-besten-gitarrensoli-metallica-nothing-else-matters-workshop

### 7. The Killers — Mr. Brightside (`killers-mr-brightside.json`)

Chain: FD TWIN-R → SpringREV.

| Value | Status |
|---|---|
| Ibanez Destroyer into a Fender Hot Rod DeVille ("about 90 percent of ... Hot Fuss") | Sourced — Keuning in Guitar Player. I read this quote in a search excerpt and on tonematch.io; the Guitar Player page body did not load for me. |
| Amp: drive 5 → gain 55, bass 5, mids 7, treble 6, reverb 2 | Sourced (tonematch.io — the page itself says the knob values are approximations) |
| Mixer Mark Needham: "The Eg amp was a Supro" | Sourced — conflicts with Keuning. I follow the guitarist. |
| No guitar delay | Sourced: the 84 ms Echo Farm delay was the vocal effect (Wikipedia). Needham's "86 ms" quote on songchecks does not name the instrument. |
| `bpm` | Left out. Wikipedia gives ~148 BPM, but no delay needs it. |

- https://www.guitarplayer.com/players/dave-keunings-top-five-career-defining-tracks
- https://www.tonematch.io/presets/58216549-6e6c-4fef-8465-2764c83f6fd1
- https://www.songchecks.com/blog/mark-needham-mixing-mr-brightside-the-killers
- https://en.wikipedia.org/wiki/Mr._Brightside

### 8. Arctic Monkeys — I Bet You Look Good on the Dancefloor (`arctic-monkeys-dancefloor.json`)

Chain: SqueakDST (RAT) → ORG120 (clean-ish) → RoomREV.

| Value | Status |
|---|---|
| Turner: white Mexican Strat, Orange AD30TC set clean, two ProCo RAT 2s (one crunchy, one heavy); the Dancefloor intro is a Rat moment | Sourced (musicteacher.com) |
| Cook: '62 Telecaster into a Hiwatt Custom 50 with spring reverb | Sourced (LinkedIn article, Equipboard; secondary sources) |
| The patch follows Turner's rig. HW 100 is the alternative for Cook's part. | Choice |
| RAT gain 55, FLTR 40, amp gain 30, all EQ, room mix 8 | Estimate |

- https://musicteacher.com/alex-turner-guitar-rig-2006
- https://mixdownmag.com.au/features/gear-rundown-alex-turner/
- https://www.linkedin.com/pulse/art-making-hit-records-arctic-monkeys-story-giacomo-garufi — Turner Strat → Orange AD30 → two chained Rat 2; Cook '62 Tele → Hiwatt Custom 50; album mostly live, amps in booths.
- https://equipboard.com/jamie-cook
- https://en.wikipedia.org/wiki/I_Bet_You_Look_Good_on_the_Dancefloor — recorded at 2fly (Sheffield) and Chapel studios, producer Jim Abbiss.

### Zoom model names

- https://zoomcorp.com/en/us/multi-effects/guitar-effects/g2-four-g2x-four — describes only the six Zoom-original amps (KRAMPUS, REDLOOM, VELVET, MUDDY, 7 HEAVEN, POLLEX).
- https://zoomcorp.com/en/us/multi-effects/multistomp-pedals/ms-50g — confirms Zoom models a Pro Co Rat and a DS-1, without naming the effects.


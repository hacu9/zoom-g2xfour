# Architecture

Vite + React + TypeScript. No backend. The browser talks to the pedal through
the Web MIDI API with `sysex: true`.

```
src/
  midi/
    backend.ts     Web MIDI wrapper, port auto-select, ordered open/close per port
    mock.ts        Invented pedal for UI tests (never evidence)
    session.ts     ProbeSession: the ONLY path to the output port; request/response; subscribe
    safety.ts      classify(): read | unknown | blocked  (read path)
    commands.ts    Read allowlist + hard blocklist, each with its source
    writes.ts      classifyWrite(): the write gate (4 shapes, scratch-slot policy)
    backup.ts      44 bank info, 46 slot reads, .syx export, duplicate detection
    syx.ts         .syx file → slot dumps
    restore.ts     restoreEntry(): upload one dump, fresh Empty check, byte-for-byte read-back
    ptcf.ts        Raw patch reader (PTCF): effects, params, name, tempo
    decode.ts      Screen text, file entries, flash info
    patchSelect.ts Bank Select + Program Change for patch up/down and the patch list
    identity.ts / zoom.ts / hex.ts / annotate.ts / fileList.ts
  catalog/         G2 FOUR effect + parameter catalog (vendored from zoom-explorer)
  editor/          PatchEditor (stompbox board), EffectPicker (search), RestorePanel, RecipePanel
  ui/              PedalHeader (LCD, patch up/down, lights), Knob (rotary pot), PatchList,
                   Recorder (USB audio takes, expression pedal learn)
  audio/           recorder.ts (input pick, file name, level), pedal.ts (learn + toe switch),
                   metronome.ts (tempo map walker, ramps, tap tempo)
  songs/           songs.ts: the song list (tempo map + patch names + source)
  recipe/          ToneRecipe types, translate.ts (recipe → plan), apply.ts (plan → pedal),
                   builtin.ts (the shipped list), recipes/*.json
  tempo/delay.ts   NOTE_FACTORS: note value → quarter notes (delay sync)
  text.ts          foldText (search without accents), fileStamp (file-name timestamps)
  log/ probe/      Log, export, console UI
  styles.css       Look: a dark pedal build sheet (graph paper, copper traces and labels,
                   a circuit-board screen, enclosures in their category colour)
  App.tsx          Page: auto-connect, auto-backup, header, board, patch list; recipes,
                   restore and the lab (ports, identity, console, log) fold away
cli/               g2x: the same code from the command line on Windows Node (jzz). See docs/cli.md
scripts/g2x        Starts g2x from WSL: installs jzz once, rebuilds the bundle, converts paths
tests/             Vitest; fixtures/ hold real pedal dumps
```

## Two gates

- **Read gate** (`safety.ts`). Every console or app send goes here first. Only
  exact read commands pass. Known dangers are blocked with no override:
  firmware mode (`01/03/04`), factory reset (`5B`), bank delete (`64 47`), patch
  writes (`28`, `45`, `08`, `64 12`), system settings (`64 20 00 64 xx`), file
  ops, undocumented one-byte commands.
- **Write gate** (`writes.ts`). Used only when a caller passes a `WritePolicy`.
  It accepts exactly four shapes — slot upload (`45`), param edit
  (`64 20 00 <slot 0-7>`), name edit (`64 20 00 5F`), patch tempo
  (`64 20 00 64 02`, 40–250) — and only when:
  1. a full backup ran in this session;
  2. the target slot is a scratch slot ("Empty" in that backup, Empty again
     after a restore, or written by the app), or the user ticked "edit real
     patches" (edits), or typed the slot number (restore).

The pedal **auto-saves**: edits to the current patch are stored when the patch
changes. That is why edits follow the scratch-slot rule and not only uploads.

## Data flow

```
ToneRecipe JSON ─► recipe/translate ─► Plan ─► recipe/apply ─► write gate ─► session ─► pedal
                        ▲                          │ verify: 64 13 read-back, then 46 stored read
                    catalog                        ▼
backup (46 reads) ─► .syx ─► editor/RestorePanel ─► 45 upload ─► 46 read-back (PTCF bytes compared)
```

## Decisions

- **Allowlist, not denylist**, on both gates: an unknown write must fail closed.
- **Recipes use live edits, not a built patch upload.** The pedal fills in
  defaults, routing and the hidden PRM2 fields itself; we never compute a CRC.
- **Restore re-sends the pedal's own `45` dump** byte for byte (only bank and
  program are rewritten), so it needs no encoder either.
- **Compare PTCF bytes only.** A slot's 832 bytes carry leftovers from older
  patches after the PTCF length.

## Auto-connect and auto-backup

- On load, `navigator.permissions.query({ name: 'midi', sysex: true })`. When
  it says `granted`, `requestMIDIAccess` needs no user gesture, so the app
  connects at once. Otherwise the Connect button asks (a click is a gesture).
- Port hot-plug: the backend's `statechange` refreshes the port list, and
  `autoSelect` picks the Zoom ports. A new port pair makes a new session.
- When a session's ports are open (`readySession`), the app runs one backup
  for that session, in memory only. A download on every page load would be
  noise, so the `.syx` file waits for a click.
- Program Change is not a write: `classify()` calls it `unknown` with no
  research mode, and the write gate never sees it. It can still make
  auto-save keep edits on the patch you leave — the same as a footswitch.

## Write state in the app

- `scratchSlots` holds the slots the app may write: Empty in the backup, or a
  slot it wrote a recipe into (`writableAfter(…, 'recipe')`). A restore keeps a
  slot writable only when it put "Empty" back: a restored patch is real.
- `slotNames` (the backup plus the app's own writes) goes into the write
  policy. `assertStillEmpty` compares a fresh read of the target against it
  right before a recipe write or a restore.
- One `writing` flag covers both panels. While it is set, the patch buttons,
  the patch list, the song picker, the knobs and "Back up again" are locked.

## Recorder

- The G2X FOUR is a USB audio interface. `getUserMedia` opens it with echo
  cancel, noise suppression and auto gain off: a guitar is not a voice.
- Device labels appear only after permission. So the first open uses the
  default input, then switches once to the input whose name matches Zoom/G2.
  The switch happens one time at most: an unstable device id must not loop.
- `MediaRecorder` writes webm/Opus. The input goes to an output only when the
  user turns on **Listen**: its own `AudioContext` (latencyHint `interactive`,
  `setSinkId` for the chosen output) and a gain node. The input asks for
  `latency: 0`. The readout adds the input, base and output latency that Chrome
  reports; a wireless link adds delay that Chrome does not see. The pedal's
  PHONES jack stays the zero-delay monitor.
- `devicechange` refreshes the input list. The track's `ended` event (unplug)
  drops the stream and ends a running take; `onstop` still keeps the take.
- Takes are blob URLs in memory. Unmount stops a running take and revokes them. Nothing is stored, nothing is sent.
- **Expression pedal (not verified on hardware).** `audio/pedal.ts` learns
  the first control message: a CC (not Bank Select 0/32) or a Zoom edit report
  `64 20 00|01 <slot 0-5> <param ≥ 2> <value>`. `PedalTracker` learns the range,
  also for CC. A new top is calibration and never fires, and a range below
  `MIN_SPAN` (10) is noise. Then "toe" fires once per push past 95 %, re-armed
  below 50 %. The recorder only
  listens. It sends nothing to the pedal.

## Metronome

- `ClickWalker` walks a tempo map: sections of `bpm`, `beats`, optional `bars`
  and optional `toBpm` (a linear ramp, one tempo step per beat). A section with
  no `bars` loops until `skipTo()` moves on at the next bar line.
- `Metronome.tsx` schedules on the audio clock with a lookahead (a 25 ms timer
  schedules every click due in the next 120 ms), the "two clocks" pattern. The
  beat lights read `AudioContext.currentTime`, not the timer.
- Free mode restarts the walk at the next beat after a tempo or meter change.
- Each song's tempo carries its source. A tempo with no source stays out of the list.

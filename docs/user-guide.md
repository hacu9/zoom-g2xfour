# User guide

How to run the app and use each panel. For the protocol itself, see
[g2x-four-protocol.md](g2x-four-protocol.md). For tone recipes, see
[recipes.md](recipes.md).

## Run it

1. Install once: `npm install`.
2. Start: `npm run dev`. Vite serves on `http://localhost:5173`.
3. Open the URL in **desktop Chrome or Edge on Windows** (not WSL Chrome).
   WSL2 forwards `localhost`, so the Windows browser reaches the WSL server.
4. Connect the G2X FOUR with a USB **data** cable and switch it on.
5. Close Handy Guitar Lab, Zoom Guitar Lab and every DAW. On Windows, only one
   program at a time can open a MIDI port.
6. The page connects by itself when Chrome already has the MIDI permission.
   The first time, click **Connect** and allow "MIDI device control &
   reprogram". That permission is the SysEx permission.

Other commands: `npm test` (unit tests), `npm run build` (type check + bundle),
`scripts/g2x` (the same pedal code from the command line, see [cli.md](cli.md)).
**Use mock pedal** (in the Lab) runs the UI against an invented pedal. It
replays one real patch dump (Rain v1) so the pedalboard has data. It proves
that the UI works. It proves nothing about the protocol.

## What happens on its own

1. On page load, the app asks Chrome for MIDI access. With the permission
   already granted, Chrome gives it without a prompt.
2. When the pedal is plugged in (now or later), the app opens its ports.
3. It turns on edit reports (`50`) and asks which patch is active (`33`).
4. It loads the current patch onto the pedalboard.
5. It backs up all 300 patches into memory (about 35 s; the BACKUP light
   blinks). The backup unlocks writes and fills the patch list. It does not
   download a file: click **Save backup (.syx)** to keep one.

A reconnect clears the backup and runs a new one.

## The screen

### Header

The green screen shows the patch number, the patch name and the tempo. The
small LED next to the tempo blinks on the beat, like the pedal's tap LED.
**◀ / ▶** go to the previous or next patch (Bank Select + Program Change,
the same messages the pedal sends when you step by foot). The lights show
MIDI, BACKUP and **EDIT REAL PATCHES**.

**Warning:** auto-save is ON. The pedal keeps every edit when you leave the
patch. Click EDIT REAL PATCHES only when you want to change a patch that is
not Empty and not written by this app.

### Pedalboard

The current patch as 6 stompboxes, input to output. The colour shows the
effect type (green drive, brown amp, white delay, and so on).

- **Knob:** the orange ring shows the value. Drag up or down, or focus it (Tab) and scroll or use the arrow
  keys. Page Up/Down move 10 %, Home/End go to the ends.
- **Switch:** a knob with two values (ON/OFF, SLOW/FAST).
- **Footswitch:** turns the effect on or off. The red LED shows the state.
- **Effect name:** opens the effect search. Type to filter by effect name,
  type or knob name (for example `delay repeat`, `plate`). Colour chips narrow
  the list. **↑ / ↓** move, **Enter** picks, **Esc** closes.
  "— empty slot —" clears the slot.

The board is read-only (🔒) until the backup finishes, and on real patches
until you click EDIT REAL PATCHES.

### Recorder

Records what you play through the pedal, then plays it back.

1. Click **Use pedal audio**. Chrome asks for microphone permission once.
   The G2X FOUR is a USB audio interface, so its output appears as a
   microphone. The app picks it by name. Use the **Input** list to change it.
2. Play. The bar shows the level. If "Clipping" shows, turn the pedal's
   output level down.
3. Click the red button to start. Click it again to stop. The take appears
   in the list with the patch name and the time.

- **Countdown** (Off, 3 s or 5 s) waits before the take starts, so you can get
  your hands on the guitar. The screen counts down in big amber digits, and the
  record button blinks amber. Click the button again to cancel. The pedal toe
  switch also starts the countdown. The app keeps your choice in this browser.
- **Loop playback** repeats the take, so you can play along over it.
- **Save** downloads the take (`.webm`, Opus, 256 kbit/s). **Delete** removes it.
- The takes stay in memory only. A reload deletes the takes that you did not save.
- If you unplug the pedal during a take, the take stops and stays in the list.

**Listen** plays the pedal's sound through the computer, to the output you
pick. It is off each time the page loads.

1. Click **Use pedal audio**, then **Listen**.
2. Pick your headset in **Output**. Only that output plays it.
3. Set **Volume**. The box next to it shows the delay that Chrome reports:
   green up to 15 ms, amber up to 30 ms, red above.

Every path through the computer adds delay: USB, Windows, Chrome, and the
headset's own link. **For no delay, plug wired headphones into the pedal's
PHONES jack** (left side). The app warns you when:

- the output is a wireless headset (Bluetooth or a 2.4 GHz dongle). Its own
  delay is not in the number, and it is often the biggest part.
- the output is the pedal itself. You would hear the sound twice.

**Expression pedal.** Click **Learn pedal**, then move the pedal. The app
keeps the first control message that arrives: a Control Change, or the edit
report of the knob that the pedal drives in this patch. Rock the pedal from
heel to toe once so the app learns the range. This first sweep does not
start anything. Then each push to the toe end starts or stops the recording; untick **Toe down
starts and stops the recording** to only watch the bar. The bar shows the pedal
position. **Forget** clears what the app learned.

Warning: we did not verify on hardware what the G2X FOUR sends over USB
when the expression pedal moves. If "Move the pedal now…" stays, the pedal
sends nothing for that patch. Try a patch that assigns the pedal to an
effect (volume, wah, or a knob).

### Metronome

A click that plays through the computer's sound output. To hear it in the
pedal's headphones, set the G2X FOUR as the Windows sound output.

- **▶ / ■** (or the space bar) starts and stops the click. Beat 1 has a higher
  tone, and the first beat of a new section an even higher one.
- **− / + / Tap / Meter / Volume** set the click. Type a tempo in the box and
  press Enter (Esc undoes). **Meter** is beats per bar and the beat unit (4 or 8).
  A change applies from the next beat.
- **Follow the patch tempo:** each patch change on the pedal sets the click to
  that patch's tempo. Use one patch per song part, and the click follows your
  footswitch.
- **Set patch tempo to N** writes the tempo into the current patch, so a synced
  delay matches the click. Warning: auto-save keeps it. The write gate applies:
  the backup must be done, and a real patch needs EDIT REAL PATCHES.
- **Find a song** searches 41 songs by title or artist (accents ignored).
  Picking a song loads its tempo map and selects its patch, if a recipe wrote
  one and it is on the pedal. See [songs.md](songs.md) for where the maps come
  from.
- **Parts:** the song shows its parts in order (Intro, Verse, Chorus …) with
  their tempo, meter and bars. Pick a part to start there. While the click
  plays, a picked part starts at the next bar line, so the click never stumbles.
  **Next part** does the same for the next one.
- **Loop this part** repeats the part, for practice.
- **Tempo %** scales every part (50 % to learn a riff, 200 % for a half-time
  chart). **Count-in bar** plays one bar at the start tempo before the song.
- The screen shows the part and "bar 3/16". The first beat of a new part has the
  highest tone. Bars in odd meters (21/32 in Master of Puppets) end on a short
  click, so beat 1 stays on time.
- **Free tempo** leaves the song.

### Patches

Every patch from the backup, in banks of 10 like the pedal. Click one to
load it on the pedal. Search by name or number. Empty slots are hidden unless
you tick **Show Empty slots**. A ★ marks the patches that the built-in song
recipes write. **Back up again** reads all 300 patches again, for example after
you edit patches on the pedal itself.

### Tabs

Opens a tab file and plays it: Guitar Pro (`.gp`, `.gpx`, `.gp3`–`.gp5`),
MusicXML, or a draft from [autotab](autotab.md) (`.tex`). The panel loads
alphaTab only the first time you open it.

- **Track** picks one guitar when the file has several (an autotab draft of a
  two-guitar song has "Guitar L" and "Guitar R").
- **Play / Stop**, **Speed** (50–110 %) and **Click** (a metronome on the
  beat). The sound comes out of the computer's output, not the pedal.

### Song recipes → new patch

Pick or paste a recipe (JSON). The preview shows the effects, knob values
and every compromise. **Write patch** puts it into the Empty slot you
choose and verifies it. Right before the write, the app reads the slot again:
if it is not Empty any more (another tab, an edit on the pedal), nothing is
written. While a patch is written, the patch buttons, the patch list, the song
picker and the knobs are locked. If the pedal changes patch during the write
(a footswitch), the write stops and names the slot to check. See
[recipes.md](recipes.md).

### Restore or copy a patch from the backup

Pick a patch from this session's backup, or load a `.syx` file. Choose the
target slot (default: the slot it came from), then **Restore**. A different
target slot makes a copy. The app sends the pedal's own dump and reads the
slot again to verify it.

- A slot with a real patch needs you to type its number first.
- Right before the write, the app reads the slot again. If it no longer holds
  the patch the list shows, nothing is written.
- The app refuses to write the slot the pedal is on, because auto-save could
  undo it. Switch to another patch first. It also waits until it knows which
  slot the pedal is on.

### Lab

For research: port selection, identity request, the raw SysEx console
(with the read / unknown / blocked verdict and research mode), the flash
file list and the message log with export. The rules of the console are in
[g2x-four-protocol.md](g2x-four-protocol.md).

## Safety rules

1. No write without a full backup in the same session.
2. Writes go only to Empty slots, or to slots this app wrote a recipe into in
   this session. Real patches need an explicit tick (edits) or the typed slot
   number (restore). A restored patch counts as real.
3. Right before a recipe write or a restore, the app reads the target slot
   again and stops if it changed.
4. A new connection clears the backup and the list of writable slots.
5. Known dangerous commands are blocked with no override. The list is in
   [g2x-four-protocol.md §3.3](g2x-four-protocol.md#33-dangerous-commands-always-blocked).

## When something goes wrong

| You see | Do this |
|---|---|
| "Cannot open the MIDI port" | Close Handy Guitar Lab / DAWs, unplug and replug, reload |
| No identity reply | Check the port pair; reload the page |
| The page does not follow patch changes | Unplug and replug the pedal: a new connection turns on edit reports (`50`) |
| The screen says PLUG IN PEDAL with the pedal on | Close Handy Guitar Lab / DAWs; check the cable carries data |
| A patch looks wrong after a write | Restore it from the backup `.syx` (Restore section) |
| "Write refused: …" | Read the reason: usually no backup yet, or not an Empty slot |

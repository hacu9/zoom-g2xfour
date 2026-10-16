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

Other commands: `npm test` (unit tests), `npm run build` (type check + bundle).
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

- **Loop playback** repeats the take, so you can play along over it.
- **Save** downloads the take (`.webm`, Opus, 256 kbit/s).
- The takes stay in memory only. A reload deletes the takes that you did not save.
- If you unplug the pedal during a take, the take stops and stays in the list.
- The page does not play your input live. You hear yourself through the
  pedal's headphone output, with no delay and no feedback loop.

**Expression pedal.** Click **Learn pedal**, then move the pedal. The app
keeps the first control message that arrives: a Control Change, or the edit
report of the knob that the pedal drives in this patch. Rock the pedal from
heel to toe once so the app learns the range. This first sweep does not
start anything. Then each push to the toe end starts or stops the recording. The bar shows the pedal position.

Warning: we did not verify on hardware what the G2X FOUR sends over USB
when the expression pedal moves. If "Move the pedal now…" stays, the pedal
sends nothing for that patch. Try a patch that assigns the pedal to an
effect (volume, wah, or a knob).

### Patches

Every patch from the backup, in banks of 10 like the pedal. Click one to
load it on the pedal. Search by
name or number. Empty slots are hidden unless you tick **Show Empty slots**.
A ★ marks the patches that the built-in song recipes write.

### Song recipes → new patch

Pick or paste a recipe (JSON). The preview shows the effects, knob values
and every compromise. **Write patch** puts it into the Empty slot you
choose and verifies it. If the pedal changes patch during the write, the
write stops and names the slot to check. See [recipes.md](recipes.md).

### Restore or copy a patch from the backup

Pick a patch from this session's backup, or load a `.syx` file. Choose the
target slot (default: the slot it came from), then **Restore**. A different
target slot makes a copy. The app sends the pedal's own dump and reads the
slot again to verify it.

- A slot with a real patch needs you to type its number first.
- The app refuses to write the slot the pedal is on, because auto-save could
  undo it. Switch to another patch first.

### Lab

For research: port selection, identity request, the raw SysEx console
(with the read / unknown / blocked verdict and research mode), the flash
file list and the message log with export. The rules of the console are in
[g2x-four-protocol.md](g2x-four-protocol.md).

## Safety rules

1. No write without a full backup in the same session.
2. Writes go only to Empty slots, or to slots this app wrote in this session.
   Real patches need an explicit tick (edits) or the typed slot number
   (restore).
3. A new connection clears the backup and the list of writable slots.
4. Known dangerous commands are blocked with no override. The list is in
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

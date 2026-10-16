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
6. Click **Connect**. Allow "MIDI device control & reprogram" when Chrome
   asks. That permission is the SysEx permission.

Other commands: `npm test` (unit tests), `npm run build` (type check + bundle).
**Use mock pedal** runs the UI against an invented pedal. It proves that the
UI works. It proves nothing about the protocol.

## The panels

### 1 · Connect and 2 · Identify

Connect lists every MIDI port and selects the ports that contain "ZOOM" or
"G2". The app then turns on edit reports (`50`) and asks which patch is
active (`33`). From then on it follows every patch change, also changes by
foot. **Send Identity Request** decodes the model. Keep the device ID at `6E`.

### 3 · Raw SysEx console

For research. Type hex or click a prefill, then **Send…**. Every send shows a
dialog with the bytes and the verdict.

- **read:** a known read-only command.
- **unknown:** sent only after you confirm. An unknown Zoom command also needs
  **research mode**, which is off at every page load.
- **blocked:** never sent. This includes firmware mode, factory reset, bank
  delete and every patch write. Research mode cannot send patch writes; use
  the panels below.

**Back up all patches** reads all 300 slots (about 35 s) and saves
`g2xfour-backup-<time>.syx`. **Save summary (.json)** saves a readable list.
Chrome blocks a second automatic download, so the summary needs your click.

**List flash files** lists the 260 files in the pedal's flash.

### 4 · Edit current patch

**Load current patch** shows the active patch: 6 slots, each with on/off, the
effect and its knobs. Changes go to the pedal at once.

To change an effect, click its name. A search window opens:

- Type to filter by effect name, type or knob name. Every word must match
  (for example `delay repeat`, `plate`, `chorus rate`).
- Click a type chip (Drive, Amp, Delay, …) to narrow the list.
- **↑ / ↓** move, **Enter** picks, **Esc** closes. "— empty slot —" clears the slot.

**Warning:** auto-save is ON. The pedal keeps every edit when you leave the
patch. So the editor works only on Empty slots, until you tick **Edit real
patches**. Make a backup first: the editor is read-only without one.

### 5 · Restore from backup

Pick a patch from this session's backup, or load a `.syx` file. Choose the
target slot (default: the slot it came from), then **Restore**. The app sends
the pedal's own dump back and reads the slot again to verify it.

- A slot with a real patch needs you to type its number first.
- The app refuses to restore the slot the pedal is on, because auto-save could
  undo the restore. Switch to another patch first.

### 6 · Tone recipe → patch

Paste or edit a recipe (JSON). The preview shows the effects, knob values and
every compromise. **Write patch** puts it into the Empty slot you choose,
reads it back, lets auto-save store it, and reads the stored slot to verify.
If the pedal changes patch during the write (for example a footswitch), the
write stops at once and names the slot to check.

### 7 · Log

Every message in and out, with time, hex, ASCII and decoded notes. Filter by
direction. **Export log** saves it as `.txt`.

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
| The page does not follow patch changes | Reconnect: Connect turns on edit reports (`50`) |
| A patch looks wrong after a write | Restore it from the backup `.syx` (panel 5) |
| "Write refused: …" | Read the reason: usually no backup yet, or not an Empty slot |

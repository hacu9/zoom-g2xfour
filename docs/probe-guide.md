# Probe guide — Phase 1

## Run it

1. Install once: `npm install`.
2. Start: `npm run dev`. Vite serves on `http://localhost:5173`.
3. Open the URL in **desktop Chrome or Edge on Windows** (not WSL Chrome).
   WSL2 forwards `localhost`, so the Windows browser reaches the WSL server.
   Web MIDI needs a secure context; `localhost` counts as one.
4. Connect the G2X FOUR with a USB **data** cable and switch it on.
5. Close Handy Guitar Lab, Zoom Guitar Lab and every DAW. On Windows, only one
   program at a time can open a MIDI port.
6. Click **Connect**. Chrome asks for "MIDI device control & reprogram". Allow it.
   That permission is the SysEx permission.

Other commands: `npm test` (unit tests), `npm run build` (type check + bundle).
**Use mock pedal** runs the UI against an invented pedal. Mock replies prove
that the UI works. They prove nothing about the protocol.

## Order of the probe

1. **Connect.** The log lists every port. Write down the exact port names.
   - No ZOOM port: the pedal is not class-compliant USB MIDI, or a driver /
     other app holds it. Stop and check this first. Everything else depends on it.
2. **Send Identity Request.** Expected: `F0 7E <ch> 06 02 52 <fam> <fam> <mem> <mem> <v1..v4> F7`.
   - `52` = Zoom. The family LSB is the Zoom ID candidate.
   - No reply in 1.5 s: wrong port pair, or the pedal ignores the universal request.
3. **Device ID.** Keep `6E` first. zoom-zt2 issue #46 shows other models also
   answer to `6E`. If `6E` gets no reply, click **Use family code** and retry.
4. **Read-only prefills**, one at a time, in this order:
   `60 29` → `64 11` → `55` → `64 42` → `64 02 00 07 00` → `44` / `48` / `64 0A` / `64 18`.
5. **List flash files.** The loop stops on a reply with no file name, a repeated
   name, a timeout, or 256 steps. It always ends with `60 27`.
6. Change the patch on the pedal by hand, send `64 02 00 07 00` again, and
   compare the two replies. The bytes that change carry the patch content.
7. **Export log** after each session. Keep the files: they become the Phase 2
   test fixtures.

## What to look for in the log

| You see | It means |
|---|---|
| Replies echo `F0 52 00 6E` | `6E` is the right address for the G2X FOUR too |
| A reply to `60 29` | Flash info works. Compare with the B2 FOUR (≈5.7 MB) |
| `64 10 xx xx …` after `64 11` | DSP scale. The G1 FOUR answers `66 01` (230) |
| ASCII runs such as `*.ZDL` | Effect files in flash — the effect names for the catalog |
| ASCII patch name in the `64 01` reply | The patch-name offset. Count bytes from F0 |
| `IN` messages when you turn a knob | The pedal pushes edits unasked — the editor protocol |
| Nothing at all | Wrong port, wrong ID, or the pedal needs an "editor on" command first |

The `7→8 unpack GUESS` note in the log is a guess. It uses one bit order and
starts at body byte 2. Treat it as a hint, never as a decode.

## Safety rules in the code

- `src/midi/session.ts` is the only path to the output port. Every send goes
  through `classify()` in `src/midi/safety.ts`.
- **Blocked, no override:** `64 47` (creates a new patch — confirmed in issue #64),
  any `60 xx` file op except `25/26/27/29`, Zoom bodies longer than 48 bytes,
  non-Zoom SysEx, universal SysEx other than the Identity Request.
- **Unknown Zoom commands** need research mode AND a second confirmation.
  Research mode is off at every page load.
- Every console send shows a confirmation dialog with the bytes and the verdict.

**Warning:** research mode can send commands that nobody has mapped. Back up your
patches in Handy Guitar Lab before you turn it on.

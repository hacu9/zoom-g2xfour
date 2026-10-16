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
   name, a timeout, or 2048 steps. It always ends with `60 27`.
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
- **Blocked, no override:** `64 47` (deletes the current bank), `01`/`03`/`04`
  (firmware mode), `5B` (factory reset), `28`/`45`/`08`/`64 12` (patch writes),
  `31`/`32` (MS edits/store), `64 20 00 64 xx` (structure and global settings),
  every undocumented one-byte command, any `60 xx` file op except `25/26/27/29`,
  Zoom bodies longer than 48 bytes, non-Zoom SysEx, and universal SysEx other
  than the Identity Request.
- **Unknown Zoom commands** need research mode AND a second confirmation.
  Research mode is off at every page load.
- Every console send shows a confirmation dialog with the bytes and the verdict.

**Warning:** research mode can send commands that nobody has mapped. Back up your
patches in Handy Guitar Lab before you turn it on.

## Findings log (real hardware)

| Date | Command | Result |
|---|---|---|
| 2026-10-15 | Connect | Class-compliant USB MIDI, no driver. 1 in / 1 out, both named `ZOOM G2/G2X FOUR`, manufacturer `ZOOM Corporation`. |
| 2026-10-15 | Identity Request | `F0 7E 00 06 02 52 6E 00 1C 00 31 2E 30 30 F7` — Zoom, family `6E 00` (same as B2 FOUR), member `1C 00`, version bytes `"1.00"`. The version bytes may not be the firmware version — compare with the pedal. |
| 2026-10-15 | `60 29` | `60 04 29 00 00 08 00` + total + free, each 5 septets LE. 5,963,220 bytes total (same as B2 FOUR), 887,530 free. |
| 2026-10-15 | `64 11` | `64 10 36 02 04 01 00` → DSP scale `36 02` = 310 (G1 FOUR 230, MS+ 270). |
| 2026-10-15 | `64 02 00 07 00` | `64 01` + 60 records × 14 bytes: `[slot][row][0=value,1=label] 00` + 10 ASCII. 7 slots (0–6). Row 0 On/Off, row 1 effect name, rows 2–5 the 4 on-screen params. Screen text, not raw values. Slot 6 held ZNR. No patch name seen yet. |
| 2026-10-15 | `60 25/26/27` | 260 files. Entry: name (8.3) at body 11, size 4 septets LE at body 26. 101 `.ZD2` = 79 effects + 22 amp/cab (`*IR.ZD2` with a `.ZIR`). Also `G_OUT_EQ.BDL`, `FLST_SEQ.ZT2` (effect order list), drum `.raw` samples, `IR000/001.ZIR`. End of list = reply with no name. |
| 2026-10-15 | `44`, `48`, `55`, `64 42`, `64 0A`, `64 18` | Replies `43 …`, `47 …`, `54 10 …`, `64 43 …`, `64 09 …` (contains "Aco.Sim", "222P"), `64 19 …`. Meaning still unknown. |

Decoders for the confirmed formats: `src/midi/decode.ts`. Real dumps: `tests/fixtures/`.
| 2026-10-15 | `64 13` | `64 12 01 <len 40 06 = 832> <7-bit data MSB-first> <5-byte CRC>` → PTCF patch. Name "Evil Eye 1984", chunks TXJ1 TXE1 EDTB PRM2 NAME, 8 EDTB entries. Entries 0–3 match the screen dump exactly through the zoom-explorer catalog. Open: entry 6 = `Output VP` (0b000010), entry 7 = unknown `1c000010`, while the screen shows ZNR in slot 6. PRM2 tempo 120 / volume 100 use the MS Plus layout — unverified. |
| 2026-10-15 | `07` | `06 2C 02 40 06` → 300 patches, 832 bytes each. |
| 2026-10-15 | `33` | `B0 00 00`, `B0 20 0E`, `C0 00` → bank 14, program 0. |

## External sources

- [thammer/zoom-explorer](https://github.com/thammer/zoom-explorer) (MIT), commit `aee0143`: command table, PTCF patch format, and the G2 FOUR parameter catalog vendored in `src/catalog/vendor/`. Its README lists the dangerous commands that the gate now blocks: `01` firmware mode, `5B` factory reset, `64 47` bank delete, `28`/`45` patch writes.

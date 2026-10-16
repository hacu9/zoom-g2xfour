# Zoom G2X FOUR — MIDI / SysEx protocol reference

Everything this project found about the G2X FOUR protocol, in one place.
Status of each fact:

- **Verified** = tested on a real G2X FOUR (member code `1C`), 2026-10-15.
- **Source** = documented by another project, not tested here.
- **Open** = not known.

Real dumps for every verified format are in `tests/fixtures/`.

## 1. Transport

| Fact | Status |
|---|---|
| USB class-compliant MIDI, no driver. One input and one output port, both named `ZOOM G2/G2X FOUR`, manufacturer `ZOOM Corporation`. | Verified |
| Windows gives a MIDI port to one program at a time. Close Handy Guitar Lab and every DAW first. | Verified |
| Web MIDI works in desktop Chrome/Edge with `sysex: true` on `http://localhost`. | Verified |
| MIDI data bytes are 7-bit. Long payloads use the 7→8 packing in §4. Sizes and counts use 7-bit little-endian groups ("septets"). | Verified |

## 2. Identity and addressing

```
→ F0 7E 7F 06 01 F7
← F0 7E 00 06 02 52 6E 00 1C 00 31 2E 30 30 F7
```

| Byte(s) | Meaning | Status |
|---|---|---|
| `52` | Manufacturer: Zoom | Verified |
| `6E 00` | Family code. Same as the B2 FOUR, MS-60B+ and MS-70CDR+. | Verified |
| `1C 00` | Member code: G2 FOUR / G2X FOUR | Verified |
| `31 2E 30 30` | "1.00". Probably NOT the firmware version. | Open |

Every Zoom SysEx message has the form `F0 52 00 6E <command…> F7`.
`6E` is the family address, not a per-model ID.

## 3. Commands

### 3.1 Reads (safe; allowed by the read gate)

| Send (after `F0 52 00 6E`) | Reply | Meaning | Status |
|---|---|---|---|
| `07` | `06 <count 2> <length 2>` | `2C 02 40 06` = **300 patches, 832 bytes each** | Verified |
| `44 00 00 00 00` | `43 <count 2> <length 2> <? 2> <per bank 2> …` | 300, 832, ?, **10 patches per bank** | Verified |
| `33` | `B0 00 <msb>`, `B0 20 <bank>`, `C0 <program>` | Current bank and program | Verified |
| `64 13` | `64 12 01 <length 2> <7-bit PTCF> <CRC 5>` | **Current patch, raw** (§5) | Verified |
| `46 00 00 <bank 2> <program 2>` | `45 00 00 <bank 2> <program 2> <length 2> <7-bit PTCF> <CRC 5>` | **Stored patch in any slot.** The reply echoes the slot. | Verified |
| `64 02 <first> <last> 00` | `64 01` + 14-byte records (§6) | Screen text: slots, effect names, 4 knobs each | Verified for `00 07 00`; other ranges are source only |
| `60 29` | `60 04 29 00 00 08 00 <total 5> <free 5>` | Flash: 5,963,220 bytes total, 887,530 free | Verified |
| `60 25 00 00 2A 2E 2A 00` / `60 26 …` / `60 27` | `60 04 25 …` per file | List flash files (§7) | Verified |
| `64 11` | `64 10 36 02 04 01 00` | DSP scale `36 02` = 310 (G1 FOUR 230, MS+ 270) | Verified |
| `50` | `00 00` | **Edit reports on.** Needed for `64 26` and the CC/PC echo (§8). | Verified |
| `55`, `44`, `48`, `64 42`, `64 0A`, `64 18 00 00 64 00` | `54 10 …`, `43 …`, `47 …`, `64 43 …`, `64 09 …`, `64 19 …` | Info replies. Meaning unknown. | Open |

### 3.2 Writes (only through the write gate)

| Send | Effect | Status |
|---|---|---|
| `64 20 00 <slot 0-5> 00 <0/1> 00 00 00 00` | Effect on/off | Verified for "on" (recipe writes); "off" is source only |
| `64 20 00 <slot> 01 <id: 5 septets>` | Put an effect into a slot. The pedal sets its default knobs and pushes `64 12 00` (the new patch). | Verified |
| `64 20 00 <slot> <2 + knob> <value: 5 septets>` | Set a knob. Ack: `64 20 01 <slot> <param> <value…>`. **No ack when the value does not change.** | Verified |
| `64 20 00 5F <index> <ASCII> 00 00 00 00` | Patch name, one character per message. 14 characters (index 0–13). | Verified |
| `64 20 00 64 02 <bpm: 2 septets> 00 00 00` | Patch tempo | Verified (wrote 123, read 123) |
| `45 00 00 <bank 2> <program 2> <length 2> <7-bit PTCF> <CRC 5>` | Store a patch in a slot. Re-sending a `45` dump from a backup restores it byte for byte. Ack: `00 00`. | Verified |

Value encoding, all writes: `v & 7F, (v >> 7) & 7F, (v >> 14) & 7F, (v >> 21) & 7F, (v >> 28) & 7F`.
Example: Comp, ID `0x01000010` → `10 00 00 08 00`.

### 3.3 Dangerous commands (always blocked)

**Warning:** never send these. Source: thammer/zoom-explorer README, zoom-zt2 issue #64.

| Command | What it does |
|---|---|
| `5B` | **Factory reset — wipes all user patches** |
| `64 47` | Creates a new bank and **deletes the current bank** |
| `01` / `04` (`03`) | Enter / leave firmware update mode |
| `28` | Replaces the current patch (older pedal format) |
| `64 20 00 64 xx` | Patch structure and global settings (delete/insert/move effects, auto-save, tuner, ECO). `64 09` with a value above `0A` freezes the pedal. Only `64 02` (tempo) is allowed. |
| `60 xx` | Flash file system. Only `25`, `26`, `27`, `29` are known to be read-only. |
| Other one-byte commands | Blind tests can brick the pedal (zoom-explorer). |

## 4. 7-bit packing

Each group of up to 8 bytes starts with one byte that holds the high bits of
the next 7 bytes, **MSB-first**: bit 6 belongs to the first data byte, bit 0 to
the seventh. (The same as `seven2eight()` in zoom-explorer.)

`unpacked length = floor(n / 8) × 7 + (n mod 8 < 2 ? 0 : n mod 8 − 1)`.
A dump carries a 5-byte CRC after the data when
`unpackedLength(n − 5) == declared length`. The project strips it and never
computes it: restores re-send the pedal's own bytes.

## 5. Patch format (PTCF)

832 bytes per slot. Only the first `<PTCF length>` bytes are meaningful.
**The tail keeps leftovers from older patches** (seen: "USER-001" after an
"Empty" patch). So compare PTCF bytes only.

| Offset | Size | Field | Status |
|---|---|---|---|
| 0 | 4 | `"PTCF"` | Verified |
| 4 | 4 LE | PTCF length | Verified |
| 8 | 4 LE | Version | Verified |
| 12 | 4 LE | Number of effects: 8 on real patches, 6 on "Empty" | Verified |
| 16 | 4 LE | Target | Source |
| 20 | 6 | Unknown | Open |
| 26 | 10 | Short name | Verified |
| 36 | 4 × n | Effect IDs | Verified |
| then | | Chunks: 4-byte ID + 4-byte LE length + data | Verified |

Chunks seen: `TXJ1` (empty), `TXE1` (empty), `EDTB`, `PRM2`, `NAME`.

**EDTB** holds one 24-byte entry per effect, read as a little-endian bit field:

| Bits | Field |
|---|---|
| 0 | On/off |
| 1–29 | Effect ID |
| 30+ | Knobs, widths `12 12 12 12 12 8 8 8 12 8 8 8 12 8 8 8 1 1 1` |

A knob value is an **index** into that parameter's value list in the catalog
(`src/catalog/vendor/zoom-explorer-g2four.json`). Example: AnalogDly Time 365
= "366" ms, 945 = dotted eighth.

**PRM2** (MS Plus layout): tempo = `(p[n−2] >> 4) + ((p[n−1] & 0F) << 4)` —
verified. Volume = `(p[9] >> 5) + ((p[10] & 0F) << 3)` — open.

**NAME**: ASCII, space-padded, 14 characters visible on the pedal.

Effect slots on this pedal:

| EDTB entry | Content | Status |
|---|---|---|
| 0–5 | The 6 user effect slots | Verified |
| 6 | `Output VP` (`0b000010`) on every real patch | Verified |
| 7 | ID `1c000010`, not in the catalog. The screen shows ZNR at this position. | Open |

## 6. Screen text (`64 01`)

`64 01` + records of 14 bytes: `[slot] [row] [0 = value | 1 = label] 00` + 10
ASCII bytes. Row 0 = On/Off, row 1 = effect name, rows 2–5 = the 4 knobs on
the screen. This is display text ("OFF", "20"), not stored values, and it
holds no patch name. It agrees with the PTCF patch mapped through the catalog
(`tests/ptcf.test.ts`).

## 7. Flash files

`60 04 25 …` per entry: name (8.3) at body byte 11, size (4 septets LE) at
body byte 26. A reply with no name ends the list. 260 files:

| Files | Meaning |
|---|---|
| 101 × `.ZD2` (+ `.ZIC` icons) | Effect binaries: **79 effects + 22 amp/cab models** (the `*IR` ones, each with a `.ZIR` impulse response) |
| `FLST_SEQ.ZT2` | Effect order list (zoom-zt2 can parse it) |
| `G_OUT_EQ.BDL` | Output EQ |
| `*.raw`, `RHYTHM.ZIC` | Drum machine samples |
| `IR000/001.ZIR`, `IR_INFO.BIN`, `INFBKUP.BIN`, `DUMMY.WAV` | Other system files |

Effect file names do not map 1:1 to effect names (`AIR5G.ZD2` = AirReverb).

## 8. Pedal behaviour

| Behaviour | Status |
|---|---|
| **Auto-save is ON.** Edits to the current patch are stored when the patch changes. The pedal then sends the stored `45` dump by itself. | Verified |
| An "Empty" patch that gets an effect renames itself to `USER-nnn` (burst of `64 20 00 5F` name messages). | Verified |
| Patch changes report `64 26 00 00 <bank 2> <program 2>`, a CC/PC echo and `64 20 00 64 02 <tempo>` — **only while `50` is on**. | Verified |
| A program change to the slot the pedal is already on does not reload the edit buffer and does not save reliably. Hop to another slot and back. | Verified |
| Banks of 10: slot = bank × 10 + program. Bank select = `B0 00 00`, `B0 20 <bank>`, then `C0 <program>`. | Verified |

## 9. State of this pedal (2026-10-15)

| Slots | Content |
|---|---|
| 0–249 | Patches (factory or user — not told apart) |
| 140 | "Evil Eye 1984" (the patch at the start) |
| **250** | **"Rain Scallon"** — written by this project, selected on the pedal. Delay changed to v3 (digital Delay, Repeat 60, Mix 70); auto-save stores it at the next patch change. |
| 251–296, 298, 299 | "Empty" |
| 297 | "USER-001" — made on the pedal before this project, not touched |

Backups: `backups/*.syx` (gitignored).

## 10. Open questions

1. EDTB entry 7, ID `1c000010`. Is it ZNR?
2. The meaning of the replies to `44`/`48`/`55`/`64 42`/`64 0A`/`64 18`.
3. Delay `Mode` SHORT vs LONG: which millisecond range each one covers.
4. Writing the output EQ (`G_OUT_EQ.BDL`). No write command is known.
5. Reading `FLST_SEQ.ZT2` and the `.ZD2` files. That needs a file-open command, which is blocked.
6. The identity version bytes "1.00" vs the real firmware version.
7. Whether auto-save can be read (not set) safely.

## 11. Sources

- [thammer/zoom-explorer](https://github.com/thammer/zoom-explorer) (MIT), commit `aee0143`: command table, dangerous commands, PTCF format, 7-bit packing, G2 FOUR catalog (vendored).
- [mungewell/zoom-zt2](https://github.com/mungewell/zoom-zt2), issues [#46](https://github.com/mungewell/zoom-zt2/issues/46) and [#64](https://github.com/mungewell/zoom-zt2/issues/64): first commands on the B2/G1 FOUR, the file listing, `64 47`.
- [shooking/ZoomPedalFun](https://github.com/shooking/ZoomPedalFun): background on the FOUR series.

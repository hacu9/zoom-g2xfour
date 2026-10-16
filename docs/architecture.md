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
    backup.ts      46 slot reads, .syx export, duplicate detection
    ptcf.ts        Raw patch reader (PTCF): effects, params, name, tempo
    decode.ts      Screen text, file entries, flash info
    identity.ts / zoom.ts / hex.ts / annotate.ts / fileList.ts
  catalog/         G2 FOUR effect + parameter catalog (vendored from zoom-explorer)
  editor/          PatchEditor, RestorePanel, RecipePanel
  recipe/          ToneRecipe types, translate.ts (recipe → plan), apply.ts (plan → pedal), recipes/*.json
  tempo/delay.ts   ms = 60000 / BPM × note value
  log/ probe/      Log, export, console UI
  App.tsx          Page: connect, identify, console, backup, editor, restore, recipe, log
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

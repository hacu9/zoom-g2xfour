# Architecture

Vite + React + TypeScript. No backend. The browser talks to the pedal through
the Web MIDI API with `sysex: true`.

```
src/
  midi/            Phase 1 — transport and protocol knowledge
    backend.ts     Web MIDI wrapper + port auto-select (/zoom|g2/i)
    mock.ts        Invented pedal for UI tests (never evidence)
    session.ts     ProbeSession: the ONLY path to the output port; request/response
    safety.ts      classify(): read | unknown | blocked
    commands.ts    Read-only allowlist + blocked patterns, each with its source
    identity.ts    Universal Identity Request / Reply
    zoom.ts        F0 52 00 <id> framing, 7→8 unpack (hypothesis), ASCII runs
    fileList.ts    60 25 / 60 26 / 60 27 flash listing loop
    annotate.ts    Notes on incoming messages for the log
    hex.ts         Parse / format / validate
  log/             Log entries, text export
  probe/           Phase 1 UI components
  App.tsx          Phase 1 page
  patch/           Phase 2 — Patch model, codec/ (decode, encode)
  catalog/         Phase 2 — G2X FOUR effect + parameter catalog (JSON)
  recipe/          Phase 2 — ToneRecipe JSON + translator
  tempo/           Phase 2 — delay calculator
tests/             Vitest unit tests (node env, mock pedal)
```

## Decisions

- **Allowlist, not denylist.** Phase 1 sends only exact byte matches from
  `READ_COMMANDS`. A denylist would fail open on a write that nobody has seen yet.
- **`6E` is the default ID, not the identity family code.** zoom-zt2 issue #46
  shows the MS-60B+ and MS-70CDR+ also answer to `6E`, so it looks like a shared
  address for the generation. The UI offers both.
- **`64 47` is blocked.** The user brief listed it as "new patch". Issue #64 shows
  that it creates a patch on the pedal, so it is a write.
- **The write path (Phase 2 encoder) gets its own gate.** It never reuses the
  Phase 1 allowlist, so Phase 1 stays read-only by construction.

## Phase 2 data flow (planned)

```
ToneRecipe JSON ─► recipe/translate ─► Patch ─► patch/codec/encode ─► write gate ─► session
                         ▲                ▲
                    catalog JSON      patch/codec/decode ◄── probe dumps (fixtures)
```

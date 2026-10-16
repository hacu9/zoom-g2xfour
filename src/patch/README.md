# patch/ — Phase 2 (not built)

- `types.ts` — the patch model the UI and the translator use.
- `codec/` — `decode(bytes) -> Patch` and `encode(Patch) -> bytes`.

Build the codec only after the probe logs show the patch reply layout
(`64 02 00 07 00` -> reply `64 01 …`). Keep the raw dumps from the probe as
test fixtures in `tests/fixtures/` and write a round-trip test first:
`encode(decode(dump))` must equal `dump`, byte for byte.

The encoder produces WRITE messages. It stays behind its own safety gate and
never shares the Phase 1 read-only allowlist.

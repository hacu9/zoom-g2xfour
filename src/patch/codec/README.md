# patch/codec — Phase 2 (not built)

Planned files:

- `unpack.ts` — 7-bit to 8-bit unpack, once the bit order is confirmed from a dump.
- `decode.ts` — patch reply -> `Patch`.
- `encode.ts` — `Patch` -> SysEx (write path, separately gated).

Reference: mungewell/zoom-zt2 `zoomzt2.py` (B1/B2/G1 FOUR). Verify every
offset against a G2X FOUR dump before you trust it.

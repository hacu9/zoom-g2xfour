# recipe/ — Phase 2 (not built)

- `types.ts` — the `ToneRecipe` JSON shape. See `example.recipe.json`.
- `translate.ts` (planned) — `ToneRecipe -> Patch`. It picks catalog effects by
  category, maps 0–100 values onto each parameter's real range, and returns a
  warning for every compromise (slot limit, DSP limit, missing effect type).

The G2X FOUR allows 6 slots. A recipe with compressor + drive + amp + mod +
delay + reverb already uses 6, so the output EQ must use the patch EQ, not a slot.

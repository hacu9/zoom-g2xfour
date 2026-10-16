# catalog/

`g2four.ts` serves the G2 FOUR effect + parameter catalog (157 effects, every
parameter's value list, max and default). The data comes from
thammer/zoom-explorer (MIT) — see `vendor/README.md`. It replaced the plan to
type the catalog in from Zoom's Effects List PDF.

Checked against the real pedal on 2026-10-15: raw patch values mapped through
the catalog equal the text on the pedal screen (`tests/ptcf.test.ts`).

`types.ts` and `g2x-four.catalog.json` are the earlier hand-fill design. They
stay as the format for effects the vendored catalog lacks.

# catalog/ — Phase 2 (not built)

Fill `g2x-four.catalog.json` from Zoom's official Effects List PDF: one entry
per effect (the user count is 79 effects + 22 amp/cab models), with every
parameter name and range exactly as the PDF prints them.

Leave `wireId` as `null`. The probe fills it in later, when a patch dump shows
which byte value selects which effect. Do not guess it from B1/B2 FOUR IDs.

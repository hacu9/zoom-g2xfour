# tempo/ — Phase 2 (not built)

Planned `delay.ts`:

    ms = 60000 / BPM × note value (in quarter notes)

| Note | Factor | Note | Factor |
|------|--------|------|--------|
| 1/1  | 4      | 1/8  | 0.5    |
| 1/2  | 2      | 1/8. | 0.75   |
| 1/4  | 1      | 1/8T | 1/3    |
| 1/4. | 1.5    | 1/16 | 0.25   |
| 1/4T | 2/3    | 1/16.| 0.375  |

Example: 120 BPM, dotted eighth -> 60000 / 120 × 0.75 = 375 ms.
Clamp the result to the chosen delay effect's `Time` range from the catalog,
and warn when the clamp changes the value.

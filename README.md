# zoom-g2xfour

An unofficial browser editor for the Zoom G2X FOUR guitar pedal, over USB
(Web MIDI + SysEx). No backend, no driver. Desktop Chrome or Edge.

- Connects on its own and looks like a pedalboard: the patch screen with
  ◀ / ▶, stompboxes with knobs and footswitches, a clickable patch list.
- Read the pedal: identity, every patch (raw), screen text, flash files.
- Back up all 300 patches to `.syx`, and restore any of them, verified.
- Edit the current patch live, with a searchable effect list.
- Turn a song's "tone recipe" (JSON) into a patch. Examples: Rain (Rob Scallon),
  four Metallica songs.
- Record what you play through the pedal's USB audio, loop it, save it.
- Metronome with 41 song tempo maps (tempo and meter changes, part by part).
- Two safety gates: known dangerous commands are blocked; writes need a backup
  and an Empty slot.
- `g2x`, a command-line tool with the same code and rules: backup, read, write
  a recipe, restore. No browser needed.

```bash
npm install
npm run dev     # http://localhost:5173 — open in Windows Chrome/Edge
npm test
scripts/g2x help   # the command-line tool (WSL → Windows Node)
```

| Document | Content |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) | How to run and use the app |
| [docs/g2x-four-protocol.md](docs/g2x-four-protocol.md) | Everything found about the pedal's protocol |
| [docs/recipes.md](docs/recipes.md) | Recipe format, effect mapping, Rain |
| [docs/architecture.md](docs/architecture.md) | Code structure and decisions |
| [docs/songs.md](docs/songs.md) | Song tempo maps: source, checks, limits |
| [docs/cli.md](docs/cli.md) | The `g2x` command-line tool |

## Credits

This project stands on other people's reverse-engineering work.

- **[thammer/zoom-explorer](https://github.com/thammer/zoom-explorer)** by Thomas Hammer (MIT).
  The effect and parameter catalog in `src/catalog/vendor/` is copied from it,
  with its licence in `src/catalog/vendor/LICENSE-zoom-explorer`. Its command
  table, list of dangerous commands, patch (PTCF) format and 7-bit packing are
  the base of `docs/g2x-four-protocol.md`.
- **[mungewell/zoom-zt2](https://github.com/mungewell/zoom-zt2)** (MIT). Issues
  [#46](https://github.com/mungewell/zoom-zt2/issues/46) and
  [#64](https://github.com/mungewell/zoom-zt2/issues/64) gave the first commands
  for the FOUR series, the file listing, and the warning about `64 47`.
- **[shooking/ZoomPedalFun](https://github.com/shooking/ZoomPedalFun)** (CC0).
  Background research on the Zoom FOUR pedals.
- **[jzz](https://github.com/jazz-soft/JZZ)** by Jazz-Soft (MIT): Web MIDI for
  Node, used by `g2x`. Installed at run time, not copied into this repo.
- **[Songsterr](https://www.songsterr.com)**: the song tempo maps (tempo,
  meter, bar counts and section names) come from its tab data. Each song links
  its Songsterr page. See [docs/songs.md](docs/songs.md).
- **Tone recipes.** The song settings are fan estimates, not official. Each
  recipe links its sources in [docs/recipes.md](docs/recipes.md): Line 6
  CustomTone, the ToneLib forum, ToneMirror, TonesMatch, Rigtone, Guitar Chalk,
  Mixdown and others. Song names belong to their artists.

## Disclaimer

Not affiliated with or endorsed by Zoom Corporation. "Zoom" and "G2X FOUR" are
trademarks of Zoom Corporation. The app sends SysEx to your pedal: it blocks the
commands known to be dangerous and needs a backup before any write, but you use
it at your own risk. Keep the backup `.syx` file.

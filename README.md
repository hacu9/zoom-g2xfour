# zoompedal

A browser editor for the Zoom G2X FOUR over USB (Web MIDI + SysEx). No
backend, no driver. Desktop Chrome or Edge.

- Connects on its own and looks like a pedalboard: the patch screen with
  ◀ / ▶, stompboxes with knobs and footswitches, a clickable patch list.
- Read the pedal: identity, every patch (raw), screen text, flash files.
- Back up all 300 patches to `.syx`, and restore any of them, verified.
- Edit the current patch live, with a searchable effect list.
- Turn a song's "tone recipe" (JSON) into a patch. Example: Rain (Rob Scallon).
- Two safety gates: known dangerous commands are blocked; writes need a backup
  and an Empty slot.

```bash
npm install
npm run dev     # http://localhost:5173 — open in Windows Chrome/Edge
npm test
```

| Document | Content |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) | How to run and use the app |
| [docs/g2x-four-protocol.md](docs/g2x-four-protocol.md) | Everything found about the pedal's protocol |
| [docs/recipes.md](docs/recipes.md) | Recipe format, effect mapping, Rain |
| [docs/architecture.md](docs/architecture.md) | Code structure and decisions |

Effect catalog and patch format: [thammer/zoom-explorer](https://github.com/thammer/zoom-explorer) (MIT).

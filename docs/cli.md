# g2x: the pedal from the command line

`g2x` runs the editor's pedal code without a browser. It reads, backs up,
writes recipes and restores patches. It uses the same code and the same safety
rules as the web app.

## Why it runs on Windows Node

The pedal connects to Windows. WSL cannot see Windows MIDI ports. So
`scripts/g2x` starts the tool with the Windows `node.exe`, and the
[jzz](https://github.com/jazz-soft/JZZ) library gives Node a Web MIDI interface.
The app's `ProbeSession`, backup, recipe and restore code runs unchanged.

Other ways, and why we did not use them:

- **usbipd (USB into WSL):** Windows loses the pedal's audio, so the Recorder
  and Listen stop.
- **Python (mido) or PowerShell (WinRT MIDI):** the protocol code would need a
  second implementation, without the tests.

## Set up

Nothing to install by hand. Windows needs Node.js (`node.exe` on the PATH).

The first run installs `jzz@1.9.6` into `%LOCALAPPDATA%\g2x`. Each run builds
the bundle again (`npm run build:cli` → `dist-cli/g2x.mjs`) when the code
changed, and copies it there.

## Commands

```bash
scripts/g2x ports                    # MIDI ports that Windows sees
scripts/g2x info                     # identity, patch count, current slot
scripts/g2x read 140                 # one patch: name, effects, knobs, tempo
scripts/g2x select 262               # switch the pedal to a patch
scripts/g2x backup                   # all patches → backups/*.syx + *.json
scripts/g2x list                     # names from the newest backup (no pedal needed)
scripts/g2x recipes                  # built-in recipes with their numbers
scripts/g2x write 19 264             # recipe 19 into Empty slot 264
scripts/g2x write "wind" 265         # by patch name or song
scripts/g2x write my-tone.json 266   # your own recipe file
scripts/g2x write-all --from 264     # every built-in recipe not on the pedal yet
scripts/g2x restore backups/g2xfour-backup-….syx 140 259
scripts/g2x restore backups/g2xfour-backup-….syx 140 140 --confirm 140
```

Options:

- `--verbose` prints every message sent.
- `--out <folder>` puts backups somewhere else (default: the repo's `backups/`).
- `--from <slot>` (`write-all`) uses Empty slots from that slot up.
- `--confirm <slot>` (`restore`) allows a restore over a real patch.

`write-all` takes one backup, then writes each missing recipe in turn. It stops
at the first error and says which slot it was writing.

## Safety rules

1. **A full backup comes first.** `write` and `restore` read all 300 patches
   and save the `.syx` before they change anything. If one patch does not
   decode, nothing is written.
2. **Empty slots only.** A recipe goes only into a slot that the backup shows as
   "Empty". A restore over a real patch needs `--confirm <slot>`.
3. **A fresh check.** Right before the write, the tool reads the target slot
   again. If it does not hold what the backup said (Empty, or the patch you
   confirmed), nothing is written. The web app does the same.
4. **Not the current slot.** A restore never goes into the slot the pedal is on:
   auto-save could undo it. If the pedal does not say which slot it is on, the
   restore stops.
5. **It says what it overwrites.** A restore prints the patch in the target
   slot before it uploads.
6. Writes use the app's write gate (`classifyWrite`), and the known dangerous
   commands stay blocked.

## The web page at the same time

Windows 11 with Windows MIDI Services lets more than one program use a MIDI
port. Not tested on this pedal yet. If `g2x` cannot open the port, close the
app tab and try again.

Do not write from the page and from `g2x` at the same time. Each one checks the
slot right before it writes, but a write takes a few seconds.

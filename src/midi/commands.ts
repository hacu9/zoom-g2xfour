/**
 * Known Zoom command bodies (the bytes between the device ID and F7).
 * Sources: github.com/mungewell/zoom-zt2 issue #64 (B2 FOUR) and the
 * thammer/zoom-explorer README (MS Plus series, same 6E family), commit aee0143.
 * "Read-only" means a tester reported no change on the pedal — it is not proof.
 */
export interface KnownCommand {
  id: string;
  label: string;
  body: number[];
  note: string;
}

export const READ_COMMANDS: KnownCommand[] = [
  { id: 'flash-info', label: '60 29 flash info', body: [0x60, 0x29], note: 'Flash size / free space. B2 FOUR reply decoded as ~5.7 MB total (issue #64).' },
  { id: 'patch-details', label: '64 02 00 07 00 patch details', body: [0x64, 0x02, 0x00, 0x07, 0x00], note: 'Current patch details. Reply starts F0 52 00 6E 64 01 (issue #64).' },
  { id: 'patch-info-42', label: '64 42 patch info', body: [0x64, 0x42], note: 'Patch-related info. Reply starts 64 43 01 01 (issue #64).' },
  { id: 'dsp-scale', label: '64 11 DSP scale', body: [0x64, 0x11], note: 'DSP usage scaling factor. G1 FOUR replies 64 10 66 01 ... = 230 (issue #46).' },
  { id: 'info-640a', label: '64 0A info', body: [0x64, 0x0a, 0x00, 0x00, 0x00], note: 'Info command, "no changes" (issue #64). Meaning unknown.' },
  { id: 'info-6418', label: '64 18 info', body: [0x64, 0x18, 0x00, 0x00, 0x64, 0x00], note: 'Info command, "no changes" (issue #64). Meaning unknown.' },
  { id: 'info-44', label: '44 info', body: [0x44, 0x00, 0x00, 0x00, 0x00], note: 'Info command, "no changes" (issue #64). Meaning unknown.' },
  { id: 'info-48', label: '48 info', body: [0x48, 0x00, 0x00, 0x00, 0x00], note: 'Info command, "no changes" (issue #64). Meaning unknown.' },
  { id: 'info-55', label: '55 info', body: [0x55, 0x00, 0x00, 0x00, 0x00], note: 'Reply starts 54 20 on a B2 FOUR (issue #64). Meaning unknown.' },
  { id: 'find-first', label: '60 25 find first *.*', body: [0x60, 0x25, 0x00, 0x00, 0x2a, 0x2e, 0x2a, 0x00], note: 'File listing: first entry. Pattern "*.*" (issue #64).' },
  { id: 'find-next', label: '60 26 find next', body: [0x60, 0x26, 0x00, 0x00, 0x2a, 0x2e, 0x2a, 0x00], note: 'File listing: next entry (issue #64).' },
  { id: 'find-end', label: '60 27 find end', body: [0x60, 0x27], note: 'File listing: close the search (issue #64).' },
  { id: 'current-patch', label: '64 13 current patch (raw)', body: [0x64, 0x13], note: 'Full raw patch of the edit buffer. Reply 64 12 01 <len> <data> <CRC> (zoom-explorer).' },
  { id: 'current-program', label: '33 bank/program', body: [0x33], note: 'Replies with Bank Select CCs + Program Change of the current patch (zoom-explorer).' },
  { id: 'patch-count', label: '07 patch count', body: [0x07], note: 'Number of patches and patch length, reply 06 (zoom-explorer).' },
  { id: 'edit-on', label: '50 edit reports on', body: [0x50], note: 'Parameter edit enable: the pedal then reports knob/effect changes (zoom-explorer). Stores nothing.' },
  { id: 'edit-off', label: '51 edit reports off', body: [0x51], note: 'Parameter edit disable (zoom-explorer).' },
];

/** Reads that take arguments. Matched by shape, so the bytes may vary. */
export interface ReadPattern {
  label: string;
  matches: (body: number[]) => boolean;
  note: string;
}

const isData = (b: number) => b >= 0 && b <= 0x7f;

export const READ_PATTERNS: ReadPattern[] = [
  {
    label: '64 02 <start> <end> <00|01> screens',
    matches: (b) => b.length === 5 && b[0] === 0x64 && b[1] === 0x02 && isData(b[2]) && isData(b[3]) && (b[4] === 0 || b[4] === 1),
    note: 'Screen text for slots start..end (zoom-explorer).',
  },
  {
    label: '46 00 00 <bank 2> <program 2> read patch slot',
    matches: (b) => b.length === 7 && b[0] === 0x46 && b[1] === 0x00 && b[2] === 0x00,
    note: 'Download the stored patch in a bank/program slot, reply 45 00 00 (zoom-explorer).',
  },
];

/** Commands that are known or suspected to change pedal state. Never sent. */
export interface BlockedPattern {
  label: string;
  matches: (body: number[]) => boolean;
  reason: string;
}

const READ_FILE_OPS = new Set([0x25, 0x26, 0x27, 0x29]);

/** One-byte commands with a documented, harmless meaning. Every other one is blocked. */
const SAFE_SINGLE = new Set([0x05, 0x07, 0x33, 0x44, 0x48, 0x50, 0x51, 0x55]);

const DANGEROUS_FIRST: Record<number, string> = {
  0x01: 'Enters firmware update mode (zoom-explorer README).',
  0x03: 'Firmware-mode family next to 01/04 (zoom-explorer README). Not needed.',
  0x04: 'Exits firmware update mode (zoom-explorer README).',
  0x5b: 'FACTORY RESET — wipes all user patches (zoom-explorer README).',
  0x28: 'Sends a patch to the pedal, replacing the current one (zoom-explorer README).',
  0x45: 'Patch upload to a bank/program slot (zoom-explorer README).',
  0x08: 'Patch dump in the pedal-bound direction = a write.',
  0x31: 'MS-series parameter edit (write).',
  0x32: 'MS-series "store patch" (write to flash).',
};

export const BLOCKED_PATTERNS: BlockedPattern[] = [
  {
    label: '64 47 create bank',
    matches: (b) => b[0] === 0x64 && b[1] === 0x47,
    reason: 'Creates a new bank and DELETES the current one (zoom-explorer README; issue #64).',
  },
  ...Object.entries(DANGEROUS_FIRST).map(([cmd, reason]) => ({
    label: `${Number(cmd).toString(16).toUpperCase().padStart(2, '0')} command`,
    matches: (b: number[]) => b[0] === Number(cmd),
    reason,
  })),
  {
    label: 'unknown one-byte command',
    matches: (b) => b.length === 1 && !SAFE_SINGLE.has(b[0]),
    reason: 'One-byte commands include firmware mode and factory reset. zoom-explorer warns blind tests can brick the pedal.',
  },
  {
    label: '64 12 patch dump to pedal',
    matches: (b) => b[0] === 0x64 && b[1] === 0x12,
    reason: 'Sending a patch dump to the pedal is a write.',
  },
  {
    label: '64 20 00 64 xx system/structure',
    matches: (b) => b[0] === 0x64 && b[1] === 0x20 && b[3] === 0x64,
    reason: 'Patch structure and global settings: delete/insert/move effects, auto-save, tuner, ECO. Value > 0A on 64 09 freezes the pedal (zoom-explorer README).',
  },
  {
    label: '60 xx file system',
    matches: (b) => b[0] === 0x60 && !(b.length >= 2 && READ_FILE_OPS.has(b[1])),
    reason: 'The 60 2x family is the flash file system. Only find-first/next/end and flash-info are known to be read-only; others may open, write or delete files.',
  },
];

/** Bodies longer than this look like data uploads (patch or file writes). */
export const MAX_ZOOM_BODY = 48;

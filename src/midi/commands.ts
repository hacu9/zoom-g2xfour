/**
 * Known Zoom command bodies (the bytes between the device ID and F7).
 * Source: github.com/mungewell/zoom-zt2 issue #64, tested on a B2 FOUR.
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
];

/** Commands that are known or suspected to change pedal state. Never sent. */
export interface BlockedPattern {
  label: string;
  matches: (body: number[]) => boolean;
  reason: string;
}

const READ_FILE_OPS = new Set([0x25, 0x26, 0x27, 0x29]);

export const BLOCKED_PATTERNS: BlockedPattern[] = [
  {
    label: '64 47 new patch',
    matches: (b) => b[0] === 0x64 && b[1] === 0x47,
    reason: 'Creates a new patch on the pedal (confirmed by a B2 FOUR tester in issue #64).',
  },
  {
    label: '60 xx file system',
    matches: (b) => b[0] === 0x60 && b.length >= 2 && !READ_FILE_OPS.has(b[1]),
    reason: 'The 60 2x family is the flash file system. Only find-first/next/end and flash-info are known to be read-only; others may open, write or delete files.',
  },
];

/** Bodies longer than this look like data uploads (patch or file writes). */
export const MAX_ZOOM_BODY = 48;

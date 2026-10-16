export type ParseResult = { ok: true; bytes: number[] } | { ok: false; error: string };

/**
 * Parse user hex input. Accepts "F0 52 00", "f0,52,00", "0xF0 0x52" and "F05200".
 */
export function parseHex(input: string): ParseResult {
  const cleaned = input.replace(/0x/gi, ' ').replace(/[,;:\-\n\r\t]/g, ' ').trim();
  if (cleaned === '') return { ok: false, error: 'Empty input' };

  const tokens = cleaned.split(/\s+/);
  const pairs: string[] = [];
  for (const token of tokens) {
    if (!/^[0-9a-fA-F]+$/.test(token)) return { ok: false, error: `Not hex: "${token}"` };
    if (token.length <= 2) {
      pairs.push(token);
    } else if (token.length % 2 === 0) {
      for (let i = 0; i < token.length; i += 2) pairs.push(token.slice(i, i + 2));
    } else {
      return { ok: false, error: `Odd number of hex digits in "${token}"` };
    }
  }
  return { ok: true, bytes: pairs.map((p) => parseInt(p, 16)) };
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function toAscii(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
}

export function byteHex(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

/** Expected length of a non-SysEx message, from its status byte. */
function expectedLength(status: number): number | null {
  if (status >= 0xf8) return 1; // realtime
  switch (status & 0xf0) {
    case 0x80: case 0x90: case 0xa0: case 0xb0: case 0xe0: return 3;
    case 0xc0: case 0xd0: return 2;
  }
  switch (status) {
    case 0xf1: case 0xf3: return 2;
    case 0xf2: return 3;
    case 0xf6: return 1;
  }
  return null; // F4, F5, F7 alone
}

/**
 * Exactly ONE well-formed MIDI message. Web MIDI send() accepts several
 * messages in one array, so a trailing message must never ride along behind
 * a harmless first one — the safety classifier only judges one message.
 */
export function validateMidiMessage(bytes: number[]): string | null {
  if (bytes.length === 0) return 'Empty message';
  if (bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 0xff)) return 'Byte out of range';
  if (bytes[0] < 0x80) return 'First byte must be a status byte (0x80-0xFF)';
  if (bytes[0] === 0xf0) {
    if (bytes[bytes.length - 1] !== 0xf7) return 'SysEx must end with F7';
    const inner = bytes.slice(1, -1);
    if (inner.length === 0) return 'SysEx has no data';
    if (inner.some((b) => b > 0x7f)) return 'SysEx data bytes must be 00-7F (one message per send)';
    return null;
  }
  const len = expectedLength(bytes[0]);
  if (len === null) return `Status ${bytes[0].toString(16).toUpperCase()} cannot start a message`;
  if (bytes.length !== len) return `Status ${bytes[0].toString(16).toUpperCase()} needs exactly ${len} byte(s); send one message at a time`;
  if (bytes.slice(1).some((b) => b > 0x7f)) return 'Data bytes must be 00-7F';
  return null;
}

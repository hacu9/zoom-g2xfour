import { BLOCKED_PATTERNS, MAX_ZOOM_BODY, READ_COMMANDS, READ_PATTERNS } from './commands';
import { IDENTITY_REQUEST } from './identity';
import { validateMidiMessage } from './hex';
import { isZoomSysex, zoomBody } from './zoom';

export type Verdict =
  /** Exact match of a command from the read-only catalog. */
  | 'read'
  /** Not known. Needs explicit confirmation; Zoom SysEx also needs research mode. */
  | 'unknown'
  /** Never sent. No override. */
  | 'blocked';

export interface Classification {
  verdict: Verdict;
  reason: string;
  /** True when the UI must refuse unless research mode is on. */
  needsResearchMode: boolean;
}

export function sameBytes(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function classify(bytes: number[]): Classification {
  const structural = validateMidiMessage(bytes);
  if (structural) return { verdict: 'blocked', reason: `Invalid MIDI: ${structural}`, needsResearchMode: false };

  if (bytes[0] !== 0xf0) {
    const status = bytes[0] & 0xf0;
    if (status === 0xc0) {
      return { verdict: 'unknown', reason: 'Program Change: selects a patch. It does not write, but the pedal changes sound.', needsResearchMode: false };
    }
    return { verdict: 'unknown', reason: 'Channel / system message. It does not write flash, but it may change live parameters.', needsResearchMode: false };
  }

  if (sameBytes(bytes, IDENTITY_REQUEST)) {
    return { verdict: 'read', reason: 'Universal Identity Request.', needsResearchMode: false };
  }

  if (bytes[1] === 0x7e || bytes[1] === 0x7f) {
    return { verdict: 'blocked', reason: 'Universal SysEx other than the Identity Request (e.g. sample/file dump) is not supported.', needsResearchMode: false };
  }

  if (!isZoomSysex(bytes)) {
    return { verdict: 'blocked', reason: 'SysEx for a manufacturer other than Zoom (52 00).', needsResearchMode: false };
  }

  const body = zoomBody(bytes);
  for (const p of BLOCKED_PATTERNS) {
    if (p.matches(body)) return { verdict: 'blocked', reason: `${p.label}: ${p.reason}`, needsResearchMode: false };
  }
  if (body.length > MAX_ZOOM_BODY) {
    return { verdict: 'blocked', reason: `Body is ${body.length} bytes. Long bodies look like data uploads (patch/file writes).`, needsResearchMode: false };
  }

  const known = READ_COMMANDS.find((c) => sameBytes(c.body, body));
  if (known) return { verdict: 'read', reason: `Known read-only: ${known.label}. ${known.note}`, needsResearchMode: false };
  const shaped = READ_PATTERNS.find((p) => p.matches(body));
  if (shaped) return { verdict: 'read', reason: `Known read-only: ${shaped.label}. ${shaped.note}`, needsResearchMode: false };

  return {
    verdict: 'unknown',
    reason: 'Zoom command that is not in the read-only catalog. It can change or write pedal data.',
    needsResearchMode: true,
  };
}

import { READ_COMMANDS } from './commands';
import type { ProbeSession } from './session';
import { asciiRuns, isZoomSysex, zoomSysex } from './zoom';

export interface FileListResult {
  entries: { name: string; raw: Uint8Array }[];
  stopReason: string;
}

const body = (id: string) => READ_COMMANDS.find((c) => c.id === id)!.body;

/**
 * Walks the pedal's flash listing with 60 25 / 60 26 / 60 27 (read-only per issue #64).
 * The reply format is unknown, so the loop stops on: no file name in the reply,
 * a repeated name, a timeout, the step cap, or an abort.
 */
export async function listFiles(
  session: ProbeSession,
  deviceId: number,
  opts: { maxSteps?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<FileListResult> {
  // The G2X FOUR holds more than 256 files (observed 2026-10-15).
  const { maxSteps = 2048, timeoutMs = 1500, signal } = opts;
  const isReply = (d: Uint8Array) => isZoomSysex(d) && d[4] === 0x60;
  const entries: FileListResult['entries'] = [];
  const seen = new Set<string>();
  let stopReason = `Step cap (${maxSteps}) reached`;

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) {
        stopReason = 'Stopped by user';
        break;
      }
      const cmd = zoomSysex(deviceId, body(step === 0 ? 'find-first' : 'find-next'));
      const reply = await session.request(cmd, step === 0 ? 'file list: find first' : 'file list: find next', isReply, timeoutMs);
      if (!reply) {
        stopReason = `No reply within ${timeoutMs} ms`;
        break;
      }
      // Skip the 5-byte header (F0 52 00 ID 60) so the header bytes never look like a name.
      const name = asciiRuns(Array.from(reply.slice(5)))[0];
      if (!name) {
        stopReason = 'Reply holds no file name (assumed end of list)';
        break;
      }
      if (seen.has(name)) {
        stopReason = `Name "${name}" repeated (assumed end of list)`;
        break;
      }
      seen.add(name);
      entries.push({ name, raw: reply });
    }
  } finally {
    await session.request(zoomSysex(deviceId, body('find-end')), 'file list: find end', isReply, timeoutMs).catch(() => null);
  }
  return { entries, stopReason };
}

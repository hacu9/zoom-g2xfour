import { toAscii, toHex } from '../midi/hex';

export type Direction = 'in' | 'out' | 'info' | 'warn' | 'error';

export interface LogEntry {
  seq: number;
  wall: Date;
  /** ms since the log started (performance.now based). */
  rel: number;
  dir: Direction;
  bytes?: number[];
  text: string;
  notes?: string[];
}

const TAG: Record<Direction, string> = { in: 'IN  ', out: 'OUT ', info: 'INFO', warn: 'WARN', error: 'ERR ' };

export function formatEntry(e: LogEntry): string {
  const head = `${e.wall.toISOString()}  +${e.rel.toFixed(1).padStart(9)}ms  ${TAG[e.dir]}`;
  const lines = [e.bytes ? `${head}  ${toHex(e.bytes)}` : `${head}  ${e.text}`];
  if (e.bytes) {
    lines.push(`    ascii: ${toAscii(e.bytes)}`);
    if (e.text) lines.push(`    ${e.text}`);
  }
  for (const n of e.notes ?? []) lines.push(`    ${n}`);
  return lines.join('\n');
}

export function exportText(entries: LogEntry[], header: Record<string, string>): string {
  const head = Object.entries(header).map(([k, v]) => `# ${k}: ${v}`);
  return [...head, `# entries: ${entries.length}`, '', ...entries.map(formatEntry)].join('\n') + '\n';
}

export function downloadText(filename: string, text: string) {
  downloadBlob(filename, new Blob([text], { type: 'text/plain' }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

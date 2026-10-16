/** Helpers for the audio recorder. The browser APIs stay in the component. */

/** The pedal's USB audio input, if the browser lists it. */
export function pickPedalInput<T extends { kind: string; label: string }>(devices: T[]): T | undefined {
  return devices.find((d) => d.kind === 'audioinput' && /zoom|g2x?\s*four|g2/i.test(d.label));
}

/** The first container the browser can record. Chrome: webm/opus. */
export function pickMimeType(supported: (t: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(supported) ?? '';
}

export function extensionFor(mime: string): string {
  if (mime.startsWith('audio/ogg')) return 'ogg';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  return 'webm';
}

/** "Rain Scallon 2026-10-16 21-05-33.webm" — safe on Windows. */
export function takeFileName(patchName: string | null, when: Date, ext: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())} ${p(when.getHours())}-${p(when.getMinutes())}-${p(when.getSeconds())}`;
  const name = (patchName ?? 'take').replace(/[\\/:*?"<>|]/g, '').trim() || 'take';
  return `${name} ${stamp}.${ext}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Peak level of a time-domain buffer (128 = silence) as 0–1. */
export function peakLevel(buf: Uint8Array): number {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
  return peak / 128;
}

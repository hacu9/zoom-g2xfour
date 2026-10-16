import { describe, expect, it } from 'vitest';
import { PedalTracker, readControl } from '../src/audio/pedal';
import { extensionFor, formatDuration, peakLevel, pickMimeType, pickPedalInput, takeFileName } from '../src/audio/recorder';

const zoomKnob = (slot: number, param: number, value: number, ack = 0) =>
  new Uint8Array([0xf0, 0x52, 0x00, 0x6e, 0x64, 0x20, ack, slot, param, value & 0x7f, (value >> 7) & 0x7f, 0, 0, 0, 0xf7]);

describe('readControl', () => {
  it('reads a Control Change', () => {
    expect(readControl(new Uint8Array([0xb0, 7, 100]))).toEqual({ sig: { kind: 'cc', key: 'cc:176:7', label: 'CC 7 (channel 1)' }, value: 100 });
  });
  it('ignores Bank Select, the echo of every patch change', () => {
    expect(readControl(new Uint8Array([0xb0, 0x00, 0]))).toBeNull();
    expect(readControl(new Uint8Array([0xb0, 0x20, 25]))).toBeNull();
  });
  it('reads a Zoom knob report with a value above 127', () => {
    expect(readControl(zoomKnob(1, 3, 300))).toEqual({ sig: { kind: 'zoom', key: 'zoom:1:3', label: 'effect 2, knob 2' }, value: 300 });
  });
  it('ignores name, tempo, on/off and effect-type messages', () => {
    expect(readControl(zoomKnob(0x5f, 2, 65))).toBeNull(); // name character
    expect(readControl(zoomKnob(0x64, 2, 123))).toBeNull(); // tempo
    expect(readControl(zoomKnob(0, 0, 1))).toBeNull(); // on/off
    expect(readControl(zoomKnob(0, 1, 5))).toBeNull(); // effect id
    expect(readControl(new Uint8Array([0xf0, 0x52, 0x00, 0x6e, 0x64, 0x26, 0, 0, 25, 0, 0, 0, 0xf7]))).toBeNull(); // patch change
  });
});

describe('PedalTracker', () => {
  it('fires toe once per push to the toe end, re-armed below half', () => {
    const sig = readControl(new Uint8Array([0xb0, 7, 0]))!.sig;
    const t = new PedalTracker(sig);
    const at = (v: number) => t.feed({ sig, value: v });
    expect(at(0)).toEqual({ position: 0, toe: false });
    expect(at(127)?.toe).toBe(true);
    expect(at(125)?.toe).toBe(false); // still at the toe: no repeat
    expect(at(127)?.toe).toBe(false);
    at(40);
    expect(at(127)?.toe).toBe(true);
  });
  it('learns the range of a Zoom knob', () => {
    const sig = readControl(zoomKnob(2, 4, 0))!.sig;
    const t = new PedalTracker(sig);
    expect(t.feed({ sig, value: 10 })).toEqual({ position: 0, toe: false }); // no range yet
    expect(t.feed({ sig, value: 0 })?.position).toBe(0);
    expect(t.feed({ sig, value: 100 })).toEqual({ position: 1, toe: true });
    expect(t.feed({ sig, value: 50 })?.position).toBe(0.5);
  });
  it('ignores other controls', () => {
    const sig = readControl(new Uint8Array([0xb0, 7, 0]))!.sig;
    expect(new PedalTracker(sig).feed(readControl(new Uint8Array([0xb0, 11, 127]))!)).toBeNull();
  });
});

describe('recorder helpers', () => {
  it('picks the pedal audio input', () => {
    const devs = [
      { kind: 'audioinput', label: 'Default - Microphone (Realtek)' },
      { kind: 'audiooutput', label: 'ZOOM G2X FOUR Audio' },
      { kind: 'audioinput', label: 'Line (ZOOM G2X FOUR Audio)' },
    ];
    expect(pickPedalInput(devs)?.label).toBe('Line (ZOOM G2X FOUR Audio)');
    expect(pickPedalInput(devs.slice(0, 2))).toBeUndefined();
  });
  it('prefers webm/opus', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMimeType(() => false)).toBe('');
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
  });
  it('names a take after the patch, safe for Windows', () => {
    expect(takeFileName('One: Dist?', new Date(2026, 9, 16, 21, 5, 3), 'webm')).toBe('One Dist 2026-10-16 21-05-03.webm');
    expect(takeFileName(null, new Date(2026, 0, 1, 0, 0, 0), 'ogg')).toBe('take 2026-01-01 00-00-00.ogg');
  });
  it('formats time and level', () => {
    expect(formatDuration(65.9)).toBe('1:05');
    expect(peakLevel(new Uint8Array([128, 128]))).toBe(0);
    expect(peakLevel(new Uint8Array([128, 0, 200]))).toBe(1);
  });
});

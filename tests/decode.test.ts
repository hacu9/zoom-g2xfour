import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeFileEntry, decodeFlashInfo, decodePatchDisplay, septetsLE } from '../src/midi/decode';

/** Every IN message from a real exported probe log, as byte arrays. */
function incoming(file: string): number[][] {
  const txt = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  return [...txt.matchAll(/ IN\s+(F0 [0-9A-F ]+ F7)/g)].map((m) => m[1].split(' ').map((h) => parseInt(h, 16)));
}
const probe = incoming('g2xfour-probe-2026-10-15.txt');
const listing = incoming('g2xfour-filelist-2026-10-15.txt');
const reply = (msgs: number[][], b4: number, b5: number) => msgs.find((m) => m[4] === b4 && m[5] === b5)!;

describe('septetsLE', () => {
  it('decodes 7-bit little-endian groups', () => {
    expect(septetsLE([0x54, 0x7b, 0x6b, 0x02, 0x00])).toBe(5963220);
  });
});

describe('real G2X FOUR replies', () => {
  it('60 29 flash info: same total as the B2 FOUR', () => {
    expect(decodeFlashInfo(reply(probe, 0x60, 0x04))).toEqual({ totalBytes: 5963220, freeBytes: 887530 });
  });

  it('64 01 patch dump: 7 slots, screen text', () => {
    const slots = decodePatchDisplay(reply(probe, 0x64, 0x01))!;
    expect(slots.map((s) => s.effect)).toEqual(['Aco.Sim', 'EP Drive', 'AirReverb', 'ChurchREV', 'Blank', 'Blank', 'ZNR']);
    expect(slots.map((s) => s.on)).toEqual([true, true, true, true, false, false, true]);
    expect(slots[0].params).toEqual([
      { label: 'Top', value: '20' },
      { label: 'Body', value: '70' },
      { label: 'Tone', value: '50' },
      { label: 'VOL', value: '80' },
    ]);
    expect(slots[2].params.at(-1)).toEqual({ label: 'Tail', value: 'OFF' });
    expect(slots[4].params).toEqual([]);
  });

  it('60 04 file entries: full listing, 79 effects + 22 amp/cab', () => {
    const files = listing.map(decodeFileEntry).filter((f) => f !== null);
    expect(files).toHaveLength(260);
    expect(files[0]).toEqual({ name: 'G_OUT_EQ.BDL', sizeBytes: 22846 });
    expect(files.at(-1)!.name).toBe('FLST_SEQ.ZT2');
    const zd2 = files.filter((f) => f.name.endsWith('.ZD2'));
    expect(zd2).toHaveLength(101);
    expect(zd2.filter((f) => f.name.endsWith('_IR.ZD2') || f.name.endsWith('IR.ZD2'))).toHaveLength(22);
  });

  it('rejects other replies', () => {
    expect(decodePatchDisplay(reply(probe, 0x60, 0x04))).toBeNull();
    expect(decodeFlashInfo(reply(probe, 0x64, 0x01))).toBeNull();
  });
});

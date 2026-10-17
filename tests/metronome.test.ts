import { describe, expect, it } from 'vitest';
import { ClickWalker, barPulses, beatBpm, clampBpm, tapBpm, type Section } from '../src/audio/metronome';

const take = (w: ClickWalker, n: number) => Array.from({ length: n }, () => w.next());

describe('ClickWalker', () => {
  it('clicks on every beat and accents beat 1', () => {
    const clicks = take(new ClickWalker([{ bpm: 120, beats: 4 }]), 6);
    expect(clicks.map((c) => c!.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(clicks.map((c) => c!.accent)).toEqual([true, false, false, false, true, false]);
  });

  it('moves to the next section after its bars, with the new tempo and meter', () => {
    const map: Section[] = [
      { name: 'intro', bpm: 60, beats: 2, bars: 1 },
      { name: 'verse', bpm: 120, beats: 3 },
    ];
    const clicks = take(new ClickWalker(map), 6);
    expect(clicks.map((c) => [c!.section, c!.bar, c!.beat, c!.time])).toEqual([
      [0, 0, 0, 0],
      [0, 0, 1, 1],
      [1, 0, 0, 2],
      [1, 0, 1, 2.5],
      [1, 0, 2, 3],
      [1, 1, 0, 3.5],
    ]);
  });

  it('ends after the last section when it has a length', () => {
    const w = new ClickWalker([{ bpm: 60, beats: 2, bars: 1 }]);
    expect(take(w, 3).map((c) => c?.beat ?? null)).toEqual([0, 1, null]);
  });

  it('skips to the next section at the next bar line', () => {
    const w = new ClickWalker([
      { bpm: 60, beats: 4 },
      { bpm: 120, beats: 4 },
    ]);
    w.next();
    w.skipTo(1);
    const rest = take(w, 4);
    expect(rest.map((c) => c!.section)).toEqual([0, 0, 0, 1]); // finishes the bar first
  });

  it('ramps the tempo across a section', () => {
    const s: Section = { bpm: 100, toBpm: 140, beats: 4, bars: 2 };
    expect([0, 7].map((i) => beatBpm(s, i, 8))).toEqual([100, 140]);
    const clicks = take(new ClickWalker([s]), 8);
    expect(clicks[0]!.bpm).toBe(100);
    expect(clicks[7]!.bpm).toBe(140);
    for (let i = 1; i < 8; i++) expect(clicks[i]!.bpm).toBeGreaterThan(clicks[i - 1]!.bpm);
  });
});

describe('meters', () => {
  it('clicks eighths in x/8 and ends a x/32 bar on its short rest', () => {
    expect(barPulses(4)).toEqual([1, 1, 1, 1]);
    expect(barPulses(2, 2)).toEqual([2, 2]);
    expect(barPulses(6, 8)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(barPulses(21, 32)).toEqual([1, 1, 0.625]);
    expect(barPulses(15, 8)).toHaveLength(15);
  });
  it('keeps the downbeats on time across a 21/32 bar', () => {
    const w = new ClickWalker([
      { bpm: 60, beats: 21, unit: 32, bars: 1 },
      { bpm: 60, beats: 4, bars: 1 },
    ]);
    const clicks = take(w, 4);
    expect(clicks.map((c) => c!.time)).toEqual([0, 1, 2, 2.625]);
    expect(clicks[3]!.accent).toBe(true);
  });
  it('plays a 6/8 bar as six eighth clicks', () => {
    const clicks = take(new ClickWalker([{ bpm: 60, beats: 6, unit: 8 }]), 7);
    expect(clicks.map((c) => c!.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(clicks[6]!.accent).toBe(true);
  });
});

describe('jumps and loops', () => {
  const map: Section[] = [
    { name: 'a', bpm: 60, beats: 1, bars: 1 },
    { name: 'b', bpm: 60, beats: 1, bars: 1 },
    { name: 'c', bpm: 60, beats: 1, bars: 1 },
  ];
  it('jumps to a chosen section at the bar line', () => {
    const w = new ClickWalker(map);
    w.skipTo(2);
    expect(take(w, 2).map((c) => c!.section)).toEqual([0, 2]);
  });
  it('loops a range of sections', () => {
    const w = new ClickWalker(map, 1);
    w.loop = { from: 1, to: 2 };
    expect(take(w, 5).map((c) => c!.section)).toEqual([1, 2, 1, 2, 1]);
  });
});

describe('tapTempo', () => {
  it('averages the taps', () => {
    expect(tapBpm([0, 500, 1000, 1500])).toBe(120);
  });
  it('needs two taps and forgets taps before a 2 s pause', () => {
    expect(tapBpm([1000])).toBeNull();
    expect(tapBpm([0, 250, 5000, 5600])).toBe(100);
  });
  it('keeps the BPM in range', () => {
    expect(clampBpm(10)).toBe(30);
    expect(clampBpm(999)).toBe(300);
  });
});

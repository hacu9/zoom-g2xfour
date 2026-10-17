"""Snaps fretted events to a beat grid and writes them as alphaTex and ASCII tab.

The grid is sixteenth notes on the detected beats, so the timing follows the
band, not a fixed tempo. A beat whose onsets fit triplets better is still
written in sixteenths (a draft, not engraving).
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass

from fretting import Event

SUB = 4  # grid steps per beat (sixteenths)
# Grid lengths alphaTex can write as one duration: steps -> (duration, dotted).
DURATIONS = {16: (1, False), 12: (2, True), 8: (2, False), 6: (4, True), 4: (4, False), 3: (8, True), 2: (8, False), 1: (16, False)}


@dataclass
class Slot:
    """One grid step that starts at least one note."""
    bar: int
    step: int  # 0 .. steps_per_bar - 1
    shape: list[tuple[int, int]]  # (string, fret)


def grid_times(beats: list[float]) -> list[float]:
    """Every sixteenth between the first and the last beat."""
    out: list[float] = []
    for a, b in zip(beats, beats[1:]):
        out += [a + (b - a) * i / SUB for i in range(SUB)]
    if beats:
        out.append(beats[-1])
    return out


def bars_from(beats: list[float], downbeats: list[float]) -> list[tuple[int, int]]:
    """(first beat index, beats in the bar) for each bar. Without downbeats: 4/4."""
    starts = sorted({min(range(len(beats)), key=lambda i: abs(beats[i] - d)) for d in downbeats}) if downbeats else []
    if not starts:
        starts = list(range(0, len(beats), 4))
    if starts[0] != 0:
        starts = [0] + starts  # pickup bar before the first downbeat
    bars = [(s, e - s) for s, e in zip(starts, starts[1:])]
    # The last beat time only closes the grid: the final bar has the beats before it.
    bars.append((starts[-1], len(beats) - 1 - starts[-1]))
    return [(s, n) for s, n in bars if n > 0]


def quantize(events: list[Event], beats: list[float], downbeats: list[float]) -> tuple[list[tuple[int, int]], list[Slot]]:
    grid = grid_times(beats)
    bars = bars_from(beats, downbeats)
    bar_start_steps = [s * SUB for s, _ in bars]
    slots: dict[tuple[int, int], Slot] = {}
    for ev in events:
        if not grid or not ev.notes:
            continue
        i = bisect.bisect_left(grid, ev.onset)
        g = min((j for j in (i - 1, i) if 0 <= j < len(grid)), key=lambda j: abs(grid[j] - ev.onset))
        bar = max(0, bisect.bisect_right(bar_start_steps, g) - 1)
        step = g - bar_start_steps[bar]
        # The last grid point only closes the last bar: a note there (or later) is past the end.
        if step >= bars[bar][1] * SUB:
            continue
        slot = slots.setdefault((bar, step), Slot(bar, step, []))
        used = {s for s, _ in slot.shape}
        slot.shape += [(n.string, n.fret) for n in ev.notes if n.string not in used]
    return bars, sorted(slots.values(), key=lambda s: (s.bar, s.step))


def split(steps: int) -> list[int]:
    """A gap in grid steps as writable durations, longest first (5 -> 4 + 1)."""
    out = []
    for d in sorted(DURATIONS, reverse=True):
        while steps >= d:
            out.append(d)
            steps -= d
    return out


def dur(steps: int) -> str:
    d, dotted = DURATIONS[steps]
    return f"{d}{'{d}' if dotted else ''}"


# General MIDI programs for playback: 27 clean electric, 29 overdriven, 30 distortion.
PROGRAMS = {"clean": 27, "overdrive": 29, "distortion": 30, "acoustic": 25}


def alphatex(bars, tracks: list[tuple[str, list[Slot]]], *, title: str, tempo: float, tuning_names: list[str], sound: str = "clean") -> str:
    """alphaTex for alphaTab, one track per (name, slots). Notes are fret.string (string 1 = high e)."""
    out = [f'\\title "{title}"', f"\\tempo {round(tempo)}", "."]
    for name, slots in tracks:
        out += [f'\\track "{name}"', "\\staff {tabs}", f"\\instrument {PROGRAMS[sound]}", f"\\tuning {' '.join(tuning_names)}", track_bars(bars, slots)]
    return "\n".join(out) + "\n"


def track_bars(bars, slots: list[Slot]) -> str:
    by_bar: dict[int, list[Slot]] = {}
    for s in slots:
        by_bar.setdefault(s.bar, []).append(s)
    out_bars = []
    last_ts = None
    for b, (_, beats_in_bar) in enumerate(bars):
        total = beats_in_bar * SUB
        parts = [] if last_ts == beats_in_bar else [f"\\ts {beats_in_bar} 4"]
        last_ts = beats_in_bar
        pos = 0
        for s in by_bar.get(b, []):
            for d in split(s.step - pos):
                parts.append(f"r.{dur(d)}")
            nxt = next((t.step for t in by_bar[b] if t.step > s.step), total)
            pieces = split(nxt - s.step)
            notes = " ".join(f"{fret}.{string}" for string, fret in sorted(s.shape))
            parts.append(f"({notes}).{dur(pieces[0])}" if len(s.shape) > 1 else f"{notes}.{dur(pieces[0])}")
            parts += [f"r.{dur(d)}" for d in pieces[1:]]
            pos = nxt
        for d in split(total - pos):
            parts.append(f"r.{dur(d)}")
        out_bars.append(" ".join(parts))
    return " |\n".join(out_bars)


def ascii_tab(bars, slots, *, tuning_names: list[str], per_line: int = 4) -> str:
    """Plain text tab, one column per sixteenth, `per_line` bars per row."""
    names = [n.rstrip("0123456789").lower() if i == 0 else n.rstrip("0123456789").upper() for i, n in enumerate(tuning_names)]
    cols: list[list[str]] = []  # one entry per bar: 6 strings of text
    by_bar: dict[int, dict[int, list[tuple[int, int]]]] = {}
    for s in slots:
        by_bar.setdefault(s.bar, {})[s.step] = s.shape
    for b, (_, beats_in_bar) in enumerate(bars):
        rows = [[] for _ in range(6)]
        for step in range(beats_in_bar * SUB):
            shape = dict(by_bar.get(b, {}).get(step, []))
            width = max([len(str(f)) for f in shape.values()] + [1])
            for string in range(1, 7):
                cell = str(shape[string]) if string in shape else ""
                rows[string - 1].append(cell.ljust(width, "-") + "-")
        cols.append(["".join(r) for r in rows])
    out = []
    for i in range(0, len(cols), per_line):
        chunk = cols[i : i + per_line]
        out.append(f"bar {i + 1}")
        for string in range(6):
            out.append(f"{names[string]:<2}|" + "|".join(c[string] for c in chunk) + "|")
        out.append("")
    return "\n".join(out)

"""String/fret assignment: turns detected notes into playable guitar positions.

Notes that start together form one event (a chord). Each event gets the
candidate positions where every note sits on its own string, and a Viterbi
pass picks the sequence with the lowest total cost: a narrow hand shape, a low
position, and small hand moves between events. Pure Python, no audio.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import product

# MIDI pitches of the open strings, string 1 (high e) first.
STANDARD = (64, 59, 55, 50, 45, 40)
TUNINGS = {
    "standard": STANDARD,
    "half-down": tuple(p - 1 for p in STANDARD),
    "drop-d": (64, 59, 55, 50, 45, 38),
    "full-down": tuple(p - 2 for p in STANDARD),
}

CHORD_WINDOW = 0.035  # seconds: onsets this close are one strum
MAX_FRET = 20
MAX_SPAN = 4  # frets between the lowest and highest fretted note of a shape
MAX_CANDIDATES = 48


@dataclass
class Note:
    onset: float
    offset: float
    pitch: int
    velocity: float = 1.0
    # Filled in by assign(): string 1-6 (1 = high e) and fret.
    string: int | None = None
    fret: int | None = None


@dataclass
class Event:
    onset: float
    notes: list[Note] = field(default_factory=list)


OVERTONES = (12, 19, 24)  # octave, octave + fifth, two octaves


def drop_overtones(notes: list[Note], window: float = CHORD_WINDOW, ratio: float = 0.7) -> list[Note]:
    """Removes notes that are likely overtones: an octave, a twelfth or two
    octaves above a louder note that starts at the same time. Real octave
    doubles that are played as loud as the root survive."""
    keep = []
    for n in notes:
        root = any(
            n.pitch - m.pitch in OVERTONES and abs(n.onset - m.onset) <= window and n.velocity < ratio * m.velocity
            for m in notes
            if m is not n
        )
        if not root:
            keep.append(n)
    return keep


def group_events(notes: list[Note], window: float = CHORD_WINDOW) -> list[Event]:
    events: list[Event] = []
    for n in sorted(notes, key=lambda n: (n.onset, n.pitch)):
        if events and n.onset - events[-1].onset <= window and len(events[-1].notes) < 6:
            events[-1].notes.append(n)
        else:
            events.append(Event(n.onset, [n]))
    return events


def positions(pitch: int, tuning: tuple[int, ...]) -> list[tuple[int, int]]:
    """(string, fret) pairs that sound `pitch`. String numbers start at 1."""
    return [(s + 1, pitch - o) for s, o in enumerate(tuning) if 0 <= pitch - o <= MAX_FRET]


@dataclass(frozen=True)
class Weights:
    """Costs of the fret choice. Tuned on GuitarSet (see docs/autotab.md)."""
    span: float = 1.0  # per fret between the lowest and highest fretted note of a shape
    position: float = 0.15  # per fret of the hand position: prefers the low frets
    move: float = 0.35  # per fret the hand moves between events


def shape_cost(shape: tuple[tuple[int, int], ...], w: Weights = Weights()) -> float:
    fretted = [f for _, f in shape if f > 0]
    if not fretted:
        return 0.0
    span = max(fretted) - min(fretted)
    return span * w.span + min(fretted) * w.position


def hand(shape: tuple[tuple[int, int], ...], previous: float) -> float:
    fretted = [f for _, f in shape if f > 0]
    return min(fretted) if fretted else previous


def candidates(event: Event, tuning: tuple[int, ...], w: Weights = Weights()) -> list[tuple[tuple[int, int], ...]]:
    """Every shape that puts each note on its own string, cheapest first. Notes
    that fit nowhere (out of range, or no free string) are dropped, quietest first."""
    notes = sorted(event.notes, key=lambda n: -n.velocity)
    while notes:
        options = [positions(n.pitch, tuning) for n in notes]
        if all(options):
            shapes = []
            for combo in product(*options):
                strings = [s for s, _ in combo]
                if len(set(strings)) != len(strings):
                    continue
                fretted = [f for _, f in combo if f > 0]
                if fretted and max(fretted) - min(fretted) > MAX_SPAN:
                    continue
                shapes.append(combo)
            if shapes:
                shapes.sort(key=lambda s: shape_cost(s, w))
                event.notes = notes
                return shapes[:MAX_CANDIDATES]
        notes = notes[:-1]
    event.notes = []
    return []


def assign(notes: list[Note], tuning: tuple[int, ...] = STANDARD, w: Weights = Weights()) -> list[Event]:
    """Picks a string and fret for every note (Viterbi over events). Notes that
    cannot be played in this tuning are left out of the result."""
    events = group_events(notes)
    layers = []
    for ev in events:
        shapes = candidates(ev, tuning, w)
        if shapes:
            layers.append((ev, shapes))
    if not layers:
        return []
    # cost[i][k]: best total cost ending in shape k of layer i; back[i][k]: its predecessor.
    first_ev, first = layers[0]
    cost = [[shape_cost(s, w) for s in first]]
    back: list[list[int]] = [[-1] * len(first)]
    hands = [[hand(s, 0.0) for s in first]]
    for i in range(1, len(layers)):
        _, shapes = layers[i]
        prev_cost, prev_hand = cost[-1], hands[-1]
        row, row_back, row_hand = [], [], []
        for s in shapes:
            best, best_k, best_h = float("inf"), 0, 0.0
            for k, pc in enumerate(prev_cost):
                h = hand(s, prev_hand[k])
                c = pc + shape_cost(s, w) + w.move * abs(h - prev_hand[k])
                if c < best:
                    best, best_k, best_h = c, k, h
            row.append(best)
            row_back.append(best_k)
            row_hand.append(best_h)
        cost.append(row)
        back.append(row_back)
        hands.append(row_hand)
    k = min(range(len(cost[-1])), key=cost[-1].__getitem__)
    for i in range(len(layers) - 1, -1, -1):
        ev, shapes = layers[i]
        for note, (string, fret) in zip(ev.notes, shapes[k]):
            note.string, note.fret = string, fret
        k = back[i][k]
    return [ev for ev, _ in layers]

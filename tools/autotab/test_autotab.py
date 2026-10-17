"""Unit tests for the pure parts (no audio, no GPU): .venv/bin/python -m pytest -q"""
from fretting import STANDARD, TUNINGS, Note, assign, candidates, drop_overtones, group_events, positions
from tabwriter import alphatex, ascii_tab, bars_from, quantize, split


def test_positions_of_low_and_high_notes():
    assert positions(40, STANDARD) == [(6, 0)]  # open low E: one place only
    assert (1, 0) in positions(64, STANDARD) and (2, 5) in positions(64, STANDARD)
    assert positions(39, STANDARD) == []  # below the low string


def test_a_chord_gets_one_note_per_string():
    ev = group_events([Note(0, 1, p) for p in (40, 47, 52, 56, 59, 64)])[0]  # open E major
    best = candidates(ev, STANDARD)[0]
    assert len({s for s, _ in best}) == 6
    assert sorted(best) == [(1, 0), (2, 0), (3, 1), (4, 2), (5, 2), (6, 0)]


def test_a_riff_stays_in_one_position():
    # A minor pentatonic run at fret 5: the cheap path avoids jumps up and down the neck.
    run = [57, 60, 62, 64, 67, 69]
    events = assign([Note(i * 0.25, i * 0.25 + 0.2, p) for i, p in enumerate(run)])
    frets = [n.fret for ev in events for n in ev.notes]
    assert max(frets) - min(f for f in frets if f > 0) <= 4


def test_tuning_down_moves_the_frets():
    ev = assign([Note(0, 1, 39)], TUNINGS["half-down"])
    assert [(n.string, n.fret) for e in ev for n in e.notes] == [(6, 0)]


def test_split_durations():
    assert split(5) == [4, 1]
    assert split(16) == [16]
    assert split(7) == [6, 1]


def test_quantize_and_write():
    beats = [0.5 * i for i in range(9)]  # 120 BPM, two bars of 4/4
    downbeats = [0.0, 2.0]
    events = assign([Note(0.0, 0.4, 40), Note(0.5, 0.9, 45), Note(2.25, 2.4, 50)])
    bars, slots = quantize(events, beats, downbeats)
    assert bars == [(0, 4), (4, 4)]
    assert [(s.bar, s.step) for s in slots] == [(0, 0), (0, 4), (1, 2)]
    tex = alphatex(bars, [("Guitar", slots), ("Guitar R", slots)], title="t", tempo=120, tuning_names=["E4", "B3", "G3", "D3", "A2", "E2"])
    assert tex.count("\\track ") == 2
    # A note lasts until the next one starts (or the bar ends): the A fills the bar.
    assert "0.6.4 0.5.2{d} |" in tex and "\\ts 4 4" in tex and "\\ts 5" not in tex
    txt = ascii_tab(bars, slots, tuning_names=["E4", "B3", "G3", "D3", "A2", "E2"])
    assert txt.splitlines()[6].startswith("E |0")  # low E row starts with the open string


def test_pickup_bar_before_first_downbeat():
    beats = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]
    assert bars_from(beats, [1.0])[0] == (0, 2)


def test_overtones_go_real_octaves_stay():
    root, octave, quiet_twelfth = Note(0, 1, 45, 1.0), Note(0.01, 1, 57, 0.3), Note(0.0, 1, 64, 0.2)
    assert drop_overtones([root, octave, quiet_twelfth]) == [root]
    loud_octave = Note(0.0, 1, 57, 0.9)  # a played octave: as loud as the root
    assert drop_overtones([root, loud_octave]) == [root, loud_octave]

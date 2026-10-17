"""Tunes autotab's settings on GuitarSet, then checks them on recordings it did not tune on.

    .venv/bin/python tune_guitarset.py --data ~/.cache/autotab/guitarset

The note model runs once per recording; the thresholds and the fret weights are
tried on its stored output. Train and check sets never share a recording.
"""
from __future__ import annotations

import argparse
import itertools
import random
from pathlib import Path

from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
from basic_pitch.inference import predict
from basic_pitch.note_creation import model_output_to_notes

from autotab import MAX_HZ, MIN_HZ
from eval_guitarset import f1, match, truth
from fretting import Note, Weights, assign, drop_overtones

FRAMES_PER_S = 22050 / 256


def model_outputs(wavs):
    model = build_icassp_2022_model_path(FilenameSuffix.onnx)
    return [predict(str(w), model)[0] for w in wavs]


def score(outputs, refs, onset, frame, min_ms, overtones, w):
    tot = {"pred": 0, "ref": 0, "note": 0, "tab": 0}
    for out, ref in zip(outputs, refs):
        _, events = model_output_to_notes(
            out, onset_thresh=onset, frame_thresh=frame, min_note_len=max(1, round(min_ms / 1000 * FRAMES_PER_S)),
            min_freq=MIN_HZ, max_freq=MAX_HZ, melodia_trick=True,
        )
        notes = [Note(float(s), float(e), int(p), float(a)) for s, e, p, a, _ in events]
        if overtones is not None:
            notes = drop_overtones(notes, ratio=overtones)
        placed = [n for ev in assign(notes, w=w) for n in ev.notes]
        tot["pred"] += len(placed)
        tot["ref"] += len(ref)
        tot["note"] += match(placed, ref, with_string=False)
        tot["tab"] += match(placed, ref, with_string=True)
    return f1(tot["note"], tot["pred"], tot["ref"]), f1(tot["tab"], tot["pred"], tot["ref"]), tot["pred"] / max(1, tot["ref"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--files", type=int, default=24)
    args = ap.parse_args()
    wavs = sorted(args.data.glob("audio/**/*_mic.wav"))
    random.Random(7).shuffle(wavs)
    train, check = wavs[: args.files], wavs[args.files : 2 * args.files]
    ref = lambda ws: [truth(args.data / "annotation" / w.name.replace("_mic.wav", ".jams")) for w in ws]
    train_out, train_ref = model_outputs(train), ref(train)

    base = (0.6, 0.3, 80.0, 0.7, Weights())
    print("current  note %.3f  tab %.3f  notes/true %.2f" % score(train_out, train_ref, *base))

    # Step 1: note settings, with the current fret weights.
    best_n = max(
        itertools.product([0.4, 0.5, 0.6, 0.7], [0.3, 0.4, 0.5], [60.0, 80.0, 120.0], [None, 0.5, 0.7, 0.9]),
        key=lambda p: score(train_out, train_ref, *p, Weights())[1],
    )
    print("notes    onset %.1f frame %.1f min %dms overtones %s" % (best_n[0], best_n[1], best_n[2], best_n[3]))
    # Step 2: fret weights, with those note settings.
    grid = [Weights(s, p, m) for s, p, m in itertools.product([0.5, 1.0, 2.0], [0.0, 0.05, 0.15, 0.3], [0.1, 0.35, 0.7, 1.2])]
    best_w = max(grid, key=lambda w: score(train_out, train_ref, *best_n, w)[1])
    print("weights  span %.2f position %.2f move %.2f" % (best_w.span, best_w.position, best_w.move))
    print("tuned    note %.3f  tab %.3f  notes/true %.2f  (train)" % score(train_out, train_ref, *best_n, best_w))

    check_out, check_ref = model_outputs(check), ref(check)
    print("\nCHECK on %d other recordings:" % len(check))
    print("current  note %.3f  tab %.3f  notes/true %.2f" % score(check_out, check_ref, *base))
    print("tuned    note %.3f  tab %.3f  notes/true %.2f" % score(check_out, check_ref, *best_n, best_w))


if __name__ == "__main__":
    main()

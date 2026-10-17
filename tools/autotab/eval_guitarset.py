"""Scores autotab on GuitarSet (CC BY 4.0): real guitar recordings with the true
string and fret of every note.

    .venv/bin/python eval_guitarset.py --data ~/.cache/autotab/guitarset --files 24

Note F1: right pitch, onset within 50 ms. Tab F1: also on the right string.
GuitarSet is clean acoustic guitar, so this is the best case; a distorted band
recording scores lower.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from autotab import find_notes
from fretting import STANDARD, Note, assign, drop_overtones

ONSET_TOL = 0.05


def truth(jams_path: Path) -> list[Note]:
    """GuitarSet note_midi annotations: one per string, data_source 0 = low E."""
    data = json.loads(jams_path.read_text())
    out = []
    for ann in data["annotations"]:
        if ann["namespace"] != "note_midi":
            continue
        string = 6 - int(ann["annotation_metadata"]["data_source"])
        for d in ann["data"]:
            pitch = round(d["value"])
            n = Note(d["time"], d["time"] + d["duration"], pitch)
            n.string, n.fret = string, pitch - STANDARD[string - 1]
            out.append(n)
    return out


def match(pred: list[Note], ref: list[Note], with_string: bool) -> int:
    """Greedy one-to-one matching by onset distance."""
    used = set()
    hits = 0
    for p in sorted(pred, key=lambda n: n.onset):
        best, best_d = None, ONSET_TOL
        for i, r in enumerate(ref):
            if i in used or r.pitch != p.pitch or (with_string and r.string != p.string):
                continue
            d = abs(r.onset - p.onset)
            if d <= best_d:
                best, best_d = i, d
        if best is not None:
            used.add(best)
            hits += 1
    return hits


def f1(hits: int, n_pred: int, n_ref: int) -> float:
    p = hits / n_pred if n_pred else 0.0
    r = hits / n_ref if n_ref else 0.0
    return 2 * p * r / (p + r) if p + r else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--files", type=int, default=24)
    ap.add_argument("--onset", type=float, default=0.5)
    ap.add_argument("--frame", type=float, default=0.3)
    ap.add_argument("--min-ms", type=float, default=80.0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--keep-overtones", action="store_true")
    args = ap.parse_args()

    wavs = sorted(args.data.glob("audio/**/*_mic.wav"))
    random.Random(args.seed).shuffle(wavs)
    totals = {"pred": 0, "ref": 0, "note": 0, "tab": 0}
    for wav in wavs[: args.files]:
        jams = args.data / "annotation" / (wav.name.replace("_mic.wav", ".jams"))
        ref = truth(jams)
        notes, _ = find_notes(wav, args.onset, args.frame, args.min_ms)
        if not args.keep_overtones:
            notes = drop_overtones(notes)
        placed = [n for ev in assign(notes) for n in ev.notes]
        note_hits = match(placed, ref, with_string=False)
        tab_hits = match(placed, ref, with_string=True)
        totals["pred"] += len(placed)
        totals["ref"] += len(ref)
        totals["note"] += note_hits
        totals["tab"] += tab_hits
        print(f"{wav.name:<34} notes {f1(note_hits, len(placed), len(ref)):.2f}  tab {f1(tab_hits, len(placed), len(ref)):.2f}")
    print(
        f"\nALL {args.files} files: note F1 {f1(totals['note'], totals['pred'], totals['ref']):.3f}, "
        f"tab F1 {f1(totals['tab'], totals['pred'], totals['ref']):.3f} "
        f"({totals['pred']} predicted, {totals['ref']} true notes)"
    )


if __name__ == "__main__":
    main()

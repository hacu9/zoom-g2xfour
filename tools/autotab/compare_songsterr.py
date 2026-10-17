"""Scores an autotab draft against a Songsterr tab of the same recording.

    .venv/bin/python compare_songsterr.py out/indeleble/Indeleble-notes.json --song 382134

The Songsterr tab is fetched once into ~/.cache/autotab/songsterr and used only
for this score: nothing of it is printed or saved in the repo. Songsterr tabs
are fan transcriptions, so the score means "agrees with that tab".

Positions are compared in beats, not seconds: the draft's notes are placed on
its own detected beats, so tempo drift does not count as an error. The script
finds the offset (and a double or half tempo) where the two line up best.
"""
from __future__ import annotations

import argparse
import gzip
import json
import time
import urllib.request
from bisect import bisect_right
from pathlib import Path

CACHE = Path.home() / ".cache" / "autotab" / "songsterr"
UA = {"User-Agent": "Mozilla/5.0 (tab accuracy test for a personal tool)", "Accept-Encoding": "gzip"}
TOL = 0.2  # quarter notes: about a sixteenth either way


def fetch(url: str, path: Path) -> dict:
    if not path.exists():
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
        if data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        path.write_bytes(data)
        time.sleep(0.8)  # be polite
    return json.loads(path.read_text())


def reference(song: int) -> list[tuple[str, list[tuple[float, int, int, int]]]]:
    """Every guitar track: (name, [(quarter position, pitch, string 1-6, fret)])."""
    CACHE.mkdir(parents=True, exist_ok=True)
    meta = fetch(f"https://www.songsterr.com/api/meta/{song}", CACHE / f"{song}-meta.json")
    out = []
    for i, t in enumerate(meta["tracks"]):
        if "guitar" not in t.get("hash", "") and "guitar" not in str(t.get("instrument", "")).lower():
            continue
        part = fetch(
            f"https://dqsljvtekg760.cloudfront.net/{song}/{meta['revisionId']}/{meta['image']}/{i}.json",
            CACHE / f"{song}-{meta['revisionId']}-{i}.json",
        )
        tuning = part.get("tuning") or t["tuning"]
        notes, pos = [], 0.0
        for m in part["measures"]:
            voice = m["voices"][0]
            for b in voice["beats"]:
                num, den = b["duration"]
                for n in b.get("notes", []):
                    if n.get("rest") or n.get("tie") or n.get("dead") or "fret" not in n:
                        continue
                    s = n["string"]
                    notes.append((pos, tuning[s] + n["fret"], s + 1, n["fret"]))
                pos += 4 * num / den
        out.append((t.get("name") or f"Track {i + 1}", notes))
    return out


def to_quarters(onsets: list[float], beats: list[float], scale: float) -> list[float]:
    """Seconds -> beat positions on the draft's own beats (scale 2 = the beats were half notes)."""
    out = []
    for t in onsets:
        i = max(0, min(len(beats) - 2, bisect_right(beats, t) - 1))
        q = i + (t - beats[i]) / (beats[i + 1] - beats[i])
        out.append(q * scale)
    return out


def matches(pred, ref, offset: float, key) -> int:
    """Greedy one-to-one matching: same key, positions within TOL."""
    by_key: dict = {}
    for i, r in enumerate(ref):
        by_key.setdefault(key(r), []).append((r[0], i))
    used, hits = set(), 0
    for p in pred:
        best, best_d = None, TOL
        for q, i in by_key.get(key(p), []):
            d = abs(q - (p[0] + offset))
            if i not in used and d <= best_d:
                best, best_d = i, d
        if best is not None:
            used.add(best)
            hits += 1
    return hits


def best_offset(pred, ref, lo: float = -16.0, hi: float = 64.0) -> tuple[float, int]:
    """The shift (in quarter steps) that lines up the most same-pitch notes:
    every same-pitch pair votes for the shift that would match it."""
    by_pitch: dict[int, list[float]] = {}
    for r in ref:
        by_pitch.setdefault(r[1], []).append(r[0])
    votes: dict[int, int] = {}
    for p in pred:
        for q in by_pitch.get(p[1], []):
            k = round((q - p[0]) * 4)
            if lo * 4 <= k <= hi * 4:
                votes[k] = votes.get(k, 0) + 1
    if not votes:
        return 0.0, 0
    k = max(votes, key=votes.get)
    return k / 4, votes[k]


def score(pred, ref) -> tuple[float, float, float]:
    """(offset, note F1, tab F1) at the best offset (checked one step either side)."""
    off, _ = best_offset(pred, ref)
    off = max((off - 0.25, off, off + 0.25), key=lambda o: matches(pred, ref, o, lambda n: n[1]))
    h = matches(pred, ref, off, lambda n: n[1])
    t = matches(pred, ref, off, lambda n: (n[1], n[2]))
    return off, f1(h, len(pred), len(ref)), f1(t, len(pred), len(ref))


def f1(h: int, n_pred: int, n_ref: int) -> float:
    return 2 * h / (n_pred + n_ref) if n_pred + n_ref else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("notes", type=Path, help="the -notes.json that autotab.py writes")
    ap.add_argument("--song", type=int, required=True, help="Songsterr song id")
    args = ap.parse_args()
    draft = json.loads(args.notes.read_text())
    beats = draft["beats"]
    refs = reference(args.song)
    print(f"{'draft track':<10} {'Songsterr track':<22} {'scale':>5} {'offset':>7}  note F1  tab F1  (draft notes / tab notes)")
    for label, notes in draft["tracks"].items():
        for name, ref in refs:
            if not ref:
                continue
            results = []
            for scale in (0.5, 1.0, 2.0):  # the beat tracker may have found half or double the tempo
                q = to_quarters([n["onset"] for n in notes], beats, scale)
                pred = [(qq, n["pitch"], n["string"], n["fret"]) for qq, n in zip(q, notes)]
                results.append((score(pred, ref), scale, len(pred)))
            (off, nf, tf), scale, n_pred = max(results, key=lambda r: r[0][1])
            print(f"{label:<10} {name[:22]:<22} {scale:>5} {off:>7.2f}  {nf:.3f}    {tf:.3f}   ({n_pred} / {len(ref)})")


if __name__ == "__main__":
    main()

"""autotab: a draft guitar tab from a recording you own.

    .venv/bin/python autotab.py song.mp3 --out out/song [--tuning standard] [--no-separate]

1. Demucs (htdemucs_6s) separates the guitar stem from the mix.
2. beat_this finds beats and downbeats (bar lines).
3. basic-pitch finds the notes in the guitar stem.
4. fretting.py picks a string and fret for every note.
5. tabwriter.py writes song.tex (alphaTex), song.txt (ASCII tab) and song.mid.

The result is a draft: expect wrong and missing notes on distorted guitar.
See docs/autotab.md.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path

from fretting import TUNINGS, Note, assign, drop_overtones
from tabwriter import PROGRAMS, alphatex, ascii_tab, quantize

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# basic-pitch settings for guitar: E2 (82 Hz, low E) .. about fret 20 on high e.
MIN_HZ, MAX_HZ = 70.0, 1400.0


def say(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def separate(audio: Path, out: Path) -> Path:
    import demucs.separate

    say("1/4 separating the guitar (Demucs htdemucs_6s)…")
    demucs.separate.main(["-n", "htdemucs_6s", "--two-stems", "guitar", "-o", str(out / "stems"), str(audio)])
    stem = out / "stems" / "htdemucs_6s" / audio.stem / "guitar.wav"
    if not stem.exists():
        raise SystemExit(f"Demucs wrote no guitar stem at {stem}")
    return stem


def find_beats(audio: Path) -> tuple[list[float], list[float]]:
    import torch
    from beat_this.inference import File2Beats

    say("2/4 finding beats and bar lines (beat_this)…")
    f2b = File2Beats(checkpoint_path="final0", device="cuda" if torch.cuda.is_available() else "cpu", dbn=False)
    beats, downbeats = f2b(str(audio))
    return [float(b) for b in beats], [float(d) for d in downbeats]


def find_notes(audio: Path, onset: float, frame: float, min_ms: float) -> tuple[list[Note], object]:
    from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
    from basic_pitch.inference import predict

    # The ONNX model: the default picks TFLite, whose runtime breaks with NumPy 2 ("_ARRAY_API not found").
    model = build_icassp_2022_model_path(FilenameSuffix.onnx)

    say("3/4 finding notes (basic-pitch)…")
    _, midi, events = predict(
        str(audio),
        model,
        onset_threshold=onset,
        frame_threshold=frame,
        minimum_note_length=min_ms,
        minimum_frequency=MIN_HZ,
        maximum_frequency=MAX_HZ,
        melodia_trick=True,
    )
    notes = [Note(float(s), float(e), int(p), float(a)) for s, e, p, a, _ in events]
    return notes, midi


def note_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def cut(audio: Path, out: Path, start: float | None, end: float | None) -> Path:
    """The section to tab, as a WAV (ffmpeg reads mp3, m4a, flac…)."""
    target = out / f"{audio.stem}-cut.wav"
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    cmd += ["-i", str(audio)]
    if end is not None:
        cmd += ["-t", str(end - (start or 0))]
    subprocess.run(cmd + [str(target)], check=True)
    return target


def sides(stem: Path, out: Path, threshold: float = 0.85) -> list[tuple[str, Path]]:
    """Rock mixes often pan one guitar left and one right. When the two channels
    of the guitar stem differ, each side becomes its own track."""
    import numpy as np
    import soundfile as sf

    audio, sr = sf.read(str(stem), always_2d=True)
    if audio.shape[1] < 2:
        return [("Guitar", stem)]
    left, right = audio[:, 0], audio[:, 1]
    corr = float(np.corrcoef(left, right)[0, 1]) if left.std() and right.std() else 1.0
    say(f"   left/right correlation of the guitar stem: {corr:.2f}")
    if corr >= threshold:
        return [("Guitar", stem)]
    paths = []
    for label, data in (("Guitar L", left), ("Guitar R", right)):
        p = out / f"{stem.stem}-{label[-1]}.wav"
        sf.write(str(p), data, sr)
        paths.append((label, p))
    return paths


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--title", default=None)
    ap.add_argument("--tuning", choices=sorted(TUNINGS), default="standard")
    ap.add_argument("--start", type=float, default=None, help="tab from this second (e.g. an intro or a solo)")
    ap.add_argument("--end", type=float, default=None, help="tab up to this second")
    ap.add_argument("--no-separate", action="store_true", help="the file is already a guitar-only recording")
    ap.add_argument("--mono", action="store_true", help="one track, even when left and right differ")
    ap.add_argument("--sound", choices=sorted(PROGRAMS), default="clean", help="playback sound in the tab viewer (clean makes wrong notes easy to hear)")
    ap.add_argument("--onset", type=float, default=0.6, help="basic-pitch onset threshold (higher = fewer notes; 0.6 tuned on GuitarSet)")
    ap.add_argument("--frame", type=float, default=0.3, help="basic-pitch frame threshold")
    ap.add_argument("--min-ms", type=float, default=80.0, help="shortest note kept, in ms")
    ap.add_argument("--keep-overtones", action="store_true", help="keep notes that look like overtones of a louder note")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    name = args.audio.stem
    audio = cut(args.audio, args.out, args.start, args.end) if args.start is not None or args.end is not None else args.audio
    stem = audio if args.no_separate else separate(audio, args.out)
    tracks_in = [("Guitar", stem)] if args.mono else sides(stem, args.out)
    # Beats come from the full mix: drums and bass carry the pulse.
    beats, downbeats = find_beats(audio)

    tuning = TUNINGS[args.tuning]
    tracks, stats = [], {}
    bars = []
    for label, path in tracks_in:
        notes, midi = find_notes(path, args.onset, args.frame, args.min_ms)
        midi.write(str(args.out / f"{name}-{label.replace(' ', '_')}.mid"))
        if not args.keep_overtones:
            notes = drop_overtones(notes)
        events = assign(notes, tuning)
        bars, slots = quantize(events, beats, downbeats)
        tracks.append((label, slots))
        stats[label] = {
            "notes": len(notes),
            "placed": sum(len(e.notes) for e in events),
            "below_low_string": sum(1 for n in notes if n.pitch < tuning[-1]),
        }

    say("4/4 writing the tab…")
    gaps = [b - a for a, b in zip(beats, beats[1:])]
    tempo = 60 / statistics.median(gaps) if gaps else 120
    names = [note_name(p) for p in tuning]
    title = args.title or name
    (args.out / f"{name}.tex").write_text(alphatex(bars, tracks, title=f"{title} (autotab draft)", tempo=tempo, tuning_names=names, sound=args.sound))
    (args.out / f"{name}.txt").write_text("\n".join(f"== {label} ==\n\n" + ascii_tab(bars, slots, tuning_names=names) for label, slots in tracks))
    total = sum(s["notes"] for s in stats.values())
    low = sum(s["below_low_string"] for s in stats.values())
    report = {
        "audio": str(audio),
        "stem": str(stem),
        "tracks": stats,
        "tuning": args.tuning,
        "tempo_bpm": round(tempo, 1),
        "beats": len(beats),
        "bars": len(bars),
        "hint": "Many notes below the low string: try --tuning half-down or drop-d." if low > 0.05 * max(1, total) else "",
    }
    (args.out / f"{name}.json").write_text(json.dumps(report, indent=1))
    say(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()

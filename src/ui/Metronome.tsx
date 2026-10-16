import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClickWalker, MAX_BPM, MIN_BPM, clampBpm, tapBpm, type Section } from '../audio/metronome';
import { SONGS, findSongSlot, searchSongs, type Song } from '../songs/songs';
import type { ProbeSession } from '../midi/session';
import { SafetyError } from '../midi/session';
import { tempoEdit, type WritePolicy } from '../midi/writes';

interface Props {
  session: ProbeSession | null;
  deviceId: number | null;
  policy: WritePolicy;
  /** The current patch's tempo, from the pedal. */
  patchTempo: number | null;
  names: ReadonlyMap<number, string>;
  canSelect: boolean;
  onSelectPatch(slot: number): void;
  log(level: 'info' | 'warn' | 'error', text: string): void;
}

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
/** The pedal accepts a patch tempo of 40–250 (write gate). */
const PEDAL_MIN = 40;
const PEDAL_MAX = 250;

/**
 * A click track. Free mode: one tempo and meter that you change live.
 * Song mode: the song's tempo map, section by section; "Next section" moves on
 * at the next bar line.
 */
export function Metronome({ session, deviceId, policy, patchTempo, names, canSelect, onSelectPatch, log }: Props) {
  const [bpm, setBpm] = useState(120);
  const [beats, setBeats] = useState(4);
  const [volume, setVolume] = useState(0.7);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(false);
  const [song, setSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState<{ section: number; beat: number; bpm: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  const map: Section[] = useMemo(() => song?.sections ?? [{ bpm, beats }], [song, bpm, beats]);

  // Follow the pedal: a patch change carries its tempo, so the click follows your footswitch.
  useEffect(() => {
    if (follow && !song && patchTempo !== null) setBpm(clampBpm(patchTempo));
  }, [follow, song, patchTempo]);

  // ---- audio --------------------------------------------------------------
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const engine = useRef<{ walker: ClickWalker; base: number; nextAbs: number; queue: { at: number; section: number; beat: number; bpm: number }[] } | null>(null);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const click = (ctx: AudioContext, at: number, accent: boolean, sectionStart: boolean) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = sectionStart ? 2000 : accent ? 1500 : 1000;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(1, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    osc.connect(env).connect(gainRef.current!);
    osc.start(at);
    osc.stop(at + 0.05);
  };

  /** Starts (or restarts) the walk of `map` at absolute time `at`. */
  const startWalk = useCallback((m: Section[], at: number) => {
    engine.current = { walker: new ClickWalker(m), base: at, nextAbs: at, queue: [] };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const ctx = ctxRef.current!;
    const timer = setInterval(() => {
      const e = engine.current;
      if (!e) return;
      while (e.nextAbs < ctx.currentTime + LOOKAHEAD_S) {
        const c = e.walker.next();
        if (!c) {
          setPlaying(false); // the song ended
          return;
        }
        const at = e.base + c.time;
        click(ctx, at, c.accent, c.accent && c.bar === 0 && c.section > 0);
        e.queue.push({ at, section: c.section, beat: c.beat, bpm: c.bpm });
        e.nextAbs = at + 60 / c.bpm;
      }
    }, TICK_MS);
    // The beat lights follow the audio clock, not the timer.
    let raf = 0;
    let shown = -1;
    const frame = () => {
      const e = engine.current;
      if (e) {
        while (e.queue.length > 1 && e.queue[1].at <= ctx.currentTime) e.queue.shift();
        const q = e.queue[0];
        if (q && q.at <= ctx.currentTime && q.at !== shown) {
          shown = q.at;
          setNow({ section: q.section, beat: q.beat, bpm: q.bpm });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  // A change of tempo or meter in free mode applies from the next beat.
  const mapRef = useRef(map);
  useEffect(() => {
    if (mapRef.current === map) return;
    mapRef.current = map;
    if (playing && engine.current && !song) startWalk(map, engine.current.nextAbs);
  }, [map, playing, song, startWalk]);

  const play = async () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.gain.value = volume;
      gainRef.current.connect(ctxRef.current.destination);
    }
    await ctxRef.current.resume();
    startWalk(map, ctxRef.current.currentTime + 0.06);
    setNow(null);
    setPlaying(true);
  };
  const stop = () => {
    engine.current = null;
    setPlaying(false);
    setNow(null);
  };
  useEffect(() => () => void ctxRef.current?.close(), []);

  // Space bar starts and stops, unless you type in a field.
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => (playing ? stop() : void play());

  // ---- controls -------------------------------------------------------------
  const nudge = (d: number) => setBpm((b) => clampBpm(b + d));
  const tap = () => {
    taps.current = [...taps.current, performance.now()].slice(-8);
    const t = tapBpm(taps.current);
    if (t !== null) setBpm(t);
  };

  const pick = (s: Song) => {
    setSong(s);
    setQuery('');
    setFollow(false);
    setNote(null);
    if (playing) stop();
    const found = findSongSlot(s, names);
    if (!found) {
      setNote(names.size ? `No patch named "${s.patches[0]}" on the pedal. Write it from Song recipes.` : 'The patch list loads after the backup.');
      return;
    }
    if (canSelect) {
      onSelectPatch(found.slot);
      setNote(`Selected patch ${String(found.slot).padStart(3, '0')} ${found.name}.`);
    }
  };

  const target = song ? song.sections[0].bpm : bpm;
  const canWrite = !!session && deviceId !== null && target >= PEDAL_MIN && target <= PEDAL_MAX;
  const sendTempo = () => {
    if (!session || deviceId === null) return;
    try {
      session.send(tempoEdit(deviceId, target), `metronome: patch tempo ${target}`, { write: policy });
      setNote(`Patch tempo set to ${target}. Auto-save keeps it when you change patch.`);
    } catch (e) {
      const text = e instanceof SafetyError ? `The pedal did not get the tempo: ${e.message}` : String(e);
      setNote(text);
      log(e instanceof SafetyError ? 'warn' : 'error', text);
    }
  };

  const results = useMemo(() => (query ? searchSongs(SONGS, query) : []), [query]);
  const shownBeats = song ? song.sections[now?.section ?? 0]?.beats ?? 4 : beats;
  const shownBpm = playing && now ? Math.round(now.bpm) : song ? song.sections[now?.section ?? 0].bpm : bpm;

  return (
    <div
      className="metronome"
      onKeyDown={(e) => {
        if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          toggleRef.current();
        }
      }}
    >
      <div className="met-deck">
        <button className={`met-play ${playing ? 'on' : ''}`} onClick={() => toggleRef.current()} aria-pressed={playing} aria-label={playing ? 'Stop the click' : 'Start the click'}>
          {playing ? '■' : '▶'}
        </button>
        <div className="met-screen" aria-live="off">
          <span className="met-bpm">{shownBpm}</span>
          <span className="met-unit">BPM · {shownBeats} {shownBeats === 1 ? 'beat' : 'beats'}</span>
        </div>
        <div className="beat-dots" aria-hidden>
          {Array.from({ length: shownBeats }, (_, i) => (
            <span key={i} className={`beat-dot ${i === 0 ? 'one' : ''} ${playing && now?.beat === i ? 'lit' : ''}`} />
          ))}
        </div>
      </div>

      <div className="met-controls">
        <div className="row">
          <button onClick={() => nudge(-1)} disabled={!!song} aria-label="Slower by 1 BPM">
            −
          </button>
          <input
            type="number"
            className="met-input"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            disabled={!!song}
            aria-label="Tempo in BPM"
            onChange={(e) => e.target.value && setBpm(clampBpm(Number(e.target.value)))}
          />
          <button onClick={() => nudge(1)} disabled={!!song} aria-label="Faster by 1 BPM">
            +
          </button>
          <button onClick={tap} disabled={!!song}>
            Tap
          </button>
          <label className="small">
            Beats{' '}
            <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} disabled={!!song}>
              {[1, 2, 3, 4, 5, 6, 7, 9, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="small met-volume">
            Volume <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
        </div>
        <div className="row">
          <label className="small" title="A patch change on the pedal sets the click to that patch's tempo">
            <input type="checkbox" checked={follow} disabled={!!song} onChange={(e) => setFollow(e.target.checked)} /> Follow the patch tempo
            {patchTempo !== null && <span className="muted"> (now {patchTempo})</span>}
          </label>
          <button onClick={sendTempo} disabled={!canWrite} title="Writes the tempo into the current patch (needs the backup; real patches need EDIT REAL PATCHES)">
            Set patch tempo to {target}
          </button>
        </div>
      </div>

      <div className="songs">
        <div className="row">
          <input className="search" type="search" placeholder="Find a song: title or artist" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a song" />
          {song && (
            <button onClick={() => (stop(), setSong(null), setNote(null))}>
              Free tempo
            </button>
          )}
        </div>
        {query && (
          <ul className="song-results">
            {results.map((s) => (
              <li key={s.id}>
                <button onClick={() => pick(s)}>
                  <span className="song-title">{s.title}</span>
                  <span className="muted small">{s.artist}</span>
                  <span className="song-bpm">{s.sections.map((x) => x.bpm).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} BPM</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="muted small">No song matches "{query}". The list has the songs from the built-in recipes.</li>}
          </ul>
        )}
        {song && (
          <div className="song-now">
            <p className="small">
              <strong>{song.title}</strong> <span className="muted">· {song.artist}</span>
            </p>
            {song.sections.length > 1 && (
              <>
                <ol className="sections">
                  {song.sections.map((s, i) => (
                    <li key={i} className={playing && now?.section === i ? 'current' : ''}>
                      <span className="sec-name">{s.name ?? `Part ${i + 1}`}</span>
                      <span className="sec-meta">
                        {s.toBpm !== undefined ? `${s.bpm}→${s.toBpm}` : s.bpm} BPM · {s.beats} beats{s.bars !== undefined ? ` · ${s.bars} bars` : ' · until Next'}
                      </span>
                    </li>
                  ))}
                </ol>
                <button disabled={!playing} onClick={() => engine.current?.walker.skip()}>
                  Next section (at the bar line)
                </button>
              </>
            )}
            <p className="small muted">Source: {song.source}</p>
          </div>
        )}
        {note && <p className="small">{note}</p>}
      </div>
    </div>
  );
}

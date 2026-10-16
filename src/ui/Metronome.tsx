import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClickWalker, MAX_BPM, MIN_BPM, barPulses, clampBpm, tapBpm, type Section } from '../audio/metronome';
import { SONGS, barsBefore, findSongSlot, partsOf, searchSongs, type Part, type Song } from '../songs/songs';
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

interface Now {
  section: number;
  bar: number;
  beat: number;
  bpm: number;
}

/**
 * A click track. Free mode: one tempo and meter that you change live.
 * Song mode: the song's tempo map, part by part, from the first part or the
 * one you pick. Jumps happen at the next bar line, so the click never stumbles.
 */
export function Metronome({ session, deviceId, policy, patchTempo, names, canSelect, onSelectPatch, log }: Props) {
  const [bpm, setBpm] = useState(120);
  const [beats, setBeats] = useState(4);
  const [unit, setUnit] = useState(4);
  const [volume, setVolume] = useState(0.7);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(false);
  const [song, setSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [pct, setPct] = useState(100);
  const [countIn, setCountIn] = useState(true);
  const [startPart, setStartPart] = useState(0);
  const [loopPart, setLoopPart] = useState<Part | null>(null);
  const [now, setNow] = useState<Now | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  const parts = useMemo(() => (song ? partsOf(song.sections) : []), [song]);
  /** Section index of the song from a walker index (the count-in bar is not part of the song). */
  const offset = song && countIn ? 1 : 0;

  // The map the walker plays: song sections scaled by Tempo %, after an optional count-in bar.
  const map: Section[] = useMemo(() => {
    if (!song) return [{ bpm, beats, unit }];
    const scaled = song.sections.map((s) => ({ ...s, bpm: (s.bpm * pct) / 100, toBpm: s.toBpm === undefined ? undefined : (s.toBpm * pct) / 100 }));
    if (!countIn) return scaled;
    const first = scaled[parts[startPart]?.from ?? 0];
    return [{ name: 'Count-in', bpm: first.bpm, beats: first.beats, unit: first.unit, bars: 1 }, ...scaled];
  }, [song, bpm, beats, unit, pct, countIn, parts, startPart]);

  // Follow the pedal: a patch change carries its tempo, so the click follows your footswitch.
  useEffect(() => {
    if (follow && !song && patchTempo !== null) setBpm(clampBpm(patchTempo));
  }, [follow, song, patchTempo]);

  // ---- audio --------------------------------------------------------------
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const engine = useRef<{ walker: ClickWalker; base: number; nextAbs: number; queue: (Now & { at: number })[] } | null>(null);
  const partStarts = useMemo(() => new Set(parts.map((p) => p.from + offset)), [parts, offset]);
  const partStartsRef = useRef(partStarts);
  partStartsRef.current = partStarts;

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const click = (ctx: AudioContext, at: number, tone: 'beat' | 'bar' | 'part') => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = tone === 'part' ? 2000 : tone === 'bar' ? 1500 : 1000;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(1, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    osc.connect(env).connect(gainRef.current!);
    osc.start(at);
    osc.stop(at + 0.05);
  };

  /** Starts (or restarts) the walk of `m` at absolute time `at`. */
  const startWalk = useCallback((m: Section[], at: number, from = 0, viaCountIn = false) => {
    const walker = viaCountIn ? new ClickWalker(m, 0) : new ClickWalker(m, from);
    if (viaCountIn && from > 1) walker.skipTo(from); // after the count-in bar
    engine.current = { walker, base: at, nextAbs: at, queue: [] };
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
        const partStart = c.beat === 0 && c.bar === 0 && partStartsRef.current.has(c.section) && c.section > 0;
        click(ctx, at, partStart ? 'part' : c.accent ? 'bar' : 'beat');
        e.queue.push({ at, section: c.section, bar: c.bar, beat: c.beat, bpm: c.bpm });
        e.nextAbs = e.base + e.walker.elapsed;
      }
    }, TICK_MS);
    // The lights follow the audio clock, not the timer.
    let raf = 0;
    let shown = -1;
    const frame = () => {
      const e = engine.current;
      if (e) {
        while (e.queue.length > 1 && e.queue[1].at <= ctx.currentTime) e.queue.shift();
        const q = e.queue[0];
        if (q && q.at <= ctx.currentTime && q.at !== shown) {
          shown = q.at;
          setNow({ section: q.section, bar: q.bar, beat: q.beat, bpm: q.bpm });
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
    const from = song ? (parts[startPart]?.from ?? 0) + offset : 0;
    startWalk(map, ctxRef.current.currentTime + 0.06, from, !!song && countIn);
    if (song && loopPart && engine.current) engine.current.walker.loop = { from: loopPart.from + offset, to: loopPart.to + offset };
    setNow(null);
    setPlaying(true);
  };
  const stop = () => {
    engine.current = null;
    setPlaying(false);
    setNow(null);
  };
  useEffect(() => () => void ctxRef.current?.close(), []);

  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => (playing ? stop() : void play());

  // ---- song parts -------------------------------------------------------------
  const songSection = now ? now.section - offset : -1;
  const partIndex = songSection >= 0 ? parts.findIndex((p) => songSection >= p.from && songSection <= p.to) : -1;
  const part = partIndex >= 0 ? parts[partIndex] : null;

  /** Pick a part: while playing, jump there at the next bar line; when stopped, start there. */
  const goTo = (i: number) => {
    const target = parts[i];
    if (!target) return;
    setStartPart(i);
    if (playing && engine.current) {
      engine.current.walker.skipTo(target.from + offset);
      if (loopPart) {
        setLoopPart(target);
        engine.current.walker.loop = { from: target.from + offset, to: target.to + offset };
      }
    }
  };
  const toggleLoop = () => {
    const p = loopPart ? null : (part ?? parts[startPart]);
    setLoopPart(p);
    if (engine.current) engine.current.walker.loop = p ? { from: p.from + offset, to: p.to + offset } : null;
  };

  // ---- controls -------------------------------------------------------------
  const nudge = (d: number) => setBpm((b) => clampBpm(b + d));
  const tap = () => {
    taps.current = [...taps.current, performance.now()].slice(-8);
    const t = tapBpm(taps.current);
    if (t !== null) setBpm(t);
  };

  const pick = (s: Song) => {
    if (playing) stop();
    setSong(s);
    setQuery('');
    setFollow(false);
    setStartPart(0);
    setLoopPart(null);
    setPct(100);
    setNote(null);
    if (!s.patches.length) return;
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
  const leaveSong = () => {
    stop();
    setSong(null);
    setLoopPart(null);
    setNote(null);
  };

  const shownSection = song ? song.sections[Math.max(0, songSection >= 0 ? songSection : (parts[startPart]?.from ?? 0))] : null;
  const target = Math.round(song ? ((shownSection?.bpm ?? 120) * pct) / 100 : bpm);
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
  const meter = song ? { beats: shownSection?.beats ?? 4, unit: shownSection?.unit ?? 4 } : { beats, unit };
  const dots = barPulses(meter.beats, meter.unit).length;
  const shownBpm = playing && now ? Math.round(now.bpm) : target;
  const inCountIn = playing && !!song && countIn && now?.section === 0;
  const nextPart = part ? parts[partIndex + 1] : null;
  const partBar = part && songSection >= 0 && now ? barsBefore(song!.sections, part, songSection) + now.bar + 1 : null;

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
          <span className="met-unit">
            BPM · {meter.beats}/{meter.unit}
            {song && <span className="met-part">{inCountIn ? 'COUNT-IN' : part ? `${part.name}${partBar ? ` · bar ${partBar}${part.bars ? `/${part.bars}` : ''}` : ''}` : (parts[startPart]?.name ?? '')}</span>}
          </span>
        </div>
        <div className="beat-dots" aria-hidden>
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className={`beat-dot ${i === 0 ? 'one' : ''} ${playing && now?.beat === i ? 'lit' : ''} ${inCountIn ? 'count' : ''}`} />
          ))}
        </div>
      </div>

      {!song && (
        <div className="met-controls">
          <div className="row">
            <button onClick={() => nudge(-1)} aria-label="Slower by 1 BPM">
              −
            </button>
            <input type="number" className="met-input" min={MIN_BPM} max={MAX_BPM} value={bpm} aria-label="Tempo in BPM" onChange={(e) => e.target.value && setBpm(clampBpm(Number(e.target.value)))} />
            <button onClick={() => nudge(1)} aria-label="Faster by 1 BPM">
              +
            </button>
            <button onClick={tap}>Tap</button>
            <label className="small">
              Meter{' '}
              <select value={beats} onChange={(e) => setBeats(Number(e.target.value))} aria-label="Beats per bar">
                {[1, 2, 3, 4, 5, 6, 7, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              /
              <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="Beat unit">
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </label>
            <label className="small met-volume">
              Volume <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
            </label>
          </div>
          <div className="row">
            <label className="small" title="A patch change on the pedal sets the click to that patch's tempo">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow the patch tempo
              {patchTempo !== null && <span className="muted"> (now {patchTempo})</span>}
            </label>
            <button onClick={sendTempo} disabled={!canWrite} title="Writes the tempo into the current patch (needs the backup; real patches need EDIT REAL PATCHES)">
              Set patch tempo to {target}
            </button>
          </div>
        </div>
      )}

      <div className="songs">
        <div className="row">
          <input className="search" type="search" placeholder={`Find a song: ${SONGS.length} songs, title or artist`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a song" />
          {song && <button onClick={leaveSong}>Free tempo</button>}
        </div>
        {query && (
          <ul className="song-results">
            {results.map((s) => {
              const tempos = [...new Set(s.sections.map((x) => x.bpm))];
              return (
                <li key={s.id}>
                  <button onClick={() => pick(s)}>
                    <span className="song-title">{s.title}</span>
                    <span className="muted small">{s.artist}</span>
                    <span className="song-bpm">{tempos.length > 3 ? `${Math.min(...tempos)}–${Math.max(...tempos)}` : tempos.join(' · ')} BPM</span>
                  </button>
                </li>
              );
            })}
            {results.length === 0 && <li className="muted small">No song matches "{query}".</li>}
          </ul>
        )}

        {song && (
          <div className="song-now">
            <div className="row spread">
              <p className="song-head">
                <strong>{song.title}</strong> <span className="muted">· {song.artist}</span>
              </p>
              <div className="row">
                <label className="small">
                  Tempo{' '}
                  <select value={pct} onChange={(e) => setPct(Number(e.target.value))} disabled={playing} title="Scales every part; stop the click to change it">
                    {[50, 60, 70, 75, 80, 85, 90, 95, 100, 110, 120, 200].map((n) => (
                      <option key={n} value={n}>
                        {n} %
                      </option>
                    ))}
                  </select>
                </label>
                <label className="small">
                  <input type="checkbox" checked={countIn} disabled={playing} onChange={(e) => setCountIn(e.target.checked)} /> Count-in bar
                </label>
                <label className="small met-volume">
                  Volume <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                </label>
              </div>
            </div>

            <ol className="parts" aria-label="Song parts: pick one to start or jump there">
              {parts.map((p, i) => {
                const secs = song.sections.slice(p.from, p.to + 1);
                const tempos = [...new Set(secs.map((x) => Math.round((x.bpm * pct) / 100)))];
                const meters = [...new Set(secs.map((x) => `${x.beats}/${x.unit ?? 4}`))];
                const cls = [part === p ? 'current' : '', !playing && i === startPart ? 'start' : '', loopPart?.from === p.from ? 'looping' : ''].join(' ');
                return (
                  <li key={p.from}>
                    <button className={cls} onClick={() => goTo(i)} aria-current={part === p}>
                      <span className="part-name">{p.name}</span>
                      <span className="part-meta">
                        {tempos.length > 2 ? `${Math.min(...tempos)}–${Math.max(...tempos)}` : tempos.join('→')} · {meters.join(' ')}
                        {p.bars !== null ? ` · ${p.bars} bars` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="row">
              <button disabled={!playing || !nextPart} onClick={() => goTo(partIndex + 1)}>
                Next part{nextPart ? `: ${nextPart.name}` : ''}
              </button>
              <button className={loopPart ? 'primary' : ''} aria-pressed={!!loopPart} onClick={toggleLoop}>
                {loopPart ? `Looping ${loopPart.name}` : 'Loop this part'}
              </button>
              <button onClick={sendTempo} disabled={!canWrite} title="Writes the tempo into the current patch (needs the backup; real patches need EDIT REAL PATCHES)">
                Set patch tempo to {target}
              </button>
            </div>
            {song.notes.map((n) => (
              <p key={n} className="small warn-text">
                {n}
              </p>
            ))}
            <p className="small muted">
              Tempo map: {song.url ? <a href={song.url} target="_blank" rel="noreferrer">{song.source}</a> : song.source}. Pick a part to start there; while the click plays, a part jumps at the next bar line.
            </p>
          </div>
        )}
        {note && <p className="small">{note}</p>}
      </div>
    </div>
  );
}

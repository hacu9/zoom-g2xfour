import { useEffect, useRef, useState } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';

/** Track list entry: alphaTab's own track objects stay inside the API. */
interface TrackInfo {
  index: number;
  name: string;
}

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1];
const ACCEPT = '.gp,.gpx,.gp3,.gp4,.gp5,.musicxml,.xml,.mxl,.tex,.txt';

/**
 * Shows a tab file: Guitar Pro, MusicXML, or the alphaTex that tools/autotab
 * writes. alphaTab (MIT, about 2 MB) loads only when this panel opens. It
 * plays the tab with its own sound bank through the computer's output.
 */
export function TabViewer() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<AlphaTabApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [track, setTrack] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [click, setClick] = useState(false);
  /** Off: only the shown track sounds. Two draft guitars at once are hard to follow. */
  const [playAll, setPlayAll] = useState(false);
  const playAllRef = useRef(playAll);
  playAllRef.current = playAll;

  useEffect(() => {
    let disposed = false;
    void import('@coderline/alphatab').then((alphaTab) => {
      if (disposed || !host.current) return;
      const css = getComputedStyle(document.documentElement);
      const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const a = new alphaTab.AlphaTabApi(host.current, {
        // The Vite plugin serves the font at /font/; alphaTab's own guess points into node_modules/.vite/deps.
        core: { logLevel: alphaTab.LogLevel.Warning, fontDirectory: '/font/' },
        display: {
          staveProfile: alphaTab.StaveProfile.Tab,
          resources: {
            mainGlyphColor: color('--ink', '#e8edf5'),
            secondaryGlyphColor: color('--ink-soft', '#9aa7b8'),
            staffLineColor: color('--ink-faint', '#3a4558'),
            barSeparatorColor: color('--ink-faint', '#3a4558'),
            barNumberColor: color('--copper', '#d98a4a'),
            scoreInfoColor: color('--ink', '#e8edf5'),
          },
        },
        player: { playerMode: alphaTab.PlayerMode.EnabledAutomatic, soundFont: '/soundfont/sonivox.sf2', scrollElement: host.current },
      });
      a.scoreLoaded.on((score) => {
        setTitle(score.title || null);
        setTracks(score.tracks.map((t) => ({ index: t.index, name: t.name || `Track ${t.index + 1}` })));
        setTrack(0);
        setError(null);
        soloTrack(a, 0, playAllRef.current);
      });
      a.playerReady.on(() => setReady(true));
      a.playerStateChanged.on((e) => setPlaying(e.state === alphaTab.synth.PlayerState.Playing));
      a.error.on((e) => setError(e.message));
      api.current = a;
    }, (e: unknown) => setError(`alphaTab did not load: ${String(e)}`));
    return () => {
      disposed = true;
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  const open = async (file: File | undefined) => {
    const a = api.current;
    if (!file || !a) return;
    setError(null);
    setReady(false);
    try {
      if (/\.(tex|txt)$/i.test(file.name)) a.tex(await file.text());
      else a.load(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      setError(`Cannot read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pickTrack = (index: number) => {
    const a = api.current;
    const t = a?.score?.tracks[index];
    if (!a || !t) return;
    setTrack(index);
    a.renderTracks([t]);
    soloTrack(a, index, playAll);
  };

  return (
    <div className="tabs">
      <div className="row">
        <label className="small">
          Tab file <input type="file" accept={ACCEPT} onChange={(e) => void open(e.target.files?.[0])} />
        </label>
        {tracks.length > 1 && (
          <label className="small">
            Track{' '}
            <select value={track} onChange={(e) => pickTrack(Number(e.target.value))}>
              {tracks.map((t) => (
                <option key={t.index} value={t.index}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {tracks.length > 0 && (
        <div className="row">
          <button className="primary" disabled={!ready} onClick={() => api.current?.playPause()}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button disabled={!ready} onClick={() => api.current?.stop()}>
            Stop
          </button>
          <label className="small">
            Speed{' '}
            <select
              value={speed}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeed(v);
                if (api.current) api.current.playbackSpeed = v;
              }}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)} %
                </option>
              ))}
            </select>
          </label>
          {tracks.length > 1 && (
            <label className="small">
              <input
                type="checkbox"
                checked={playAll}
                onChange={(e) => {
                  setPlayAll(e.target.checked);
                  if (api.current) soloTrack(api.current, track, e.target.checked);
                }}
              />{' '}
              Play all tracks
            </label>
          )}
          <label className="small">
            <input
              type="checkbox"
              checked={click}
              onChange={(e) => {
                setClick(e.target.checked);
                if (api.current) api.current.metronomeVolume = e.target.checked ? 1 : 0;
              }}
            />{' '}
            Click
          </label>
          {!ready && <span className="small muted">Loading the sound…</span>}
        </div>
      )}
      {title && <p className="small muted">{title}</p>}
      {error && <p className="warn-text">{error}</p>}
      {tracks.length === 0 && !error && (
        <p className="small muted">
          Open a Guitar Pro or MusicXML file, or a draft from <code>tools/autotab</code> (<code>.tex</code>). See docs/autotab.md.
        </p>
      )}
      <div className="tab-view" ref={host} />
    </div>
  );
}

/** Mutes every track except `index`, or unmutes all of them. */
function soloTrack(a: AlphaTabApi, index: number, all: boolean) {
  const tracks = a.score?.tracks ?? [];
  a.changeTrackMute(tracks, false);
  if (!all) a.changeTrackMute(tracks.filter((t) => t.index !== index), true);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProbeSession } from '../midi/session';
import { PedalTracker, readControl, type PedalSignature } from '../audio/pedal';
import { extensionFor, formatDuration, isPedalDevice, isWireless, latencyNote, peakLevel, pickMimeType, pickPedalInput, takeFileName } from '../audio/recorder';
import { downloadBlob } from '../log/log';

interface Take {
  id: number;
  name: string;
  url: string;
  blob: Blob;
  seconds: number;
}

interface Props {
  session: ProbeSession | null;
  patchName: string | null;
}

type PedalState = { mode: 'off' } | { mode: 'learning' } | { mode: 'learned'; sig: PedalSignature };

/**
 * Records the pedal's USB audio and plays the takes back.
 * The takes live in memory only: a reload loses the ones you did not save.
 */
export function Recorder({ session, patchName }: Props) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [loop, setLoop] = useState(true);
  const [countIn, setCountIn] = useState<number>(() => readCountIn());
  /** Seconds left before the take starts, or null when no count-in runs. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pedal, setPedal] = useState<PedalState>({ mode: 'off' });
  const [pedalPos, setPedalPos] = useState<number | null>(null);
  const [pedalToggles, setPedalToggles] = useState(true);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  /** Send the input to an output so you hear the pedal through the computer. Off at each load. */
  const [listen, setListen] = useState(false);
  /** '' = the system default output. */
  const [sinkId, setSinkId] = useState('');
  const [listenVol, setListenVol] = useState(0.8);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const listenGain = useRef<GainNode | null>(null);
  const listenVolRef = useRef(listenVol);
  listenVolRef.current = listenVol;
  const recorder = useRef<MediaRecorder | null>(null);
  const nextId = useRef(1);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const listInputs = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const all = devices.filter((d) => d.kind === 'audioinput');
    setInputs(all);
    setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
    return all;
  }, []);

  /** Opens the input. The first call makes Chrome ask for microphone permission. */
  const open = useCallback(
    async (id?: string, switched = false): Promise<void> => {
      setError(null);
      try {
        // A guitar is not a voice: no echo cancel, no noise gate, no auto gain.
        // latency 0 asks Chrome for its smallest input buffer (Listen); the DOM types lack the field.
        const audio: MediaTrackConstraints & { latency?: number } = { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0 };
        const s = await navigator.mediaDevices.getUserMedia({ audio });
        const all = await listInputs();
        // Device names appear only after permission: switch to the pedal if the first pick was the default mic.
        const zoom = pickPedalInput(all);
        const usedId = s.getAudioTracks()[0]?.getSettings().deviceId ?? '';
        // One switch at most: an empty or unstable device id must not loop.
        if (!id && !switched && zoom?.deviceId && zoom.deviceId !== usedId) {
          s.getTracks().forEach((t) => t.stop());
          return open(zoom.deviceId, true);
        }
        setInputId(usedId);
        setStream((old) => {
          old?.getTracks().forEach((t) => t.stop());
          return s;
        });
      } catch (e) {
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Chrome blocked the microphone. Allow it in the address bar, then try again.' : String(e));
      }
    },
    [listInputs],
  );

  // Close the input when the panel goes away.
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  // On unmount: stop a running take and release every take's URL (the ref sees the latest list).
  const takesRef = useRef(takes);
  takesRef.current = takes;
  useEffect(
    () => () => {
      const rec = recorder.current;
      recorder.current = null;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      takesRef.current.forEach((t) => URL.revokeObjectURL(t.url));
    },
    [],
  );

  // Plug or unplug: refresh the list. If our input goes away, drop the stream and end the take.
  useEffect(() => {
    if (!supported) return;
    const onChange = () => void listInputs();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [supported, listInputs]);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    const onEnded = () => {
      if (recorder.current?.state === 'recording') recorder.current.stop(); // onstop still saves the take
      recorder.current = null;
      setRecording(false);
      setCountdown(null);
      setStream(null);
      setLevel(0);
      setError('The audio input went away. Plug the pedal back in, then click Use pedal audio.');
    };
    track.addEventListener('ended', onEnded);
    return () => track.removeEventListener('ended', onEnded);
  }, [stream]);

  // Level meter.
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser); // not to the speakers: Listen does that, on request
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let shown = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      shown = Math.max(peakLevel(buf), shown * 0.9); // fast attack, slow fall
      setLevel(shown);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream]);

  // Listen: input -> volume -> the chosen output. Its own context, so the meter keeps running when it is off.
  useEffect(() => {
    if (!stream || !listen) {
      setLatencyMs(null);
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const gain = ctx.createGain();
    gain.gain.value = listenVolRef.current;
    ctx.createMediaStreamSource(stream).connect(gain).connect(ctx.destination);
    listenGain.current = gain;
    let alive = true;
    const out = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (sinkId && out.setSinkId) {
      out.setSinkId(sinkId).catch((e) => alive && setError(`Chrome cannot play to that output: ${String(e)}`));
    }
    void ctx.resume();
    // Input + processing + output delay. outputLatency settles after the first callbacks, so read it again.
    const input = stream.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
    const measure = () => setLatencyMs(Math.round(((input?.latency ?? 0) + ctx.baseLatency + (ctx.outputLatency || 0)) * 1000));
    measure();
    const t = setInterval(measure, 1000);
    return () => {
      alive = false;
      clearInterval(t);
      listenGain.current = null;
      void ctx.close();
    };
  }, [stream, listen, sinkId]);
  useEffect(() => {
    const g = listenGain.current;
    g?.gain.setTargetAtTime(listenVol, g.context.currentTime, 0.02);
  }, [listenVol]);

  // Timer while recording.
  useEffect(() => {
    if (!recording) return;
    const start = performance.now();
    const t = setInterval(() => setElapsed((performance.now() - start) / 1000), 200);
    return () => clearInterval(t);
  }, [recording]);

  const start = useCallback(() => {
    if (!stream || recorder.current) return;
    const mime = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 256_000 } : undefined);
    const chunks: Blob[] = [];
    const began = performance.now();
    const when = new Date();
    const name = patchName;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime });
      const take: Take = {
        id: nextId.current++,
        name: takeFileName(name, when, extensionFor(blob.type)),
        url: URL.createObjectURL(blob),
        blob,
        seconds: (performance.now() - began) / 1000,
      };
      setTakes((ts) => [take, ...ts]);
    };
    rec.start(250);
    recorder.current = rec;
    setElapsed(0);
    setRecording(true);
  }, [stream, patchName]);

  const stop = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }, []);

  // Record: stop a take, cancel a count-in, start a count-in, or start at once.
  const toggle = useCallback(() => {
    if (recorder.current) stop();
    else if (countdown !== null) setCountdown(null);
    else if (countIn > 0 && stream) setCountdown(countIn);
    else start();
  }, [start, stop, countdown, countIn, stream]);

  // Count-in: one tick per second, then the take starts. No input, no count-in.
  useEffect(() => {
    if (countdown === null) return;
    if (!stream) return setCountdown(null);
    if (countdown === 0) {
      setCountdown(null);
      start();
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, stream, start]);
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const togglesRef = useRef(pedalToggles);
  togglesRef.current = pedalToggles;

  // Expression pedal: learn what it sends, then show its position and use the toe end as a switch.
  useEffect(() => {
    if (!session || pedal.mode === 'off') return;
    const tracker = pedal.mode === 'learned' ? new PedalTracker(pedal.sig) : null;
    return session.subscribe((d) => {
      const r = readControl(d);
      if (!r) return;
      if (!tracker) {
        setPedal({ mode: 'learned', sig: r.sig });
        return;
      }
      const out = tracker.feed(r);
      if (!out) return;
      setPedalPos(out.position);
      if (out.toe && togglesRef.current) toggleRef.current();
    });
  }, [session, pedal]);

  const remove = (id: number) =>
    setTakes((ts) => {
      const t = ts.find((x) => x.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return ts.filter((x) => x.id !== id);
    });

  if (!supported) return <p className="muted">This browser cannot record audio. Use Chrome.</p>;

  return (
    <div className="recorder">
      <div className="rec-deck">
        <button
          className={`rec-button ${recording ? 'on' : ''} ${countdown !== null ? 'arming' : ''}`}
          disabled={!stream}
          onClick={toggle}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : countdown !== null ? 'Cancel the count-in' : 'Record'}
          title={recording ? 'Stop' : countdown !== null ? 'Cancel' : countIn ? `Record after ${countIn} s` : 'Record'}
        >
          <span className="rec-dot" />
        </button>
        <div className="rec-readout">
          <div className="rec-top">
            {countdown !== null ? (
              <div className="rec-time counting" key={countdown} role="status" aria-live="assertive">
                {countdown > 0 ? countdown : 'REC'}
              </div>
            ) : (
              <div className="rec-time">{recording ? formatDuration(elapsed) : '0:00'}</div>
            )}
            <label className="small count-in">
              Count-in{' '}
              <select value={countIn} onChange={(e) => saveCountIn(setCountIn, Number(e.target.value))} disabled={countdown !== null}>
                <option value={0}>Off</option>
                <option value={3}>3 s</option>
                <option value={5}>5 s</option>
              </select>
            </label>
          </div>
          <div className="meter" role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <div className="meter-fill" style={{ width: `${Math.min(100, level * 100)}%` }} />
          </div>
          <div className="small muted">{level >= 0.99 ? <span className="warn-text">Clipping: turn the pedal's output level down.</span> : stream ? 'Play: the bar shows the level.' : ' '}</div>
        </div>
        <div className="rec-source">
          {stream ? (
            <label className="small">
              Input{' '}
              <select value={inputId} onChange={(e) => void open(e.target.value)} disabled={recording}>
                {inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Input'}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button className="primary" onClick={() => void open()}>
              Use pedal audio
            </button>
          )}
        </div>
      </div>
      {stream && (
        <ListenControls
          listen={listen}
          onListen={setListen}
          volume={listenVol}
          onVolume={setListenVol}
          outputs={outputs}
          sinkId={sinkId}
          onSink={setSinkId}
          latencyMs={latencyMs}
        />
      )}
      {error && <p className="warn-text">{error}</p>}
      {stream && !pickPedalInput(inputs) && <p className="small warn-text">I do not see the G2X FOUR as an audio input. Plug it in with USB: it appears in the Input list.</p>}
      {stream && !recording && (() => {
        const zoom = pickPedalInput(inputs);
        return zoom && zoom.deviceId !== inputId ? (
          <p className="small">
            The pedal is here now.{' '}
            <button onClick={() => void open(zoom.deviceId)}>Use {zoom.label}</button>
          </p>
        ) : null;
      })()}

      <div className="exp">
        <div className="row">
          <strong className="small">Expression pedal</strong>
          {pedal.mode === 'off' && (
            <button disabled={!session} onClick={() => setPedal({ mode: 'learning' })} title={session ? '' : 'Needs the MIDI connection'}>
              Learn pedal
            </button>
          )}
          {pedal.mode === 'learning' && (
            <>
              <span className="small warn-text">Move the pedal now…</span>
              <button onClick={() => setPedal({ mode: 'off' })}>Cancel</button>
            </>
          )}
          {pedal.mode === 'learned' && (
            <>
              <span className="small muted">Learned: {pedal.sig.label}</span>
              <label className="small">
                <input type="checkbox" checked={pedalToggles} onChange={(e) => setPedalToggles(e.target.checked)} /> Toe down starts and stops the recording
              </label>
              <button onClick={() => (setPedal({ mode: 'off' }), setPedalPos(null))}>Forget</button>
            </>
          )}
        </div>
        {pedal.mode === 'learned' && (
          <div className="exp-track" aria-hidden>
            <div className="exp-fill" style={{ width: `${(pedalPos ?? 0) * 100}%` }} />
          </div>
        )}
        <p className="small muted">
          {pedal.mode === 'learning'
            ? 'If nothing happens, the pedal sends nothing over USB for the expression pedal in this patch. Try a patch that uses the pedal (volume, wah, or a knob assigned to it).'
            : 'Rock the pedal from heel to toe once after you learn it, so the app knows the full range. Then a push to the toe end acts as a footswitch.'}
        </p>
      </div>

      {takes.length > 0 && (
        <div className="takes">
          <label className="small">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop playback (play along over your take)
          </label>
          <ul>
            {takes.map((t) => (
              <li key={t.id} className="take">
                <span className="take-name">{t.name}</span>
                <span className="small muted mono">{formatDuration(t.seconds)}</span>
                <audio controls loop={loop} src={t.url} preload="metadata" />
                <button onClick={() => downloadBlob(t.name, t.blob)}>Save</button>
                <button onClick={() => remove(t.id)} aria-label={`Delete ${t.name}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <p className="small muted">The takes stay only until you reload the page. Save the ones you want to keep.</p>
        </div>
      )}
    </div>
  );
}

interface ListenProps {
  listen: boolean;
  onListen: (on: boolean) => void;
  volume: number;
  onVolume: (v: number) => void;
  outputs: MediaDeviceInfo[];
  sinkId: string;
  onSink: (id: string) => void;
  latencyMs: number | null;
}

const canPickOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

function ListenControls({ listen, onListen, volume, onVolume, outputs, sinkId, onSink, latencyMs }: ListenProps) {
  const label = outputs.find((d) => d.deviceId === (sinkId || 'default'))?.label ?? '';
  const note = latencyMs === null ? null : latencyNote(latencyMs);
  return (
    <div className="listen">
      <div className="row">
        <button className={listen ? 'on' : ''} aria-pressed={listen} onClick={() => onListen(!listen)}>
          {listen ? 'Listening' : 'Listen'}
        </button>
        <label className="small">
          Volume{' '}
          <input type="range" min={0} max={1.5} step={0.05} value={volume} onChange={(e) => onVolume(Number(e.target.value))} aria-label="Listen volume" />
        </label>
        {canPickOutput && (
          <label className="small">
            Output{' '}
            <select value={sinkId} onChange={(e) => onSink(e.target.value)}>
              <option value="">System default</option>
              {outputs
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Output'}
                  </option>
                ))}
            </select>
          </label>
        )}
        {listen && note && (
          <span className={`small mono latency ${note.level}`} title="Input + processing + output delay, as Chrome reports it">
            {latencyMs} ms
          </span>
        )}
      </div>
      <p className="small muted">
        {listen && note ? `${note.text} ` : 'Hear the pedal through the computer, in the output you pick. '}
        {listen && label && isWireless(label) && <span className="warn-text">A wireless headset adds a delay of its own that Chrome does not see (Bluetooth: 100–300 ms). For no delay, plug wired headphones into the pedal's PHONES jack. </span>}
        {listen && label && isPedalDevice(label) && <span className="warn-text">This output is the pedal itself: you hear the sound twice. Pick your headset. </span>}
      </p>
    </div>
  );
}

const COUNT_IN_KEY = 'zoom-g2xfour.countIn';

/** The count-in choice is a per-viewer convenience: storage may be missing or blocked. */
function readCountIn(): number {
  try {
    const v = Number(localStorage.getItem(COUNT_IN_KEY));
    return v === 3 || v === 5 ? v : 0;
  } catch {
    return 0;
  }
}

function saveCountIn(set: (v: number) => void, v: number) {
  set(v);
  try {
    localStorage.setItem(COUNT_IN_KEY, String(v));
  } catch {
    /* the choice lasts for this page only */
  }
}

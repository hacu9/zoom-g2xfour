import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { annotate } from './midi/annotate';
import { autoSelect, requestWebMidi, type InputPort, type MidiBackend, type OutputPort } from './midi/backend';
import { READ_COMMANDS } from './midi/commands';
import { listFiles } from './midi/fileList';
import { byteHex, parseHex, toHex } from './midi/hex';
import { IDENTITY_REQUEST, isIdentityReply, parseIdentityReply, type IdentityReply } from './midi/identity';
import { createMockBackend } from './midi/mock';
import { classify, type Classification } from './midi/safety';
import { ProbeSession, SafetyError } from './midi/session';
import { DEFAULT_ZOOM_ID, isZoomSysex, zoomSysex } from './midi/zoom';
import { downloadBlob, downloadText, exportText } from './log/log';
import { backupAll, duplicateGroups, readBankInfo, toSyx } from './midi/backup';
import { effectById } from './catalog/g2four';
import { useLog } from './log/useLog';
import { ConfirmDialog } from './probe/ConfirmDialog';
import { LogView } from './probe/LogView';
import { PatchEditor } from './editor/PatchEditor';
import { RecipePanel } from './editor/RecipePanel';
import { BUILT_IN } from './recipe/builtin';
import { RestorePanel } from './editor/RestorePanel';
import type { SyxEntry } from './midi/syx';
import { writableAfter, type WritePolicy } from './midi/writes';
import { patchName, type RawPatch } from './midi/ptcf';
import { patchSelect, stepSlot } from './midi/patchSelect';
import { PedalHeader } from './ui/PedalHeader';
import { PatchList } from './ui/PatchList';
import { Recorder } from './ui/Recorder';
import { Metronome } from './ui/Metronome';
import { TabViewer } from './ui/TabViewer';
import { fileStamp } from './text';
import pkg from '../package.json';

/** Patch names that the built-in recipes write: marked as yours in the patch list. */
const RECIPE_NAMES = new Set(BUILT_IN.map((b) => (b.recipe as { patchName?: string }).patchName).filter(Boolean));

export function App() {
  const log = useLog();
  const [backend, setBackend] = useState<MidiBackend | null>(null);
  const [inputs, setInputs] = useState<InputPort[]>([]);
  const [outputs, setOutputs] = useState<OutputPort[]>([]);
  const [inId, setInId] = useState('');
  const [outId, setOutId] = useState('');
  const [session, setSession] = useState<ProbeSession | null>(null);
  const [identity, setIdentity] = useState<IdentityReply | null>(null);
  const [deviceIdText, setDeviceIdText] = useState(byteHex(DEFAULT_ZOOM_ID));
  const [hexText, setHexText] = useState('');
  const [researchMode, setResearchMode] = useState(false);
  const [pending, setPending] = useState<{ bytes: number[]; cls: Classification } | null>(null);
  // One long job at a time (file listing or backup); it also locks the console.
  const [listing, setListing] = useState<AbortController | null>(null);
  const [progress, setProgress] = useState('');
  // Chrome blocks a second automatic download, so the summary waits for a click.
  const [summary, setSummary] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Write side. Nothing writes until a backup ran in this session.
  const [sessionBackup, setSessionBackup] = useState<SyxEntry[]>([]);
  const [scratchSlots, setScratchSlots] = useState<ReadonlySet<number>>(new Set());
  const [perBank, setPerBank] = useState(10);
  const [patchCount, setPatchCount] = useState(0);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [allowRealPatchEdits, setAllowRealPatchEdits] = useState(false);
  const [midiState, setMidiState] = useState<'checking' | 'no-midi' | 'need-permission' | 'ready'>('checking');
  // The session whose ports are open: the auto backup waits for it.
  const [readySession, setReadySession] = useState<ProbeSession | null>(null);
  const [backupState, setBackupState] = useState<'none' | 'running' | 'done' | 'failed'>('none');
  const [backupFile, setBackupFile] = useState<{ name: string; blob: Blob } | null>(null);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [patch, setPatch] = useState<RawPatch | null>(null);
  const setName = useCallback((slot: number, name: string) => setNames((cur) => new Map(cur).set(slot, name)), []);
  const logAdd = log.add;
  const panelLog = useCallback(
    (level: 'info' | 'warn' | 'error', text: string, notes?: string[]) => logAdd(level, text, undefined, notes),
    [logAdd],
  );
  // Writable = "Empty" in the backup, or Empty again after a restore, or holds a recipe this app wrote.
  const ownSlots = useRef(new Set<number>());
  // A recipe write or a restore runs: nothing in the app may change patch until it ends.
  const [writing, setWriting] = useState(false);
  // The tab viewer (alphaTab, about 2 MB) loads on the first open and then stays.
  const [tabsOpened, setTabsOpened] = useState(false);
  // A restore: the slot now holds a restored patch (real) or Empty, never this app's recipe.
  const onSlotWritten = useCallback((slot: number, name: string) => {
    setName(slot, name);
    ownSlots.current.delete(slot);
    setScratchSlots((cur) => writableAfter(cur, slot, name, 'restore'));
  }, [setName]);
  const onRecipeWritten = useCallback((slot: number, name: string) => {
    setName(slot, name);
    ownSlots.current.add(slot);
    setScratchSlots((cur) => writableAfter(cur, slot, name, 'recipe'));
  }, [setName]);
  const policy: WritePolicy = useMemo(
    () => ({ backupTaken: sessionBackup.length > 0, scratchSlots, currentSlot, perBank, patchCount, allowRealPatchEdits, confirmedSlot: null, slotNames: names }),
    [sessionBackup, scratchSlots, currentSlot, perBank, patchCount, allowRealPatchEdits, names],
  );

  const deviceId = /^[0-7][0-9a-f]$/i.test(deviceIdText.trim()) ? parseInt(deviceIdText.trim(), 16) : null;

  // --- connect -------------------------------------------------------------
  const refreshPorts = useCallback((b: MidiBackend) => {
    const ins = b.inputs();
    const outs = b.outputs();
    setInputs(ins);
    setOutputs(outs);
    setInId((cur) => (ins.some((p) => p.id === cur) ? cur : (autoSelect(ins)?.id ?? '')));
    setOutId((cur) => (outs.some((p) => p.id === cur) ? cur : (autoSelect(outs)?.id ?? '')));
    return { ins, outs };
  }, []);

  const connect = async (mock: boolean) => {
    try {
      const b = mock ? createMockBackend() : await requestWebMidi();
      setBackend(b);
      setMidiState('ready');
      const { ins, outs } = refreshPorts(b);
      logAdd('info', `${mock ? 'MOCK backend' : 'Web MIDI'} ready. SysEx enabled: ${b.sysexEnabled}. ${ins.length} input(s), ${outs.length} output(s).`);
      for (const p of ins) logAdd('info', `  input  "${p.name}" (${p.manufacturer || '?'}) ${p.state} id=${p.id}`);
      for (const p of outs) logAdd('info', `  output "${p.name}" (${p.manufacturer || '?'}) ${p.state} id=${p.id}`);
      if (!autoSelect(ins) || !autoSelect(outs)) logAdd('warn', 'No port name contains "ZOOM" or "G2". Pick the ports by hand.');
    } catch (e) {
      logAdd('error', e instanceof Error ? e.message : String(e));
    }
  };

  // Auto-connect: once Chrome has the MIDI + SysEx permission, it gives
  // access without a prompt, so the page connects on load. Without the
  // permission, the Connect button asks for it (a click is a user gesture).
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      setMidiState('no-midi');
      return;
    }
    navigator.permissions
      .query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor)
      .then((p) => (p.state === 'granted' ? connect(false) : setMidiState('need-permission')))
      .catch(() => setMidiState('need-permission'));
    // connect is stable enough here: it runs once, at load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!backend) return;
    return backend.onChange((what) => {
      refreshPorts(backend);
      logAdd('info', `Port state: ${what}`);
    });
  }, [backend, refreshPorts, logAdd]);

  // A port Chrome keeps as "disconnected" counts as gone: a replug then makes a new session.
  const input = useMemo(() => inputs.find((p) => p.id === inId && p.state !== 'disconnected'), [inputs, inId]);
  const output = useMemo(() => outputs.find((p) => p.id === outId && p.state !== 'disconnected'), [outputs, outId]);
  // The running job (backup or file listing). A session change aborts it.
  const jobRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<ProbeSession | null>(null);

  useEffect(() => {
    if (!input || !output) {
      // Unplugged: a running backup belongs to the closed session and returns early.
      setSession(null);
      setBackupState((s) => (s === 'running' ? 'none' : s));
      return;
    }
    const s = new ProbeSession(input, output, {
      onIn: (data) => logAdd('in', '', data, annotate(data)),
      onOut: (bytes, cls, label) => logAdd('out', `${label} [${cls.verdict}]`, bytes),
    });
    // A new connection may be a different pedal state: no write without a new backup.
    setSessionBackup([]);
    setScratchSlots(new Set());
    setCurrentSlot(null);
    setBackupState('none');
    setBackupFile(null);
    setSummary(null);
    setNames(new Map());
    ownSlots.current = new Set();
    jobRef.current?.abort();
    sessionRef.current = s;
    s.open().then(
      () => setReadySession(s),
      (e) => logAdd('error', `Cannot open the MIDI port: ${e instanceof Error ? e.message : String(e)}. Close Handy Guitar Lab or any DAW that holds it.`),
    );
    setSession(s);
    return () => {
      setReadySession((cur) => (cur === s ? null : cur));
      if (sessionRef.current === s) sessionRef.current = null;
      s.close();
    };
  }, [input, output, logAdd]);

  // Track which slot the pedal is on: 64 26 after a patch change, or the
  // Bank Select + Program Change that the pedal echoes (also the reply to 33).
  const bankLsb = useRef(0);
  useEffect(() => {
    if (!session || deviceId === null) return;
    const off = session.subscribe((d) => {
      if (isZoomSysex(d) && d[4] === 0x64 && d[5] === 0x26) setCurrentSlot((d[8] | (d[9] << 7)) * perBank + (d[10] | (d[11] << 7)));
      else if ((d[0] & 0xf0) === 0xb0 && d[1] === 0x20) bankLsb.current = d[2];
      else if ((d[0] & 0xf0) === 0xc0) setCurrentSlot(bankLsb.current * perBank + d[1]);
    });
    try {
      // 50 makes the pedal report every patch change (64 26), also changes by foot.
      session.send(zoomSysex(deviceId, [0x50]), 'edit reports on (track patch changes)');
      session.send(zoomSysex(deviceId, [0x33]), 'which patch is active');
    } catch {
      /* ports not open yet */
    }
    return off;
  }, [session, deviceId, perBank]);

  // --- identity ------------------------------------------------------------
  const sendIdentity = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const reply = await session.request(IDENTITY_REQUEST, 'Universal Identity Request', isIdentityReply, 1500);
      if (!reply) {
        logAdd('warn', 'No identity reply in 1.5 s. Check the ports, and close Handy Guitar Lab / Zoom Guitar Lab / any DAW that holds the port.');
        return;
      }
      const id = parseIdentityReply(reply);
      if (!id) {
        logAdd('warn', 'An identity reply came back, but it is malformed. See the IN line above.');
        return;
      }
      setIdentity(id);
      if (id.zoomDeviceId != null) {
        logAdd('info', `Zoom family code ${byteHex(id.zoomDeviceId)}. Prefills keep ${deviceIdText} until you choose otherwise.`);
      }
    } catch (e) {
      logAdd('error', `Identity request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // --- console -------------------------------------------------------------
  const parsed = useMemo(() => parseHex(hexText), [hexText]);
  const preview = parsed.ok ? classify(parsed.bytes) : null;

  const prefill = (body: number[]) => {
    if (deviceId === null) {
      logAdd('error', `Device ID "${deviceIdText}" is not a hex byte 00-7F.`);
      return;
    }
    setHexText(toHex(zoomSysex(deviceId, body)));
  };

  const askSend = () => {
    // One request at a time: a console reply during a listing would be taken as a file entry.
    if (!parsed.ok || !session || listing) return;
    setPending({ bytes: parsed.bytes, cls: classify(parsed.bytes) });
  };

  const doSend = () => {
    if (!pending || !session) return;
    try {
      session.send(pending.bytes, 'console', { researchMode });
    } catch (e) {
      logAdd(e instanceof SafetyError ? 'warn' : 'error', `Not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPending(null);
  };

  const runListing = async () => {
    if (!session || deviceId === null) return;
    const ctl = new AbortController();
    setListing(ctl);
    jobRef.current = ctl;
    logAdd('info', 'File listing started (60 25 / 60 26 / 60 27).');
    try {
      const r = await listFiles(session, deviceId, { signal: ctl.signal });
      logAdd('info', `File listing done: ${r.entries.length} entr${r.entries.length === 1 ? 'y' : 'ies'}. Stop: ${r.stopReason}.`, undefined, r.entries.map((e) => e.name));
    } catch (e) {
      logAdd('error', `File listing failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (jobRef.current !== ctl) return; // a newer job owns the lock
      jobRef.current = null;
      setListing(null);
    }
  };

  const runBackup = async (auto = false) => {
    if (!session || deviceId === null) return;
    const ctl = new AbortController();
    setListing(ctl);
    jobRef.current = ctl;
    setBackupState('running');
    try {
      const { count, perBank } = await readBankInfo(session, deviceId);
      logAdd('info', `Backup started: ${count} patches, ${perBank} per bank (46 00 00 read).`);
      const dumps = await backupAll(session, deviceId, { count, perBank, signal: ctl.signal, onProgress: (n) => setProgress(`${n} / ${count}`) });
      // A reconnect during the backup: this run belongs to a closed session. Touch nothing.
      if (sessionRef.current !== session) return;
      const ok = dumps.filter((d) => d.patch);
      const dups = duplicateGroups(dumps);
      if (!ctl.signal.aborted && ok.length === count) {
        setPerBank(perBank);
        setPatchCount(count);
        setSessionBackup(dumps.filter((d) => d.sysex).map((d) => ({ slot: d.slot, name: patchName(d.patch) ?? '?', msg: Array.from(d.sysex!) })));
        setScratchSlots(new Set(dumps.filter((d) => d.patch?.name?.trimEnd() === 'Empty').map((d) => d.slot)));
        setNames(new Map(dumps.map((d) => [d.slot, patchName(d.patch) ?? '?'])));
        setBackupState('done');
      } else setBackupState('failed');
      const stamp = fileStamp();
      const file = { name: `g2xfour-backup-${stamp}.syx`, blob: new Blob([toSyx(dumps)], { type: 'application/octet-stream' }) };
      setBackupFile(file);
      // The automatic backup keeps the file in memory: no download on every page load.
      if (!auto) downloadBlob(file.name, file.blob);
      setSummary({
        name: `g2xfour-backup-${stamp}.json`,
        text: JSON.stringify(
          {
            exported: new Date().toISOString(),
            count,
            perBank,
            duplicates: dups,
            patches: dumps.map((d) => ({
              slot: d.slot,
              bank: d.bank,
              program: d.program,
              name: patchName(d.patch),
              effects: d.patch?.effects.map((e) => ({ on: e.on, id: e.id.toString(16).padStart(8, '0'), name: effectById(e.id)?.name ?? null, params: e.params })) ?? null,
              tempo: d.patch?.tempo ?? null,
              volume: d.patch?.volume ?? null,
            })),
          },
          null,
          1,
        ),
      });
      logAdd(
        ok.length === count ? 'info' : 'warn',
        `Backup done: ${ok.length}/${dumps.length} patches decoded${ctl.signal.aborted ? ' (stopped by user)' : ''}. ${dups.length} duplicate group(s). ${auto ? 'Automatic backup (in memory): click "Save backup (.syx)" to keep a file.' : `Saved g2xfour-backup-${stamp}.syx.`} Click "Save summary" for the .json.`,
        undefined,
        dups.map((g) => `same bytes: slots ${g.join(', ')} — "${dumps[g[0]].patch?.name ?? '?'}"`),
      );
    } catch (e) {
      if (sessionRef.current !== session) return;
      setBackupState('failed');
      logAdd('error', `Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (jobRef.current !== ctl) return; // a newer job owns the lock
      jobRef.current = null;
      setListing(null);
      setProgress('');
    }
  };

  // Back up once per connection, on its own: writes need it, and a reconnect clears it.
  const autoBackedUp = useRef<ProbeSession | null>(null);
  useEffect(() => {
    if (!readySession || readySession !== session || deviceId === null || autoBackedUp.current === readySession || backend?.kind === 'mock') return;
    autoBackedUp.current = readySession;
    void runBackup(true);
    // runBackup reads the current session; it must not re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readySession, session, deviceId]);

  // --- patch select (Bank Select + Program Change, like the pedal's own footswitches)
  const selectPatch = (slot: number) => {
    if (!session || deviceId === null) return;
    try {
      for (const m of patchSelect(slot, perBank)) session.send(m, `select patch ${slot}`);
      // Ask which patch is active: the reply moves the screen, so it shows what the pedal did.
      session.send(zoomSysex(deviceId, [0x33]), 'which patch is active');
    } catch (e) {
      logAdd('error', `Patch select failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const total = patchCount || 300;

  // --- export --------------------------------------------------------------
  const exportLog = () => {
    const stamp = fileStamp();
    downloadText(
      `g2xfour-log-${stamp}.txt`,
      exportText(log.all.current, {
        tool: `zoom-g2xfour ${pkg.version}`,
        exported: new Date().toISOString(),
        backend: backend?.kind ?? 'none',
        input: inputs.find((p) => p.id === inId)?.name ?? '-',
        output: outputs.find((p) => p.id === outId)?.name ?? '-',
        'device id used for prefills': deviceIdText,
        identity: identity ? `family ${identity.familyBytes.map(byteHex).join(' ')} member ${identity.memberBytes.map(byteHex).join(' ')} version "${identity.versionAscii}"` : '-',
        'user agent': navigator.userAgent,
      }),
    );
  };

  const locked = !!listing || writing;
  const status = backend?.kind === 'mock' ? 'mock' : midiState === 'no-midi' ? 'no-midi' : !backend ? 'need-permission' : session ? 'connected' : 'no-pedal';
  const mine = useMemo(() => new Set([...names].filter(([slot, n]) => RECIPE_NAMES.has(n) || ownSlots.current.has(slot)).map(([slot]) => slot)), [names]);

  return (
    <main>
      <PedalHeader
        status={status}
        slot={currentSlot}
        name={patchName(patch)}
        tempo={patch?.tempo ?? null}
        backup={{ state: backupState, progress }}
        canSwitch={!!session && currentSlot !== null && !locked}
        editReal={allowRealPatchEdits}
        onConnect={() => connect(false)}
        onStep={(d) => currentSlot !== null && selectPatch(stepSlot(currentSlot, d, total))}
        onEditReal={setAllowRealPatchEdits}
      />
      {backend?.kind === 'mock' && <div className="banner">MOCK PEDAL — the replies are invented. They prove the UI works, not the protocol.</div>}

      <section aria-labelledby="s-board" className="board-section">
        <h2 id="s-board">Pedalboard</h2>
        {deviceId !== null && <PatchEditor session={session} deviceId={deviceId} policy={policy} log={panelLog} onPatch={setPatch} busy={writing} />}
        {!session && <p className="muted">{status === 'need-permission' ? 'Press Connect and allow "MIDI device control & reprogram".' : 'Waiting for the pedal. Plug it in with a USB data cable and close Handy Guitar Lab.'}</p>}
      </section>

      <section aria-labelledby="s-rec" className="rec-section">
        <h2 id="s-rec">Recorder</h2>
        <Recorder session={session} patchName={patchName(patch)} />
      </section>

      <section aria-labelledby="s-met" className="met-section">
        <h2 id="s-met">Metronome</h2>
        <Metronome
          session={session}
          deviceId={deviceId}
          policy={policy}
          patchTempo={patch?.tempo ?? null}
          names={names}
          canSelect={!!session && !locked}
          onSelectPatch={selectPatch}
          log={panelLog}
        />
      </section>

      <section aria-labelledby="s-patches">
        <div className="row spread">
          <h2 id="s-patches">Patches</h2>
          <div className="row">
            {backupFile && <button onClick={() => downloadBlob(backupFile.name, backupFile.blob)}>Save backup (.syx)</button>}
            {summary && <button onClick={() => downloadText(summary.name, summary.text)}>Save summary (.json)</button>}
            <button disabled={!session || deviceId === null || locked} onClick={() => runBackup(false)}>
              Back up again
            </button>
          </div>
        </div>
        <PatchList names={names} count={names.size ? total : 0} perBank={perBank} current={currentSlot} mine={mine} disabled={!session || locked} onSelect={selectPatch} />
      </section>

      <details className="panel" onToggle={(e) => e.currentTarget.open && setTabsOpened(true)}>
        <summary>Tabs: Guitar Pro, MusicXML, autotab drafts</summary>
        {tabsOpened && <TabViewer />}
      </details>

      <details className="panel">
        <summary>Song recipes → new patch</summary>
        {deviceId !== null && <RecipePanel session={session} deviceId={deviceId} policy={policy} onSlotWritten={onRecipeWritten} log={panelLog} busy={writing} setBusy={setWriting} />}
      </details>

      <details className="panel">
        <summary>Restore or copy a patch from the backup</summary>
        {deviceId !== null && <RestorePanel session={session} deviceId={deviceId} policy={policy} sessionBackup={sessionBackup} onSlotWritten={onSlotWritten} log={panelLog} busy={writing} setBusy={setWriting} />}
      </details>

      <details className="panel lab">
        <summary>Lab: ports, identity, raw SysEx, log</summary>


      <section aria-labelledby="s-connect">
        <h2 id="s-connect">Ports</h2>
        <div className="row">
          <button className="primary" onClick={() => connect(false)}>
            Connect
          </button>
          <button onClick={() => connect(true)}>Use mock pedal</button>
          {backend && (
            <span className={`pill ${backend.sysexEnabled ? 'ok' : 'bad'}`}>
              {backend.kind} · SysEx {backend.sysexEnabled ? 'on' : 'OFF'}
            </span>
          )}
        </div>
        {backend && (
          <div className="ports">
            <label>
              Input
              <select value={inId} onChange={(e) => setInId(e.target.value)}>
                <option value="">— none —</option>
                {inputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.state})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Output
              <select value={outId} onChange={(e) => setOutId(e.target.value)}>
                <option value="">— none —</option>
                {outputs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.state})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <section aria-labelledby="s-id">
        <h2 id="s-id">Identify</h2>
        <div className="row">
          <button className="primary" disabled={!session || busy || locked} onClick={sendIdentity}>
            Send Identity Request
          </button>
          <code className="muted">{toHex(IDENTITY_REQUEST)}</code>
        </div>
        {identity && (
          <dl className="identity">
            <dt>Manufacturer</dt>
            <dd>
              {identity.manufacturer.map(byteHex).join(' ')} — {identity.manufacturerName}
            </dd>
            <dt>Family</dt>
            <dd>
              {identity.familyBytes.map(byteHex).join(' ')} ({identity.family})
            </dd>
            <dt>Member</dt>
            <dd>
              {identity.memberBytes.map(byteHex).join(' ')} ({identity.member})
            </dd>
            <dt>Version</dt>
            <dd>
              {identity.version.map(byteHex).join(' ')} “{identity.versionAscii}”
            </dd>
            <dt>Zoom ID candidate</dt>
            <dd>{identity.zoomDeviceId != null ? byteHex(identity.zoomDeviceId) : '— (not Zoom)'}</dd>
          </dl>
        )}
        <div className="row">
          <label>
            Device ID for prefills{' '}
            <input className="short mono" value={deviceIdText} onChange={(e) => setDeviceIdText(e.target.value)} aria-invalid={deviceId === null} />
          </label>
          <button onClick={() => setDeviceIdText(byteHex(DEFAULT_ZOOM_ID))}>6E (Zoom FOUR family)</button>
          <button disabled={identity?.zoomDeviceId == null} onClick={() => identity?.zoomDeviceId != null && setDeviceIdText(byteHex(identity.zoomDeviceId))}>
            Use family code
          </button>
        </div>
        <p className="muted small">
          6E is the family address of the Zoom FOUR and MS+ pedals (verified on a G2X FOUR). If 6E gets no reply, try the family code.
        </p>
      </section>

      <section aria-labelledby="s-console">
        <h2 id="s-console">Raw SysEx console</h2>
        <div className="prefills">
          {READ_COMMANDS.map((c) => (
            <button key={c.id} title={c.note} onClick={() => prefill(c.body)}>
              {c.label}
            </button>
          ))}
        </div>
        <textarea
          className="mono"
          rows={3}
          placeholder="F0 52 00 6E 60 29 F7"
          value={hexText}
          onChange={(e) => setHexText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) askSend();
          }}
          aria-label="Hex bytes to send"
        />
        <div className={`preview verdict-${preview?.verdict ?? 'none'}`}>
          {!hexText.trim() ? 'Type hex bytes or click a prefill.' : parsed.ok ? `${preview!.verdict.toUpperCase()}: ${preview!.reason}` : parsed.error}
        </div>
        <div className="row">
          <button className="primary" disabled={!session || !parsed.ok || locked} onClick={askSend}>
            Send… <span className="muted small">(Ctrl+Enter)</span>
          </button>
          <button disabled={!session || deviceId === null || locked} onClick={runListing}>
            List flash files
          </button>
          {listing && <button onClick={() => listing.abort()}>Stop</button>}
          {progress && <span className="muted small">{progress}</span>}
          <label className="research">
            <input type="checkbox" checked={researchMode} onChange={(e) => setResearchMode(e.target.checked)} /> Research mode: allow unknown Zoom commands
          </label>
        </div>
        {researchMode && (
          <p className="warn-text">
            Research mode is ON. Unknown Zoom commands can write, delete or install data. Known dangers stay blocked: firmware mode, factory reset, bank delete (64 47), patch writes, file ops, undocumented one-byte commands.
          </p>
        )}
      </section>

      <section aria-labelledby="s-log" className="log-section">
        <div className="row spread">
          <h2 id="s-log">Log</h2>
          <div className="row">
            <button onClick={exportLog} disabled={log.entries.length === 0}>
              Export log
            </button>
            <button onClick={log.clear}>Clear</button>
          </div>
        </div>
        <LogView entries={log.entries} />
      </section>
      </details>

      {pending && <ConfirmDialog bytes={pending.bytes} cls={pending.cls} researchMode={researchMode} onConfirm={doSend} onCancel={() => setPending(null)} />}
    </main>
  );
}

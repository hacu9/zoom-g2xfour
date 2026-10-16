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
import { DEFAULT_ZOOM_ID, zoomSysex } from './midi/zoom';
import { downloadBlob, downloadText, exportText } from './log/log';
import { backupAll, duplicateGroups, toSyx } from './midi/backup';
import { effectById } from './catalog/g2four';
import { isZoomSysex, zoomBody } from './midi/zoom';
import { useLog } from './log/useLog';
import { ConfirmDialog } from './probe/ConfirmDialog';
import { LogView } from './probe/LogView';
import { PatchEditor } from './editor/PatchEditor';
import { RecipePanel } from './editor/RecipePanel';
import { RestorePanel, type SyxEntry } from './editor/RestorePanel';
import type { WritePolicy } from './midi/writes';

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
  const logAdd = log.add;
  const panelLog = useCallback(
    (level: 'info' | 'warn' | 'error', text: string, notes?: string[]) => logAdd(level, text, undefined, notes),
    [logAdd],
  );
  // Writable = "Empty" in the backup, or Empty again after a restore, or written by this app.
  const ownSlots = useRef(new Set<number>());
  const onSlotWritten = useCallback((slot: number, name: string) => {
    setScratchSlots((cur) => {
      const next = new Set(cur);
      if (name === 'Empty' || ownSlots.current.has(slot)) next.add(slot);
      else next.delete(slot);
      return next;
    });
  }, []);
  const onRecipeWritten = useCallback((slot: number) => {
    ownSlots.current.add(slot);
    setScratchSlots((cur) => new Set(cur).add(slot));
  }, []);
  const policy: WritePolicy = useMemo(
    () => ({ backupTaken: sessionBackup.length > 0, scratchSlots, currentSlot, perBank, patchCount, allowRealPatchEdits, confirmedSlot: null }),
    [sessionBackup, scratchSlots, currentSlot, perBank, patchCount, allowRealPatchEdits],
  );

  const deviceId = /^[0-7][0-9a-f]$/i.test(deviceIdText.trim()) ? parseInt(deviceIdText.trim(), 16) : null;

  // --- 1. connect -------------------------------------------------------------
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
      const { ins, outs } = refreshPorts(b);
      logAdd('info', `${mock ? 'MOCK backend' : 'Web MIDI'} ready. SysEx enabled: ${b.sysexEnabled}. ${ins.length} input(s), ${outs.length} output(s).`);
      for (const p of ins) logAdd('info', `  input  "${p.name}" (${p.manufacturer || '?'}) ${p.state} id=${p.id}`);
      for (const p of outs) logAdd('info', `  output "${p.name}" (${p.manufacturer || '?'}) ${p.state} id=${p.id}`);
      if (!autoSelect(ins) || !autoSelect(outs)) logAdd('warn', 'No port name contains "ZOOM" or "G2". Pick the ports by hand.');
    } catch (e) {
      logAdd('error', e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!backend) return;
    return backend.onChange((what) => {
      refreshPorts(backend);
      logAdd('info', `Port state: ${what}`);
    });
  }, [backend, refreshPorts, logAdd]);

  const input = useMemo(() => inputs.find((p) => p.id === inId), [inputs, inId]);
  const output = useMemo(() => outputs.find((p) => p.id === outId), [outputs, outId]);

  useEffect(() => {
    if (!input || !output) {
      setSession(null);
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
    s.open().catch((e) =>
      logAdd('error', `Cannot open the MIDI port: ${e instanceof Error ? e.message : String(e)}. Close Handy Guitar Lab or any DAW that holds it.`),
    );
    setSession(s);
    return () => s.close();
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

  // --- 3. identity ------------------------------------------------------------
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

  // --- 4. console -------------------------------------------------------------
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
    logAdd('info', 'File listing started (60 25 / 60 26 / 60 27).');
    try {
      const r = await listFiles(session, deviceId, { signal: ctl.signal });
      logAdd('info', `File listing done: ${r.entries.length} entr${r.entries.length === 1 ? 'y' : 'ies'}. Stop: ${r.stopReason}.`, undefined, r.entries.map((e) => e.name));
    } catch (e) {
      logAdd('error', `File listing failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setListing(null);
    }
  };

  const runBackup = async () => {
    if (!session || deviceId === null) return;
    const ctl = new AbortController();
    setListing(ctl);
    try {
      // 44 → 43 <count 2> <length 2> <? 2> <per bank 2> (zoom-explorer README)
      const info = await session.request(zoomSysex(deviceId, [0x44, 0x00, 0x00, 0x00, 0x00]), 'backup: bank info', (d) => isZoomSysex(d) && d[4] === 0x43, 1500);
      if (!info) throw new Error('No reply to 44 (bank info)');
      const b = zoomBody(info);
      const count = b[1] | (b[2] << 7);
      const perBank = b[7] | (b[8] << 7);
      logAdd('info', `Backup started: ${count} patches, ${perBank} per bank (46 00 00 read).`);
      const dumps = await backupAll(session, deviceId, { count, perBank, signal: ctl.signal, onProgress: (n) => setProgress(`${n} / ${count}`) });
      const ok = dumps.filter((d) => d.patch);
      const dups = duplicateGroups(dumps);
      if (!ctl.signal.aborted && ok.length === count) {
        setPerBank(perBank);
        setPatchCount(count);
        setSessionBackup(dumps.filter((d) => d.sysex).map((d) => ({ slot: d.slot, name: d.patch?.name ?? d.patch?.shortName ?? '?', msg: Array.from(d.sysex!) })));
        setScratchSlots(new Set(dumps.filter((d) => d.patch?.name?.trimEnd() === 'Empty').map((d) => d.slot)));
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(`g2xfour-backup-${stamp}.syx`, new Blob([toSyx(dumps)], { type: 'application/octet-stream' }));
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
              name: d.patch?.name ?? d.patch?.shortName ?? null,
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
        `Backup done: ${ok.length}/${dumps.length} patches decoded${ctl.signal.aborted ? ' (stopped by user)' : ''}. ${dups.length} duplicate group(s). Saved g2xfour-backup-${stamp}.syx. Click "Save summary" for the .json.`,
        undefined,
        dups.map((g) => `same bytes: slots ${g.join(', ')} — "${dumps[g[0]].patch?.name ?? '?'}"`),
      );
    } catch (e) {
      logAdd('error', `Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setListing(null);
      setProgress('');
    }
  };

  // --- 5. export --------------------------------------------------------------
  const exportLog = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(
      `zoom-probe-${stamp}.txt`,
      exportText(log.all.current, {
        tool: 'zoompedal probe 0.1.0',
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

  const hexBox = useRef<HTMLTextAreaElement>(null);

  return (
    <main>
      <header>
        <h1>Zoom G2X FOUR — SysEx probe</h1>
        <p className="muted">Phase 1. Read-only. Every protocol detail here is a hypothesis from the B2/G1 FOUR, not G2X FOUR fact.</p>
        {backend?.kind === 'mock' && <div className="banner">MOCK PEDAL — the replies are invented. They prove the UI works, not the protocol.</div>}
      </header>

      <section aria-labelledby="s-connect">
        <h2 id="s-connect">1 · Connect</h2>
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
        <h2 id="s-id">2 · Identify</h2>
        <div className="row">
          <button className="primary" disabled={!session || busy || !!listing} onClick={sendIdentity}>
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
          <button onClick={() => setDeviceIdText(byteHex(DEFAULT_ZOOM_ID))}>6E (B2 FOUR default)</button>
          <button disabled={identity?.zoomDeviceId == null} onClick={() => identity?.zoomDeviceId != null && setDeviceIdText(byteHex(identity.zoomDeviceId))}>
            Use family code
          </button>
        </div>
        <p className="muted small">
          zoom-zt2 issue #46 shows the MS-60B+ and MS-70CDR+ also answer to ID 6E, so 6E may be a shared address, not a model ID. If 6E gets no reply, try the family code.
        </p>
      </section>

      <section aria-labelledby="s-console">
        <h2 id="s-console">3 · Raw SysEx console</h2>
        <div className="prefills">
          {READ_COMMANDS.map((c) => (
            <button key={c.id} title={c.note} onClick={() => prefill(c.body)}>
              {c.label}
            </button>
          ))}
        </div>
        <textarea
          ref={hexBox}
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
          <button className="primary" disabled={!session || !parsed.ok || !!listing} onClick={askSend}>
            Send… <span className="muted small">(Ctrl+Enter)</span>
          </button>
          <button disabled={!session || deviceId === null || !!listing} onClick={runListing}>
            List flash files
          </button>
          <button disabled={!session || deviceId === null || !!listing} onClick={runBackup}>
            Back up all patches
          </button>
          {summary && <button onClick={() => downloadText(summary.name, summary.text)}>Save summary (.json)</button>}
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

      <section aria-labelledby="s-edit">
        <h2 id="s-edit">4 · Edit current patch</h2>
        <p className="muted small">
          Writes need a backup from this session. Free to write: {scratchSlots.size} slot(s) ("Empty", or written here). Pedal is on slot {currentSlot ?? '?'}
          {currentSlot !== null && (scratchSlots.has(currentSlot) ? ' (Empty — free to edit)' : ' (real patch)')}.
        </p>
        <label className="warn-text">
          <input type="checkbox" checked={allowRealPatchEdits} onChange={(e) => setAllowRealPatchEdits(e.target.checked)} /> Edit real patches — auto-save is ON, so every
          change is kept when you leave the patch
        </label>
        {deviceId !== null && <PatchEditor session={session} deviceId={deviceId} policy={policy} log={panelLog} />}
      </section>

      <section aria-labelledby="s-restore">
        <h2 id="s-restore">5 · Restore from backup</h2>
        {deviceId !== null && <RestorePanel session={session} deviceId={deviceId} policy={policy} sessionBackup={sessionBackup} onSlotWritten={onSlotWritten} log={panelLog} />}
      </section>

      <section aria-labelledby="s-recipe">
        <h2 id="s-recipe">6 · Tone recipe → patch</h2>
        {deviceId !== null && <RecipePanel session={session} deviceId={deviceId} policy={policy} onSlotWritten={onRecipeWritten} log={panelLog} />}
      </section>

      <section aria-labelledby="s-log" className="log-section">
        <div className="row spread">
          <h2 id="s-log">7 · Log</h2>
          <div className="row">
            <button onClick={exportLog} disabled={log.entries.length === 0}>
              Export log
            </button>
            <button onClick={log.clear}>Clear</button>
          </div>
        </div>
        <LogView entries={log.entries} />
      </section>

      {pending && <ConfirmDialog bytes={pending.bytes} cls={pending.cls} researchMode={researchMode} onConfirm={doSend} onCancel={() => setPending(null)} />}
    </main>
  );
}

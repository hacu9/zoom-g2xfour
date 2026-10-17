import { useMemo, useState } from 'react';
import { patchBytesFromSlotDump, patchFingerprint, readSlot } from '../midi/backup';
import { assertStillEmpty } from '../recipe/apply';
import { parsePTCF } from '../midi/ptcf';
import type { ProbeSession } from '../midi/session';
import { retargetSlotDump, type WritePolicy } from '../midi/writes';
import { isZoomSysex } from '../midi/zoom';

export interface SyxEntry {
  slot: number;
  name: string;
  msg: number[];
}

/** Split a .syx into 45 slot dumps. */
export function parseSyx(bytes: Uint8Array, perBank: number): SyxEntry[] {
  const out: SyxEntry[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i;
    else if (bytes[i] === 0xf7 && start >= 0) {
      const msg = Array.from(bytes.slice(start, i + 1));
      start = -1;
      if (!isZoomSysex(msg) || msg[4] !== 0x45) continue;
      const slot = (msg[7] | (msg[8] << 7)) * perBank + (msg[9] | (msg[10] << 7));
      const p = parsePTCF(patchBytesFromSlotDump(msg) ?? []);
      out.push({ slot, name: p?.name ?? p?.shortName ?? '?', msg });
    }
  }
  return out;
}

interface Props {
  session: ProbeSession | null;
  deviceId: number;
  policy: WritePolicy;
  sessionBackup: SyxEntry[];
  /** A slot's content changed; the app keeps its list of writable slots current. */
  onSlotWritten(slot: number, name: string): void;
  log(level: 'info' | 'warn' | 'error', text: string, notes?: string[]): void;
}

export function RestorePanel({ session, deviceId, policy, sessionBackup, onSlotWritten, log }: Props) {
  // Keep the file bytes; slot numbers depend on perBank, which the backup may change.
  const [file, setFile] = useState<Uint8Array | null>(null);
  const loaded = useMemo(() => (file ? parseSyx(file, policy.perBank) : null), [file, policy.perBank]);
  const entries = loaded ?? sessionBackup;
  const [source, setSource] = useState(0);
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const src = entries[source];
  const targetSlot = target === '' ? src?.slot : Number(target);
  const isScratch = targetSlot !== undefined && policy.scratchSlots.has(targetSlot);
  const confirmed = isScratch || confirm.trim() === String(targetSlot);
  // Restoring the slot the pedal is on can be undone by auto-save when the patch changes.
  const isCurrent = targetSlot !== undefined && targetSlot === policy.currentSlot;
  const sorted = useMemo(() => entries.map((e, i) => ({ e, i })), [entries]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const list = parseSyx(bytes, policy.perBank);
    setFile(bytes);
    setSource(0);
    log('info', `Loaded ${f.name}: ${list.length} patch dump(s).`);
  };

  const restore = async () => {
    if (!session || !src || targetSlot === undefined) return;
    setBusy(true);
    try {
      // An "Empty" target needs no typed confirmation, so check that it still is.
      if (isScratch) await assertStillEmpty(session, deviceId, targetSlot, policy.perBank);
      const msg = retargetSlotDump(src.msg, targetSlot, policy.perBank);
      const w: WritePolicy = { ...policy, confirmedSlot: isScratch ? null : targetSlot };
      await session.request(msg, `restore "${src.name}" → slot ${targetSlot}`, (d) => isZoomSysex(d) && d[4] === 0x00, 3000, w);
      const back = await readSlot(session, deviceId, targetSlot, policy.perBank);
      const want = patchFingerprint(patchBytesFromSlotDump(src.msg) ?? []);
      onSlotWritten(targetSlot, back.patch?.name?.trimEnd() ?? '?');
      if (back.fingerprint === want) log('info', `Restore verified: slot ${targetSlot} now holds "${back.patch?.name}"; the patch data matches byte for byte.`);
      else log('warn', `Restore sent, but slot ${targetSlot} reads back as "${back.patch?.name}" and the bytes differ.`);
    } catch (e) {
      log('error', `Restore failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setConfirm('');
    }
  };

  return (
    <div>
      <div className="row">
        <label>
          Backup file <input type="file" accept=".syx" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="muted small">{loaded ? `${loaded.length} from file` : `${sessionBackup.length} from this session's backup`}</span>
      </div>
      {entries.length > 0 && (
        <div className="row">
          <label>
            Patch{' '}
            <select value={source} onChange={(e) => setSource(Number(e.target.value))}>
              {sorted.map(({ e, i }) => (
                <option key={i} value={i}>
                  {e.slot}: {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            → slot <input className="short mono" placeholder={String(src?.slot ?? '')} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          {!isScratch && targetSlot !== undefined && (
            <label className="warn-text">
              Slot {targetSlot} holds a real patch. Type {targetSlot} to overwrite:{' '}
              <input className="short mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          )}
          {isCurrent && <span className="warn-text">The pedal is on slot {targetSlot}. Switch to another patch first, or auto-save may undo the restore.</span>}
          <button className="danger" disabled={!session || busy || !confirmed || isCurrent || !policy.backupTaken} onClick={restore}>
            Restore
          </button>
        </div>
      )}
    </div>
  );
}

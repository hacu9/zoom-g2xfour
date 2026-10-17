import { useMemo, useState } from 'react';
import { restoreEntry } from '../midi/restore';
import type { ProbeSession } from '../midi/session';
import { parseSyx, type SyxEntry } from '../midi/syx';
import type { WritePolicy } from '../midi/writes';
import { slotLabel } from '../midi/patchSelect';

interface Props {
  session: ProbeSession | null;
  deviceId: number;
  policy: WritePolicy;
  sessionBackup: SyxEntry[];
  /** A slot's content changed; the app keeps its list of writable slots current. */
  onSlotWritten(slot: number, name: string): void;
  /** A write runs (any panel). App-wide: the patch controls stay locked until it ends. */
  busy: boolean;
  setBusy(busy: boolean): void;
  log(level: 'info' | 'warn' | 'error', text: string, notes?: string[]): void;
}

export function RestorePanel({ session, deviceId, policy, sessionBackup, onSlotWritten, log, busy, setBusy }: Props) {
  // Keep the file bytes; slot numbers depend on perBank, which the backup may change.
  const [file, setFile] = useState<Uint8Array | null>(null);
  const loaded = useMemo(() => (file ? parseSyx(file, policy.perBank) : null), [file, policy.perBank]);
  const entries = loaded ?? sessionBackup;
  const [source, setSource] = useState(0);
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState('');

  const src = entries[source];
  const targetSlot = target === '' ? src?.slot : Number(target);
  const isScratch = targetSlot !== undefined && policy.scratchSlots.has(targetSlot);
  const confirmed = isScratch || confirm.trim() === String(targetSlot);
  // Restoring the slot the pedal is on can be undone by auto-save when the patch changes.
  const isCurrent = targetSlot !== undefined && targetSlot === policy.currentSlot;
  const options = useMemo(() => entries.map((e, i) => ({ e, i })), [entries]);

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
      const r = await restoreEntry(session, deviceId, src, targetSlot, policy, confirmed);
      onSlotWritten(targetSlot, r.name);
      if (r.verified) log('info', `Restore verified: slot ${targetSlot} now holds "${r.name}"; the patch data matches byte for byte.`);
      else log('warn', `Restore sent, but slot ${targetSlot} reads back as "${r.name}" and the bytes differ.`);
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
              {options.map(({ e, i }) => (
                <option key={i} value={i}>
                  {slotLabel(e.slot)} {e.name}
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

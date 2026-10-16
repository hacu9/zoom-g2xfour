import { useCallback, useEffect, useRef, useState } from 'react';
import { displayValue, effectById } from '../catalog/g2four';
import { categoryOf, EffectPicker } from './EffectPicker';
import { decodeRawPatch, type RawPatch } from '../midi/ptcf';
import { SafetyError, type ProbeSession } from '../midi/session';
import { paramEdit, type WritePolicy } from '../midi/writes';
import { isZoomSysex, zoomSysex } from '../midi/zoom';

interface Props {
  session: ProbeSession | null;
  deviceId: number;
  policy: WritePolicy;
  log(level: 'info' | 'warn' | 'error', text: string): void;
}

const EDITABLE_SLOTS = 6;
const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

export function PatchEditor({ session, deviceId, policy, log }: Props) {
  const [patch, setPatch] = useState<RawPatch | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Debounced slider sends read the policy at send time, not at render time.
  const policyRef = useRef(policy);
  policyRef.current = policy;
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const [picking, setPicking] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const r = await session.request(zoomSysex(deviceId, [0x64, 0x13]), 'editor: load current patch', (d) => isZoomSysex(d) && d[4] === 0x64 && d[5] === 0x12, 2000);
    setPatch(r ? decodeRawPatch(r) : null);
  }, [session, deviceId]);

  // Follow the pedal: pushed patches (64 12) and accepted edits (64 20 01).
  useEffect(() => {
    if (!session) return;
    return session.subscribe((d) => {
      if (!isZoomSysex(d)) return;
      if (d[4] === 0x64 && d[5] === 0x12) {
        const p = decodeRawPatch(d);
        if (p) setPatch(p);
      } else if (d[4] === 0x64 && d[5] === 0x20 && d[6] === 0x01 && d[7] < EDITABLE_SLOTS) {
        const [slot, param] = [d[7], d[8]];
        const value = [0, 1, 2, 3, 4].reduce((v, i) => v + d[9 + i] * 2 ** (7 * i), 0);
        setPatch((p) => {
          if (!p || !p.effects[slot]) return p;
          const effects = p.effects.map((e, i) => {
            if (i !== slot) return e;
            if (param === 0) return { ...e, on: value === 1 };
            if (param >= 2) return { ...e, params: e.params.map((v, j) => (j === param - 2 ? value : v)) };
            return e;
          });
          return { ...p, effects };
        });
      } else if (d[4] === 0x64 && d[5] === 0x26) {
        void load(); // patch changed on the pedal
      }
    });
  }, [session, load]);

  const write = (slot: number, param: number, value: number, label: string) => {
    if (!session) return;
    try {
      session.send(paramEdit(deviceId, slot, param, value), `editor: ${label}`, { write: policyRef.current });
    } catch (e) {
      log(e instanceof SafetyError ? 'warn' : 'error', e instanceof Error ? e.message : String(e));
    }
  };

  /** Sliders fire many events; send the last value after a short pause. */
  const writeSoon = (slot: number, param: number, value: number, label: string) => {
    const key = `${slot}.${param}`;
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => write(slot, param, value, label), 80));
    setPatch((p) => p && { ...p, effects: p.effects.map((e, i) => (i === slot ? { ...e, params: e.params.map((v, j) => (j === param - 2 ? value : v)) } : e)) });
  };

  const locked = policy.currentSlot === null || (!policy.scratchSlots.has(policy.currentSlot) && !policy.allowRealPatchEdits) || !policy.backupTaken;

  return (
    <div className="editor">
      <div className="row">
        <button className="primary" disabled={!session} onClick={load}>
          Load current patch
        </button>
        {patch && (
          <span>
            <strong>{patch.name ?? patch.shortName}</strong> <span className="muted small">slot {policy.currentSlot ?? '?'}</span>
          </span>
        )}
      </div>
      {locked && patch && (
        <p className="warn-text">
          Read-only view.{' '}
          {!policy.backupTaken ? 'Run a backup first.' : 'This is a real patch and auto-save is ON — tick "edit real patches" to change it.'}
        </p>
      )}
      {patch && (
        <div className="slots">
          {patch.effects.slice(0, EDITABLE_SLOTS).map((e, slot) => {
            const fx = effectById(e.id);
            return (
              <fieldset key={slot} className="slot" disabled={locked}>
                <legend>
                  <label>
                    <input type="checkbox" checked={e.on && e.id !== 0} disabled={e.id === 0} onChange={(ev) => write(slot, 0, ev.target.checked ? 1 : 0, `slot ${slot} ${ev.target.checked ? 'on' : 'off'}`)} /> Slot {slot + 1}
                  </label>
                </legend>
                <button className="effect-btn" onClick={() => setPicking(slot)} title="Search and choose an effect">
                  <span>{e.id === 0 ? '— empty —' : (fx?.name ?? `unknown ${e.id.toString(16)}`)}</span>
                  {e.id !== 0 && <span className="muted small">{categoryOf(e.id)}</span>}
                  <span aria-hidden>🔍</span>
                </button>
                {fx?.parameters.map((p, i) =>
                  p.name.startsWith('Hidden') ? null : (
                    <label key={i} className="param">
                      <span>{p.name}</span>
                      {p.values.length <= 12 ? (
                        <select value={e.params[i] ?? 0} onChange={(ev) => write(slot, i + 2, Number(ev.target.value), `slot ${slot} ${p.name}=${decodeEntities(p.values[Number(ev.target.value)] ?? '')}`)}>
                          {p.values.map((v, j) => (
                            <option key={j} value={j}>
                              {decodeEntities(v)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input type="range" min={0} max={p.values.length - 1} value={e.params[i] ?? 0} onChange={(ev) => writeSoon(slot, i + 2, Number(ev.target.value), `slot ${slot} ${p.name}`)} />
                          <output>{decodeEntities(displayValue(p, e.params[i] ?? 0))}</output>
                        </>
                      )}
                    </label>
                  ),
                )}
              </fieldset>
            );
          })}
        </div>
      )}
      {picking !== null && patch && (
        <EffectPicker
          slot={picking}
          currentId={patch.effects[picking]?.id ?? 0}
          onPick={(id) => write(picking, 1, id, `slot ${picking} effect → ${effectById(id)?.name ?? 'empty'}`)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

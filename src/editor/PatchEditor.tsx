import { useCallback, useEffect, useRef, useState } from 'react';
import { displayValue, effectById } from '../catalog/g2four';
import { catClass, categoryOf, EffectPicker } from './EffectPicker';
import { Knob } from '../ui/Knob';
import { decodeRawPatch, type RawPatch } from '../midi/ptcf';
import { SafetyError, type ProbeSession } from '../midi/session';
import { paramEdit, type WritePolicy } from '../midi/writes';
import { isZoomSysex, zoomSysex } from '../midi/zoom';

interface Props {
  session: ProbeSession | null;
  deviceId: number;
  policy: WritePolicy;
  log(level: 'info' | 'warn' | 'error', text: string): void;
  /** The patch in the edit buffer changed (load, pedal push or edit). */
  onPatch?(patch: RawPatch | null): void;
}

const EDITABLE_SLOTS = 6;
const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

export function PatchEditor({ session, deviceId, policy, log, onPatch }: Props) {
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
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  useEffect(() => onPatchRef.current?.(patch), [patch]);

  const load = useCallback(async () => {
    if (!session) {
      setPatch(null);
      return;
    }
    const r = await session.request(zoomSysex(deviceId, [0x64, 0x13]), 'editor: load current patch', (d) => isZoomSysex(d) && d[4] === 0x64 && d[5] === 0x12, 2000);
    setPatch(r ? decodeRawPatch(r) : null);
  }, [session, deviceId]);

  // Show the current patch as soon as the pedal is there.
  useEffect(() => {
    void load();
  }, [load]);

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
  const effects = patch?.effects.slice(0, EDITABLE_SLOTS) ?? [];

  return (
    <div className="editor">
      {!patch && session && (
        <div className="row">
          <button className="primary" disabled={!session} onClick={load}>
            Load current patch
          </button>
        </div>
      )}
      {locked && patch && (
        <p className="lock-note">
          🔒 {!policy.backupTaken ? 'Read-only until the backup finishes.' : 'Real patch, read-only. Auto-save is ON: unlock "Edit real patches" to change it.'}
        </p>
      )}
      {patch && (
        <div className="board" aria-label="Effect chain, input to output">
          <span className="jack" aria-hidden>
            IN
          </span>
          {effects.map((e, slot) => {
            const fx = effectById(e.id);
            const cat = e.id === 0 ? 'Empty' : categoryOf(e.id);
            const on = e.on && e.id !== 0;
            const visible = fx?.parameters.map((p, i) => ({ p, i })).filter(({ p }) => !p.name.startsWith('Hidden')) ?? [];
            return (
              <div key={slot} className={`stomp ${catClass(cat)} ${on ? 'on' : 'off'}`} aria-label={`Slot ${slot + 1}`}>
                <div className="stomp-top">
                  <span className={`led ${on ? 'lit' : ''}`} aria-label={on ? 'on' : 'off'} />
                  <span className="stomp-cat">{cat}</span>
                </div>
                <button className="stomp-name" disabled={locked} onClick={() => setPicking(slot)} title="Change the effect: search by name, type or knob">
                  {e.id === 0 ? '+ add effect' : (fx?.name ?? `unknown ${e.id.toString(16)}`)}
                </button>
                <div className="knobs">
                  {visible.map(({ p, i }) =>
                    p.values.length === 2 ? (
                      <label key={i} className="toggle">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={(e.params[i] ?? 0) === 1}
                          onChange={(ev) => write(slot, i + 2, ev.target.checked ? 1 : 0, `slot ${slot} ${p.name}=${decodeEntities(p.values[ev.target.checked ? 1 : 0])}`)}
                        />
                        <span className="toggle-track" aria-hidden />
                        <span className="knob-value">{decodeEntities(displayValue(p, e.params[i] ?? 0))}</span>
                        <span className="knob-label">{p.name}</span>
                      </label>
                    ) : (
                      <Knob
                        key={i}
                        label={p.name}
                        value={e.params[i] ?? 0}
                        count={p.values.length}
                        display={decodeEntities(displayValue(p, e.params[i] ?? 0))}
                        disabled={locked}
                        onChange={(v) => writeSoon(slot, i + 2, v, `slot ${slot} ${p.name}=${decodeEntities(p.values[v] ?? '')}`)}
                      />
                    ),
                  )}
                </div>
                <button
                  className="footswitch"
                  disabled={locked || e.id === 0}
                  aria-pressed={on}
                  onClick={() => write(slot, 0, on ? 0 : 1, `slot ${slot} ${on ? 'off' : 'on'}`)}
                  title={on ? 'Bypass this effect' : 'Turn this effect on'}
                >
                  <span className="sr-only">{on ? 'Turn off' : 'Turn on'}</span>
                </button>
              </div>
            );
          })}
          <span className="jack" aria-hidden>
            OUT
          </span>
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

import { useMemo, useState } from 'react';
import { applyPlan } from '../recipe/apply';
import rain from '../recipe/recipes/rain-rob-scallon.json';
import { translate } from '../recipe/translate';
import type { ToneRecipe } from '../recipe/types';
import type { ProbeSession } from '../midi/session';
import type { WritePolicy } from '../midi/writes';

interface Props {
  session: ProbeSession | null;
  deviceId: number;
  policy: WritePolicy;
  onSlotWritten(slot: number, name: string): void;
  log(level: 'info' | 'warn' | 'error', text: string, notes?: string[]): void;
}

export function RecipePanel({ session, deviceId, policy, onSlotWritten, log }: Props) {
  const [text, setText] = useState(JSON.stringify(rain, null, 2));
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const scratch = useMemo(() => [...policy.scratchSlots].sort((a, b) => a - b), [policy.scratchSlots]);
  const targetSlot = target === '' ? scratch[0] : Number(target);

  const plan = useMemo(() => {
    try {
      return { ok: true as const, plan: translate(JSON.parse(text) as ToneRecipe) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);

  const apply = async () => {
    if (!session || !plan.ok || targetSlot === undefined) return;
    setBusy(true);
    try {
      const r = await applyPlan(session, deviceId, plan.plan, targetSlot, policy.currentSlot ?? targetSlot, policy);
      onSlotWritten(targetSlot, plan.plan.name);
      log(r.ok ? 'info' : 'warn', `Recipe "${plan.plan.name}" → slot ${targetSlot}: ${r.ok ? 'written and verified' : 'written with mismatches'}.`, [...r.steps, ...r.mismatches]);
    } catch (e) {
      log('error', `Recipe failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <textarea className="mono" rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-label="Tone recipe JSON" />
      {plan.ok ? (
        <div className="plan">
          <strong>{plan.plan.name}</strong>
          <ol>
            {plan.plan.effects.map((e, i) => (
              <li key={i}>
                {e.name} <span className="muted small">({e.role})</span> — {e.params.map((p) => `${p.name} ${p.display}`).join(', ')}
              </li>
            ))}
          </ol>
          {plan.plan.warnings.map((w, i) => (
            <p key={i} className="warn-text">
              {w}
            </p>
          ))}
        </div>
      ) : (
        <p className="warn-text">JSON error: {plan.error}</p>
      )}
      <div className="row">
        <label>
          Write to Empty slot{' '}
          <select value={targetSlot ?? ''} onChange={(e) => setTarget(e.target.value)} disabled={scratch.length === 0}>
            {scratch.map((s) => (
              <option key={s} value={s}>
                {s} (bank {Math.floor(s / policy.perBank)}, program {s % policy.perBank})
              </option>
            ))}
          </select>
        </label>
        <button className="danger" disabled={!session || busy || !plan.ok || !policy.backupTaken || scratch.length === 0} onClick={apply}>
          {busy ? 'Writing…' : 'Write patch'}
        </button>
        {!policy.backupTaken && <span className="muted small">Back up first.</span>}
      </div>
    </div>
  );
}

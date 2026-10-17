import { useEffect, useRef } from 'react';
import { toHex } from '../midi/hex';
import type { Classification } from '../midi/safety';

interface Props {
  bytes: number[];
  cls: Classification;
  researchMode: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ bytes, cls, researchMode, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const refused = cls.verdict === 'blocked' || (cls.needsResearchMode && !researchMode);

  return (
    <dialog ref={ref} className={`confirm verdict-${cls.verdict}`} onCancel={onCancel} aria-labelledby="confirm-title">
      <h3 id="confirm-title">
        {cls.verdict === 'read' && 'Send a known read-only command?'}
        {cls.verdict === 'unknown' && '⚠ Send an UNVERIFIED message?'}
        {cls.verdict === 'blocked' && '⛔ Blocked'}
      </h3>
      <pre className="confirm-bytes">{toHex(bytes)}</pre>
      <p>{cls.reason}</p>
      {cls.verdict !== 'read' && !refused && (
        <p className="warn-text">
          Custom hex can change or erase data on the pedal. Only the commands in docs/g2x-four-protocol.md are mapped. Save a
          backup (.syx) before you continue.
        </p>
      )}
      {cls.needsResearchMode && !researchMode && <p className="warn-text">Turn on research mode to send unknown Zoom commands.</p>}
      <div className="row end">
        <button onClick={onCancel} autoFocus>
          Cancel
        </button>
        {!refused && (
          <button className={cls.verdict === 'read' ? 'primary' : 'danger'} onClick={onConfirm}>
            {cls.verdict === 'read' ? 'Send' : 'Send anyway'}
          </button>
        )}
      </div>
    </dialog>
  );
}

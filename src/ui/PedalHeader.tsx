interface Props {
  status: 'no-midi' | 'need-permission' | 'no-pedal' | 'connected' | 'mock';
  slot: number | null;
  name: string | null;
  tempo: number | null;
  backup: { state: 'none' | 'running' | 'done' | 'failed'; progress?: string };
  canSwitch: boolean;
  editReal: boolean;
  onConnect(): void;
  onStep(delta: number): void;
  onEditReal(on: boolean): void;
}

const STATUS_TEXT: Record<Props['status'], string> = {
  'no-midi': 'NO WEB MIDI',
  'need-permission': 'PRESS CONNECT',
  'no-pedal': 'PLUG IN PEDAL',
  connected: 'CONNECTED',
  mock: 'MOCK PEDAL',
};

/** The pedal's "screen": patch number and name, tempo, status lights and patch up/down. */
export function PedalHeader({ status, slot, name, tempo, backup, canSwitch, editReal, onConnect, onStep, onEditReal }: Props) {
  const live = status === 'connected' || status === 'mock';
  return (
    <header className="pedal">
      <div className="brand">
        <span className="brand-name">G2X FOUR</span>
        <span className="brand-sub">patch desk</span>
      </div>

      <button className="patch-step" disabled={!canSwitch} onClick={() => onStep(-1)} aria-label="Previous patch" title="Previous patch">
        ◀
      </button>
      <div className="lcd">
        <div className="lcd-slot">{live && slot !== null ? String(slot).padStart(3, '0') : '---'}</div>
        <div className="lcd-main">
          <div className="lcd-name" aria-live="polite">{live ? (name ?? '…') : STATUS_TEXT[status]}</div>
          <div className="lcd-sub">
            {live && tempo !== null && (
              <>
                {/* blinks on the beat, like the pedal's tap-tempo LED */}
                <span className="led lit tempo-led" style={{ animationDuration: `${60 / tempo}s` }} aria-hidden /> ♩ = {tempo}
              </>
            )} {live && backup.state === 'running' ? `· BACKUP ${backup.progress ?? ''}` : ''}
          </div>
        </div>
      </div>
      <button className="patch-step" disabled={!canSwitch} onClick={() => onStep(1)} aria-label="Next patch" title="Next patch">
        ▶
      </button>

      <div className="lights">
        <span className="light">
          <span className={`led ${live ? 'lit green' : ''}`} /> MIDI
        </span>
        <span className="light" title="Writes need a backup from this session">
          <span className={`led ${backup.state === 'done' ? 'lit green' : backup.state === 'running' ? 'lit amber blink' : backup.state === 'failed' ? 'lit' : ''}`} /> BACKUP
        </span>
        <label className="light lock" title="Auto-save is ON: every change to a real patch is kept when you leave it">
          <input type="checkbox" checked={editReal} onChange={(e) => onEditReal(e.target.checked)} />
          <span className={`led ${editReal ? 'lit' : ''}`} /> EDIT REAL PATCHES
        </label>
      </div>

      {(status === 'need-permission' || status === 'no-midi') && (
        <button className="primary connect" disabled={status === 'no-midi'} onClick={onConnect}>
          Connect
        </button>
      )}
    </header>
  );
}

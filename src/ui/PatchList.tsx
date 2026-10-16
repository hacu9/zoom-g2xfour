import { useMemo, useState } from 'react';

interface Props {
  names: ReadonlyMap<number, string>;
  count: number;
  current: number | null;
  /** Slots written by this app or by recipes — shown first. */
  mine: ReadonlySet<number>;
  disabled: boolean;
  onSelect(slot: number): void;
}

/** Every patch on the pedal, from the session backup. Click one to load it. */
export function PatchList({ names, count, current, mine, disabled, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Array.from({ length: count }, (_, slot) => ({ slot, name: names.get(slot) ?? '?' })).filter(
      ({ slot, name }) =>
        (showEmpty || name.trimEnd() !== 'Empty' || slot === current) && (!q || name.toLowerCase().includes(q) || String(slot) === q),
    );
  }, [names, count, current, query, showEmpty]);

  if (count === 0) return <p className="muted small">The patch list appears when the backup finishes.</p>;
  return (
    <div className="patch-list">
      <div className="row">
        <input className="search" type="search" placeholder="Find a patch: name or number" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a patch" />
        <label className="small">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show Empty slots
        </label>
      </div>
      <ul className="patches">
        {rows.map(({ slot, name }) => (
          <li key={slot}>
            <button
              className={`patch ${slot === current ? 'current' : ''} ${mine.has(slot) ? 'mine' : ''}`}
              disabled={disabled}
              aria-current={slot === current}
              onClick={() => onSelect(slot)}
            >
              <span className="patch-num">{String(slot).padStart(3, '0')}</span>
              <span className="patch-name">{name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

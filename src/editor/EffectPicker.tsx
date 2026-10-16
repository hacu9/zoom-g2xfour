import { useEffect, useMemo, useRef, useState } from 'react';
import { allEffects } from '../catalog/g2four';

/** First byte of the effect ID = category (catalog grouping, zoom-explorer). */
export const CATEGORIES: Record<number, string> = {
  0x01: 'Dynamics',
  0x02: 'Filter / EQ',
  0x03: 'Drive',
  0x04: 'Amp',
  0x06: 'Modulation',
  0x07: 'SFX',
  0x08: 'Delay',
  0x09: 'Reverb',
  0x0b: 'Pedal',
};

export const categoryOf = (id: number) => CATEGORIES[Math.floor(id / 0x1000000)] ?? 'Other';
/** CSS class that gives an effect type its stompbox colour (styles.css). */
export const catClass = (category: string) => `cat-${category.replace(/[^a-z]/gi, '').toLowerCase()}`;

interface Item {
  id: number;
  name: string;
  category: string;
  knobs: string;
}

/** Only effects with parameter data — the ones the editor can show knobs for. */
function items(): Item[] {
  return allEffects()
    .filter((e) => e.effect.parameters.length > 0)
    .map((e) => ({
      id: e.id,
      name: e.effect.name,
      category: categoryOf(e.id),
      knobs: e.effect.parameters.filter((p) => !p.name.startsWith('Hidden')).map((p) => p.name).join(' · '),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Match every word of the query against name, category or knob names. */
export function matches(item: Item, query: string): boolean {
  const hay = `${item.name} ${item.category} ${item.knobs}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

interface Props {
  slot: number;
  currentId: number;
  onPick(id: number): void;
  onClose(): void;
}

export function EffectPicker({ slot, currentId, onPick, onClose }: Props) {
  const all = useMemo(items, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => all.filter((i) => (!category || i.category === category) && matches(i, query)), [all, query, category]);
  // Choices: "empty" first, then the matches.
  const choices = useMemo(() => [{ id: 0, name: '— empty slot —', category: '', knobs: '' }, ...shown], [shown]);

  useEffect(() => dialog.current?.showModal(), []);
  useEffect(() => setActive(choices.length > 1 ? 1 : 0), [query, category, choices.length]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (id: number) => {
    onPick(id);
    onClose();
  };

  return (
    <dialog ref={dialog} className="picker" onCancel={onClose} onClose={onClose} aria-label={`Choose effect for slot ${slot + 1}`}>
      <div className="row spread">
        <h3>Slot {slot + 1}: choose an effect</h3>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      <input
        autoFocus
        className="search"
        placeholder="Search: name, type or knob (e.g. delay, plate, chorus rate)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, choices.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && choices[active]) {
            e.preventDefault();
            pick(choices[active].id);
          }
        }}
        aria-controls="picker-list"
        aria-activedescendant={`picker-${active}`}
      />
      <div className="chips">
        <button className={category === null ? 'chip on' : 'chip'} onClick={() => setCategory(null)}>
          All
        </button>
        {Object.values(CATEGORIES).map((c) => (
          <button key={c} className={category === c ? 'chip on' : 'chip'} onClick={() => setCategory(category === c ? null : c)}>
            <span className={`swatch ${catClass(c)}`} aria-hidden /> {c}
          </button>
        ))}
      </div>
      <ul id="picker-list" ref={list} role="listbox" className="picker-list">
        {choices.map((c, i) => (
          <li
            key={c.id}
            id={`picker-${i}`}
            data-i={i}
            role="option"
            aria-selected={i === active}
            className={`${i === active ? 'active' : ''} ${c.id === currentId ? 'current' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(c.id)}
          >
            <span className="name">
              <span className={`swatch ${catClass(c.category || 'Empty')}`} aria-hidden /> {c.name}
            </span>
            {c.category && <span className="cat">{c.category}</span>}
            {c.knobs && <span className="knobs">{c.knobs}</span>}
          </li>
        ))}
        {shown.length === 0 && <li className="muted">No effect matches “{query}”.</li>}
      </ul>
      <p className="muted small">
        {shown.length} of {all.length} effects. Enter picks, ↑↓ move, Esc closes. The pedal keeps the change (auto-save) when you leave the patch.
      </p>
    </dialog>
  );
}

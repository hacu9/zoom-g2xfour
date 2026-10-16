import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  label: string;
  /** Index into the value list. */
  value: number;
  count: number;
  display: string;
  disabled?: boolean;
  onChange(index: number): void;
}

const SWEEP = 270; // degrees, like a real pot: 7 o'clock to 5 o'clock
const DRAG_PX = 160; // drag distance for the full range

/** A rotary pot. Drag up/down, scroll, or use the arrow keys. */
export function Knob({ label, value, count, display, disabled, onChange }: Props) {
  const max = Math.max(1, count - 1);
  const drag = useRef<{ y: number; start: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(0, Math.round(v)));
  const set = (v: number) => {
    const next = clamp(v);
    if (next !== value) onChange(next);
  };
  const angle = -SWEEP / 2 + (SWEEP * value) / max;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    set(drag.current.start + ((drag.current.y - e.clientY) / DRAG_PX) * max);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  // Scroll turns the knob only while it has focus, so the page still scrolls.
  // React's wheel listener is passive; a native one can stop the page scroll.
  const el = useRef<HTMLDivElement>(null);
  const setRef = useRef(set);
  setRef.current = set;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const node = el.current;
    if (!node || disabled) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      if (document.activeElement !== node) return;
      e.preventDefault();
      setRef.current(valueRef.current + (e.deltaY < 0 ? 1 : -1));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [disabled]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const page = Math.max(1, Math.round(max / 10));
    const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: page, PageDown: -page };
    if (e.key in step) set(value + step[e.key]);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(max);
    else return;
    e.preventDefault();
  };

  return (
    <div className="knob-wrap">
      <div
        ref={el}
        className="knob"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        title={`${label}: ${display} — drag, scroll or use the arrow keys`}
      >
        <svg viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="17" className="knob-skirt" />
          <circle cx="20" cy="20" r="13" className="knob-cap" />
          <line x1="20" y1="20" x2="20" y2="8" className="knob-pointer" transform={`rotate(${angle} 20 20)`} />
        </svg>
      </div>
      <span className="knob-value">{display}</span>
      <span className="knob-label">{label}</span>
    </div>
  );
}

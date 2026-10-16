import { useEffect, useRef, useState } from 'react';
import { toAscii, toHex } from '../midi/hex';
import type { Direction, LogEntry } from '../log/log';

const DIRS: Direction[] = ['in', 'out', 'info', 'warn', 'error'];

export function LogView({ entries }: { entries: LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [show, setShow] = useState<Record<Direction, boolean>>({ in: true, out: true, info: true, warn: true, error: true });

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [entries, follow]);

  const visible = entries.filter((e) => show[e.dir]);

  return (
    <>
      <div className="row log-filters">
        {DIRS.map((d) => (
          <label key={d} className={`chip dir-${d}`}>
            <input type="checkbox" checked={show[d]} onChange={(ev) => setShow({ ...show, [d]: ev.target.checked })} /> {d}
          </label>
        ))}
        <label className="chip">
          <input type="checkbox" checked={follow} onChange={(ev) => setFollow(ev.target.checked)} /> follow
        </label>
      </div>
      <div className="log" ref={box} role="log" aria-live="polite">
        {visible.length === 0 && <div className="muted">No messages yet.</div>}
        {visible.map((e) => (
          <div key={e.seq} className={`log-line dir-${e.dir}`}>
            <span className="ts" title={e.wall.toISOString()}>
              {e.wall.toLocaleTimeString(undefined, { hour12: false })}.{String(e.wall.getMilliseconds()).padStart(3, '0')}
            </span>
            <span className="tag">{e.dir.toUpperCase()}</span>
            <div className="body">
              {e.bytes ? (
                <>
                  <div className="hex">{toHex(e.bytes)}</div>
                  <div className="ascii">{toAscii(e.bytes)}</div>
                  {e.text && <div className="note">{e.text}</div>}
                </>
              ) : (
                <div className="text">{e.text}</div>
              )}
              {e.notes?.map((n, i) => (
                <div key={i} className="note">
                  {n}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

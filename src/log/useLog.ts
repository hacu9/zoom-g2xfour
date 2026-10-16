import { useCallback, useRef, useState } from 'react';
import type { Direction, LogEntry } from './log';

const UI_LIMIT = 5000;

export function useLog() {
  const all = useRef<LogEntry[]>([]);
  const start = useRef(performance.now());
  const seq = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const add = useCallback((dir: Direction, text: string, bytes?: ArrayLike<number>, notes?: string[]) => {
    const entry: LogEntry = {
      seq: ++seq.current,
      wall: new Date(),
      rel: performance.now() - start.current,
      dir,
      text,
      bytes: bytes ? Array.from(bytes) : undefined,
      notes,
    };
    // The export keeps every entry; the screen keeps the last UI_LIMIT.
    all.current.push(entry);
    setEntries((prev) => (prev.length >= UI_LIMIT ? [...prev.slice(-UI_LIMIT + 1), entry] : [...prev, entry]));
  }, []);

  const clear = useCallback(() => {
    all.current = [];
    setEntries([]);
  }, []);

  return { entries, all, add, clear };
}

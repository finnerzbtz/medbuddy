import { useEffect, useRef } from 'react';

const THOUGHT_DURATION = 60_000;

/** Count only visible, uninterrupted reading time. Background tabs never catch up. */
export function useThoughtRotation(id: string, active: boolean, advance: () => void) {
  const current = useRef(id);
  const remaining = useRef(THOUGHT_DURATION);
  useEffect(() => {
    if (current.current !== id) {
      current.current = id;
      remaining.current = THOUGHT_DURATION;
    }
    if (!active) return;
    const started = performance.now();
    const timer = window.setTimeout(advance, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [id, active, advance]);
}

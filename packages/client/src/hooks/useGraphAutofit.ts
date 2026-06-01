import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';

/**
 * Re-runs fitView when the container resizes (orientation change, panel collapse).
 * Call this from inside an xyflow <ReactFlow> child (so useReactFlow has a provider).
 */
export function useGraphAutofit(containerRef: RefObject<HTMLElement | null>): void {
  const rf = useReactFlow();
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      // small debounce via rAF
      requestAnimationFrame(() => rf.fitView({ duration: 200 }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef, rf]);
}

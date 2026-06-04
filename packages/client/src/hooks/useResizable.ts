import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Resizable panel via mouse-drag on a handle element.
 *
 * Returns:
 *   size        — current size in px
 *   handleProps — spread onto the drag-handle <div> (provides onMouseDown)
 */
export function useResizable(
  storageKey: string,
  defaultSize: number,
  min = 80,
  max = 800,
  direction: 'horizontal' | 'vertical' = 'horizontal',
) {
  const stored = (() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v) {
        const n = Number(v);
        if (!isNaN(n) && n >= min && n <= max) return n;
      }
    } catch {}
    return defaultSize;
  })();

  const [size, setSize] = useState(stored);
  const sizeRef = useRef(stored);

  // Keep sizeRef in sync so onMouseDown closure always gets the latest size
  useEffect(() => { sizeRef.current = size; }, [size]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const startSize = sizeRef.current;

    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Create handlers in the closure so handleUp can remove the EXACT
    // same handleMove reference — no React re-render can invalidate them.
    const handleMove = (ev: MouseEvent) => {
      const delta = direction === 'horizontal'
        ? ev.clientX - startPos
        : ev.clientY - startPos;
      const next = Math.min(max, Math.max(min, startSize + delta));
      setSize(next);
    };

    const handleUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      // Persist to localStorage after drag ends
      setSize(curr => {
        try { localStorage.setItem(storageKey, String(curr)); } catch {}
        return curr;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [direction, min, max, storageKey]);

  const handleProps = {
    onMouseDown,
    style: {
      flexShrink: 0,
      width: direction === 'horizontal' ? '5px' : '100%',
      height: direction === 'vertical' ? '5px' : '100%',
      cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
      background: 'transparent',
      zIndex: 10,
      transition: 'background 0.15s',
    } as React.CSSProperties,
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).style.background = 'var(--accent)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
    },
  };

  return { size, handleProps };
}

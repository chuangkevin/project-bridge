import { useRef, useState } from 'react';

/**
 * Resizable panel using Pointer Events + setPointerCapture.
 *
 * setPointerCapture is the correct API for drag interactions:
 * - The element receives ALL pointer events even when the pointer
 *   moves outside it or the window
 * - pointerup fires reliably when the user releases (no missed mouseups)
 * - No window.addEventListener needed — no stale-closure or
 *   React re-render reference issues
 *
 * Returns:
 *   size        — current size in px
 *   handleProps — spread onto the drag-handle <div>
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
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(stored);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    e.currentTarget.style.background = 'var(--accent)';
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const pos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = pos - startPos.current;
    const next = Math.min(max, Math.max(min, startSize.current + delta));
    setSize(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.background = 'transparent';
    setSize(curr => {
      try { localStorage.setItem(storageKey, String(curr)); } catch {}
      return curr;
    });
  };

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    style: {
      flexShrink: 0,
      width: direction === 'horizontal' ? '5px' : '100%',
      height: direction === 'vertical' ? '5px' : '100%',
      cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
      background: 'transparent',
      zIndex: 10,
      transition: 'background 0.1s',
      touchAction: 'none', // required for pointer events on touch devices
    } as React.CSSProperties,
    onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) e.currentTarget.style.background = 'rgba(124,92,191,0.5)';
    },
    onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) e.currentTarget.style.background = 'transparent';
    },
  };

  return { size, handleProps };
}

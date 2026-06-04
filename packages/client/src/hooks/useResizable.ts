import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Resizable panel via mouse-drag on a handle element.
 *
 * @param storageKey  localStorage key for persistence
 * @param defaultSize Initial size in px
 * @param min         Minimum size in px
 * @param max         Maximum size in px
 * @param direction   'horizontal' (left-right, default) or 'vertical'
 *
 * Returns:
 *   size       — current size in px
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

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = direction === 'horizontal'
      ? e.clientX - startPos.current
      : e.clientY - startPos.current;
    const next = Math.min(max, Math.max(min, startSize.current + delta));
    setSize(next);
  }, [direction, min, max]);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setSize(current => {
      try { localStorage.setItem(storageKey, String(current)); } catch {}
      return current;
    });
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [storageKey, onMouseMove]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [direction, size, onMouseMove, onMouseUp]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const handleProps = {
    onMouseDown,
    style: {
      flexShrink: 0,
      width: direction === 'horizontal' ? '4px' : '100%',
      height: direction === 'vertical' ? '4px' : '100%',
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

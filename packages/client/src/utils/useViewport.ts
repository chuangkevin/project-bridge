import { useEffect, useState } from 'react';

export type LayoutMode = 'desktop' | 'compact' | 'mobile';

const COMPACT_BREAKPOINT = 1280;
const MOBILE_BREAKPOINT = 768;

function modeOf(width: number): LayoutMode {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < COMPACT_BREAKPOINT) return 'compact';
  return 'desktop';
}

/** Tracks viewport width and derives a layout mode. SSR-safe (defaults to desktop). */
export function useViewport(): { width: number; mode: LayoutMode } {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? COMPACT_BREAKPOINT : window.innerWidth,
  );

  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { width, mode: modeOf(width) };
}

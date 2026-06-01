import { useEffect } from 'react';

/**
 * Sets `--vh` CSS var to 1% of the current visualViewport height (or window.innerHeight as fallback).
 * Use `height: calc(var(--vh, 1vh) * 100)` instead of `100vh` for components that should respect the
 * keyboard on mobile (iOS Safari otherwise reports the WRONG 100vh).
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
    };
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.visualViewport?.removeEventListener('resize', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}

# Plan 16 — RWD / Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** All workspace surfaces render usable on mobile (≤768px) and tablet (≤1024px). Breakpoints already exist from Plan 8 (workspace shell) + Plan 11 (design stage). This plan fixes the remaining rough edges: composer that doesn't disappear behind the iOS keyboard, transcript that doesn't lose scroll position when keyboard opens, settings page that stacks on narrow screens, architect graph that re-fits when the viewport changes.

**Architecture:** Mostly CSS additions + a couple of small JS tweaks (`useViewportHeight` hook for proper 100vh on mobile; ResizeObserver to refit xyflow on orientation change). No new deps.

**Tech Stack:** No new deps. Reuses everything from Plans 8-15.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4 (UI) — adds the "mobile usable" gate.

**Scope boundary (out of plan):** NO native app feel (PWA install prompts, splash screens). NO offline mode. NO touch-specific gestures (swipe to delete). Mobile here means "comfortable to read + tap"; full mobile-first redesign is M2.

---

## File Structure

```
packages/client/src/
  hooks/useViewportHeight.ts        ← NEW: sets --vh CSS var for true viewport height
  hooks/useGraphAutofit.ts          ← NEW: trigger xyflow fitView on resize
  pages/workspace/architect/PageGraphViewer.tsx ← MODIFY: use useGraphAutofit
  main.tsx                          ← MODIFY: call useViewportHeight at App level or set on document
  App.tsx                           ← alternative wiring spot
  styles/
    workspace.css                   ← MODIFY: more 768px tweaks (composer sticky, topbar collapse)
    chat.css                        ← MODIFY: composer mobile (max-height, fixed bottom on focus)
    settings.css                    ← MODIFY: tab scroll on narrow screens
    design.css                      ← MODIFY: header wraps; preview/source stacked
    architect.css                   ← MODIFY: graph height adapts to chat panel collapse
```

---

## Task 1: useViewportHeight + useGraphAutofit hooks

**Files:**
- Create `packages/client/src/hooks/useViewportHeight.ts`
- Create `packages/client/src/hooks/useGraphAutofit.ts`

### useViewportHeight.ts

```typescript
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
```

Call it once in `App.tsx`:

```tsx
import { useViewportHeight } from './hooks/useViewportHeight';
// inside App:
useViewportHeight();
```

### useGraphAutofit.ts

```typescript
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
```

For this to work inside `PageGraphViewer`, the hook must be called within a `<ReactFlow>` subtree. Simplest: wrap the existing `<ReactFlow>` children in a small inner component that calls the hook. See Task 2.

- [ ] Implement both
- [ ] Wire useViewportHeight in App.tsx
- [ ] Commit: `feat(client): add useViewportHeight + useGraphAutofit hooks (Plan 16 Task 1)`

---

## Task 2: PageGraphViewer autofit integration

**Files:**
- Modify `packages/client/src/pages/workspace/architect/PageGraphViewer.tsx`

Inject autofit inside the ReactFlow context:

```tsx
import { ReactFlow, Background, Controls, MiniMap, MarkerType, useReactFlow } from '@xyflow/react';
import { useRef } from 'react';
import { useGraphAutofit } from '../../../hooks/useGraphAutofit';

function AutoFit({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  useGraphAutofit(containerRef);
  return null;
}

// inside the main component:
const containerRef = useRef<HTMLDivElement>(null);
return (
  <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
    <ReactFlow nodes={rfNodes} edges={rfEdges} fitView proOptions={{ hideAttribution: true }}>
      <AutoFit containerRef={containerRef} />
      <Background ... />
      <Controls />
      <MiniMap ... />
    </ReactFlow>
  </div>
);
```

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): autofit page graph on container resize (Plan 16 Task 2)`

---

## Task 3: CSS — workspace + chat + settings + design + architect mobile

**Files:**
- Modify `packages/client/src/styles/workspace.css`
- Modify `packages/client/src/styles/chat.css`
- Modify `packages/client/src/styles/settings.css`
- Modify `packages/client/src/styles/design.css`
- Modify `packages/client/src/styles/architect.css`

### workspace.css — add at end

```css
/* Mobile: use --vh for true viewport height so iOS keyboard doesn't crop */
@media (max-width: 768px) {
  .workspace {
    height: calc(var(--vh, 1vh) * 100);
  }
  .workspace__top {
    padding: 0 var(--space-3);
    gap: var(--space-2);
    font-size: 13px;
  }
  .workspace__top > div:first-of-type {  /* project name */
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .mode-tabs { display: none; }
  /* Mode tabs hidden — they appear in a dropdown via Plan 16 Task 4 */
}
```

### chat.css — add at end

```css
@media (max-width: 768px) {
  .chat__transcript {
    padding: var(--space-3) var(--space-3);
  }
  .bubble { max-width: 100%; }
  .composer {
    padding: var(--space-2) var(--space-3);
    /* Sticky bottom so the keyboard doesn't push it off-screen on iOS */
    position: sticky;
    bottom: 0;
    background: var(--bg-card);
    z-index: 5;
  }
  .composer__textarea {
    font-size: 16px;  /* prevents iOS auto-zoom on focus */
  }
  .slash-popup {
    left: var(--space-3);
    right: var(--space-3);
  }
}
```

### settings.css — add at end

```css
@media (max-width: 768px) {
  .settings__header { padding: var(--space-3) var(--space-4); }
  .settings__tabs {
    padding: 0 var(--space-3);
    overflow-x: auto;
    flex-wrap: nowrap;
  }
  .settings__tab { flex-shrink: 0; }
  .settings__body { padding: var(--space-4) var(--space-3); }
  .setting-row__field { flex-direction: column; align-items: stretch; }
  .setting-row__field button { width: 100%; }
}
```

### design.css — add at end

```css
@media (max-width: 768px) {
  .design__header {
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }
  .design__header button { font-size: 11px; padding: 4px 8px; }
  .design__split {
    flex-direction: column;
  }
  .design__preview, .design__source {
    flex-basis: 50%;
    min-height: 200px;
  }
  .design__chat {
    min-height: 180px;
    flex-basis: 35%;
  }
  .design__source { border-left: none; border-top: 1px solid var(--border-subtle); }
}
```

### architect.css — add at end

```css
@media (max-width: 768px) {
  .architect__graph {
    flex-basis: 55%;
    min-height: 240px;
  }
  .architect__chat {
    flex-basis: 45%;
    min-height: 180px;
  }
  .architect__graph-label {
    font-size: 10px;
    padding: 1px 6px;
  }
}
```

- [ ] Implement all CSS modifications
- [ ] Build passes (CSS only)
- [ ] Commit: `feat(client): mobile RWD tweaks for chat / settings / design / architect / workspace (Plan 16 Task 3)`

---

## Task 4: Mobile-only mode switcher dropdown

**Files:**
- Modify `packages/client/src/pages/workspace/TopBar.tsx`
- Modify `packages/client/src/styles/workspace.css`

On mobile (≤768px) the `.mode-tabs` is hidden. Replace with a small `<select>` that's only shown on mobile.

In TopBar, near the mode tabs, add:

```tsx
<select
  className="mode-tabs-mobile"
  value={mode}
  onChange={(e) => setMode(e.target.value as Mode)}
  aria-label="模式"
>
  {(['consult', 'architect', 'design'] as Mode[]).map((m) => (
    <option key={m} value={m}>{MODE_LABELS[m]}</option>
  ))}
</select>
```

CSS in workspace.css:

```css
.mode-tabs-mobile {
  display: none;
}
@media (max-width: 768px) {
  .mode-tabs-mobile {
    display: inline-block;
    background: var(--bg-input);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    padding: 4px 8px;
  }
}
```

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): mobile mode switcher dropdown (Plan 16 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests unchanged (~217)
- Manual smoke (describe only):
  - Resize browser to 375×667 (iPhone SE) → top bar collapses; hamburger opens drawer; mode dropdown shows
  - Tap chat textarea on phone simulator → keyboard opens, composer stays visible (sticky bottom + visualViewport)
  - Architect graph fits to new size on orientation change
  - Settings page tabs scroll horizontally if overflow
  - Design mode stacks preview / source / chat vertically
- Push

---

## Acceptance Criteria

- [ ] `--vh` set on root element and updates on resize / orientationchange
- [ ] Chat composer sticky on mobile, 16px font (no iOS zoom)
- [ ] Mode tabs hidden on mobile, `<select>` shown instead
- [ ] Settings tabs horizontally scrollable when overflow
- [ ] Design stage stacks correctly on narrow viewports
- [ ] Architect graph re-fits on viewport resize via ResizeObserver
- [ ] All builds + push clean
- [ ] No server test regression

---

## Risks / Notes

1. **`visualViewport` API**: ~95% browser support including iOS 13+ and modern Android. Old browsers fall back to `window.innerHeight` which is "good enough" outside iOS.
2. **`ResizeObserver`**: 96%+ support — safe to use without polyfill.
3. **iOS Safari font-size 16px rule**: any `<input>` / `<textarea>` smaller than 16px triggers auto-zoom on focus. Composer textarea sets 16px on ≤768px specifically.
4. **xyflow controls on mobile**: `<Controls />` includes +/- buttons that may be tiny on phones. M2 can swap to a touch-optimized variant. M1 acceptable.
5. **Top bar settings link visible**: on mobile we hide mode tabs but keep settings link + logout button. If toolbar overflows, the settings link can become an icon. Defer to M2 if it actually overflows in testing.
6. **`useViewportHeight` placement**: must be inside a component that mounts once and lives the whole session. App.tsx is right. Don't put it in Workspace because Workspace unmounts on navigation.

---

**Plan end. 5 Tasks. Mobile usable.**

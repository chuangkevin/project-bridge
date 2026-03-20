import { useState, useEffect, useRef, useCallback } from 'react';
import SelectionOverlay from './SelectionOverlay';
import StylePropertyPanel from './StylePropertyPanel';

interface Patch {
  bridgeId: string;
  property: string;
  value: string;
}

interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  projectId: string;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  active: boolean;
  onPatchesChange?: (patches: Patch[]) => void;
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  origRect: ElementRect;
  accDeltaX: number;
  accDeltaY: number;
}

interface ResizeState {
  active: boolean;
  handle: string;
  startX: number;
  startY: number;
  origRect: ElementRect;
}

export default function VisualEditor({ projectId, iframeRef, active, onPatchesChange }: Props) {
  const [selectedBridgeId, setSelectedBridgeId] = useState<string | null>(null);
  const [selectedRect, setSelectedRect] = useState<ElementRect | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>({});
  const [iframeOffset, setIframeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const patchesRef = useRef<Patch[]>([]);
  const dragRef = useRef<DragState>({ active: false, startX: 0, startY: 0, origRect: { x: 0, y: 0, width: 0, height: 0 }, accDeltaX: 0, accDeltaY: 0 });
  const resizeRef = useRef<ResizeState>({ active: false, handle: '', startX: 0, startY: 0, origRect: { x: 0, y: 0, width: 0, height: 0 } });
  const rafRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helper: post message to iframe ──
  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, [iframeRef]);

  // ── Helper: compute iframe offset ──
  const computeIframeOffset = useCallback((): { x: number; y: number } => {
    if (!iframeRef.current) return { x: 0, y: 0 };
    const r = iframeRef.current.getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, [iframeRef]);

  // ── Debounced save patches to server ──
  const savePatches = useCallback((patches: Patch[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}/prototype/patches`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches }),
        });
      } catch (err) {
        console.error('Failed to save patches:', err);
      }
    }, 500);
  }, [projectId]);

  // ── Collect patch (upsert by bridgeId+property) ──
  const collectPatch = useCallback((bridgeId: string, property: string, value: string) => {
    const current = patchesRef.current;
    const idx = current.findIndex(p => p.bridgeId === bridgeId && p.property === property);
    if (idx >= 0) {
      current[idx] = { bridgeId, property, value };
    } else {
      current.push({ bridgeId, property, value });
    }
    patchesRef.current = [...current];
    onPatchesChange?.(patchesRef.current);
    savePatches(patchesRef.current);
  }, [onPatchesChange, savePatches]);

  // ── Deselect helper ──
  const deselect = useCallback(() => {
    setSelectedBridgeId(null);
    setSelectedRect(null);
    setSelectedStyles({});
  }, []);

  // ── Load patches on mount ──
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/prototype/patches`);
        if (!res.ok) return;
        const data = await res.json();
        const patches: Patch[] = data.patches || [];
        if (cancelled) return;
        patchesRef.current = patches;
        onPatchesChange?.(patches);
        if (patches.length > 0) {
          postToIframe({ type: 'apply-patches', patches });
        }
      } catch {
        // ignore – patches may not exist yet
      }
    })();
    return () => { cancelled = true; };
  }, [active, projectId, postToIframe, onPatchesChange]);

  // ── Listen for element-selected messages from iframe ──
  useEffect(() => {
    if (!active) return;

    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'element-selected') return;
      const { bridgeId, rect, computedStyles } = e.data as {
        bridgeId: string;
        rect: ElementRect;
        computedStyles: Record<string, string>;
      };
      const offset = computeIframeOffset();
      setIframeOffset(offset);
      setSelectedBridgeId(bridgeId);
      setSelectedRect(rect);
      setSelectedStyles(computedStyles || {});
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [active, computeIframeOffset]);

  // ── Escape key deselects ──
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') deselect();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, deselect]);

  // ── Click outside deselects ──
  useEffect(() => {
    if (!active || !selectedBridgeId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't deselect if clicking on overlay, panel, or iframe
      if (
        target.closest('[data-testid="style-property-panel"]') ||
        target.closest('[data-visual-overlay]') ||
        target.tagName === 'IFRAME'
      ) {
        return;
      }
      deselect();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [active, selectedBridgeId, deselect]);

  // ── Update iframe offset on scroll / resize ──
  useEffect(() => {
    if (!active) return;
    const update = () => {
      setIframeOffset(computeIframeOffset());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, computeIframeOffset]);

  // ── Drag handling ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!selectedBridgeId || !selectedRect) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origRect: { ...selectedRect },
      accDeltaX: 0,
      accDeltaY: 0,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      dragRef.current.accDeltaX = dx;
      dragRef.current.accDeltaY = dy;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const orig = dragRef.current.origRect;
        setSelectedRect({
          x: orig.x + dx,
          y: orig.y + dy,
          width: orig.width,
          height: orig.height,
        });
        postToIframe({
          type: 'apply-position-change',
          bridgeId: selectedBridgeId,
          deltaX: dx,
          deltaY: dy,
        });
      });
    };

    const onMouseUp = () => {
      if (dragRef.current.active && selectedBridgeId) {
        const { accDeltaX, accDeltaY } = dragRef.current;
        if (accDeltaX !== 0 || accDeltaY !== 0) {
          collectPatch(selectedBridgeId, 'transform', `translate(${accDeltaX}px, ${accDeltaY}px)`);
        }
      }
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [selectedBridgeId, selectedRect, postToIframe, collectPatch]);

  // ── Resize handling ──
  const handleResizeStart = useCallback((handle: string, e: React.MouseEvent) => {
    if (!selectedBridgeId || !selectedRect) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origRect: { ...selectedRect },
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      const h = resizeRef.current.handle;
      const orig = resizeRef.current.origRect;

      let newX = orig.x;
      let newY = orig.y;
      let newW = orig.width;
      let newH = orig.height;

      // Horizontal
      if (h.includes('e')) newW = Math.max(20, orig.width + dx);
      if (h.includes('w')) { newW = Math.max(20, orig.width - dx); newX = orig.x + (orig.width - newW); }
      // Vertical
      if (h.includes('s')) newH = Math.max(20, orig.height + dy);
      if (h.includes('n')) { newH = Math.max(20, orig.height - dy); newY = orig.y + (orig.height - newH); }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setSelectedRect({ x: newX, y: newY, width: newW, height: newH });
        postToIframe({
          type: 'apply-resize',
          bridgeId: selectedBridgeId,
          width: newW,
          height: newH,
        });
      });
    };

    const onMouseUp = () => {
      if (resizeRef.current.active && selectedBridgeId && selectedRect) {
        // Read final rect from state indirectly — compute from refs
        const orig = resizeRef.current.origRect;
        const h = resizeRef.current.handle;
        const dx = 0; // final position already applied via rAF
        const dy = 0;
        // Use the last rAF values. We need to request the element rect from iframe.
        postToIframe({ type: 'get-element-rect', bridgeId: selectedBridgeId });
      }
      resizeRef.current.active = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [selectedBridgeId, selectedRect, postToIframe]);

  // ── Listen for element-rect response (after resize) to finalize patch ──
  useEffect(() => {
    if (!active) return;
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'element-rect') return;
      const { bridgeId, rect } = e.data as { bridgeId: string; rect: ElementRect };
      if (bridgeId === selectedBridgeId) {
        setSelectedRect(rect);
        collectPatch(bridgeId, 'width', `${rect.width}px`);
        collectPatch(bridgeId, 'height', `${rect.height}px`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [active, selectedBridgeId, collectPatch]);

  // ── Style change from property panel ──
  const handleStyleChange = useCallback((property: string, value: string) => {
    if (!selectedBridgeId) return;
    setSelectedStyles(prev => ({ ...prev, [property]: value }));
    postToIframe({
      type: 'apply-style-change',
      bridgeId: selectedBridgeId,
      property,
      value,
    });
    collectPatch(selectedBridgeId, property, value);
  }, [selectedBridgeId, postToIframe, collectPatch]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Deselect when toggled off ──
  useEffect(() => {
    if (!active) deselect();
  }, [active, deselect]);

  if (!active) return null;

  // Panel position: right of the selected element, clamped to viewport
  const panelPosition = selectedRect
    ? {
        x: Math.min(
          selectedRect.x + iframeOffset.x + selectedRect.width + 12,
          window.innerWidth - 300
        ),
        y: Math.max(10, selectedRect.y + iframeOffset.y),
      }
    : { x: 0, y: 0 };

  return (
    <div data-visual-overlay="" data-testid="visual-editor">
      {selectedBridgeId && selectedRect && (
        <>
          <SelectionOverlay
            rect={selectedRect}
            iframeOffset={iframeOffset}
            onDragStart={handleDragStart}
            onResizeStart={handleResizeStart}
          />
          <StylePropertyPanel
            bridgeId={selectedBridgeId}
            styles={selectedStyles}
            onStyleChange={handleStyleChange}
            onClose={deselect}
            position={panelPosition}
          />
        </>
      )}
    </div>
  );
}

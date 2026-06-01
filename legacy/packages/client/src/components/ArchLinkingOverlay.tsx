import { useState, useEffect, useRef, useCallback } from 'react';
import { BRIDGE_SCRIPT } from '../utils/bridgeScript';
import type { ArchComponent } from '../stores/useArchStore';

interface Props {
  projectId: string;
  pageName: string;
  pageNames: string[];
  components: ArchComponent[];
  onUpdate: (components: ArchComponent[]) => void;
  onClose: () => void;
}

interface PendingLink {
  bridgeId: string;
  name: string;
  existingNav: string | null;
}

export default function ArchLinkingOverlay({ projectId, pageName, pageNames, components, onUpdate, onClose }: Props) {
  const [protoHtml, setProtoHtml] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch prototype HTML
  useEffect(() => {
    fetch(`/api/projects/${projectId}/prototype`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.html) setProtoHtml(d.html); })
      .catch(() => {});
  }, [projectId]);

  // Navigate iframe to target page after load
  const handleIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'set-annotation-mode', enabled: true }, '*');
    win.postMessage({ type: 'navigate', page: pageName }, '*');
    win.postMessage({ type: 'navigate-page', page: pageName }, '*');

    // Highlight elements that already have navigation
    components.filter(c => c.navigationTo).forEach(c => {
      const bridgeId = c.id.replace('comp-', '');
      win.postMessage({ type: 'highlight-element', bridgeId }, '*');
    });
  }, [pageName, components]);

  // Listen for element clicks from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'element-click') return;
      const { bridgeId, textContent, tagName } = e.data as { bridgeId: string; textContent: string; tagName: string };
      const existing = components.find(c => c.id === `comp-${bridgeId}`);
      setPending({
        bridgeId,
        name: textContent?.trim() || tagName?.toLowerCase() || bridgeId,
        existingNav: existing?.navigationTo || null,
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [components]);

  const handleAssign = (targetPage: string | null) => {
    if (!pending) return;
    const compId = `comp-${pending.bridgeId}`;
    const existing = components.find(c => c.id === compId);
    let updated: ArchComponent[];
    if (targetPage === null) {
      // Remove connection
      updated = components.filter(c => c.id !== compId);
    } else if (existing) {
      updated = components.map(c => c.id === compId ? { ...c, navigationTo: targetPage } : c);
    } else {
      updated = [...components, {
        id: compId,
        name: pending.name,
        type: 'button' as const,
        description: '',
        constraints: {},
        navigationTo: targetPage,
        states: [],
      }];
    }
    onUpdate(updated);
    setPending(null);
  };

  const linkedComponents = components.filter(c => c.navigationTo);
  const otherPages = pageNames.filter(p => p !== pageName);

  // Inject bridge script
  const injectedHtml = protoHtml
    ? protoHtml.includes('</body>')
      ? protoHtml.replace('</body>', BRIDGE_SCRIPT + '</body>')
      : protoHtml + BRIDGE_SCRIPT
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '90vw', height: '90vh', background: '#fff', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#faf8ff' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{pageName}</span>
            <span style={{ fontSize: 13, color: '#64748b', marginLeft: 12 }}>點選畫面元件 → 選擇要跳到哪一頁</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}
          >✕</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: prototype */}
          <div style={{ flex: 1, position: 'relative', background: '#f1f5f9', overflow: 'hidden' }}>
            {injectedHtml ? (
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-same-origin"
                srcDoc={injectedHtml}
                title="prototype"
                onLoad={handleIframeLoad}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>載入中...</div>
            )}

            {/* Page picker popup after element click */}
            {pending && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '16px 20px', minWidth: 220, zIndex: 10 }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  「{pending.name.substring(0, 30)}」
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>點擊後跳到哪一頁？</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {otherPages.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleAssign(p)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: pending.existingNav === p ? 700 : 400,
                        background: pending.existingNav === p ? '#EBE3F2' : '#f8f6fb',
                        color: pending.existingNav === p ? '#8E6FA7' : '#1e293b',
                      }}
                    >
                      {pending.existingNav === p ? '✓ ' : ''}{p}
                    </button>
                  ))}
                  {pending.existingNav && (
                    <button
                      type="button"
                      onClick={() => handleAssign(null)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fee2e2', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                    >移除導航</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
                  >取消</button>
                </div>
              </div>
            )}
          </div>

          {/* Right: connections panel */}
          <div style={{ width: 220, borderLeft: '1px solid #e2e8f0', padding: '16px 14px', overflowY: 'auto', background: '#fafafa' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>已設定的導航</p>
            {linkedComponents.length === 0 ? (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>尚未設定。點選左側畫面中的按鈕或連結來設定。</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedComponents.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', fontSize: 12 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>{c.name}</span>
                    <span style={{ color: '#8E6FA7', fontWeight: 600, flexShrink: 0 }}>→ {c.navigationTo}</span>
                    <button
                      type="button"
                      title="移除"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}
                      onClick={() => {
                        const updated = components.filter(x => x.id !== c.id);
                        onUpdate(updated);
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

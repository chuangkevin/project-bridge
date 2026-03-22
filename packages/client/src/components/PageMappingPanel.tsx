import { useState, useEffect, useCallback } from 'react';

const API = '';

interface PageMapping {
  id: string;
  bridge_id: string;
  page_name: string;
  navigation_target: string | null;
  arch_component_id: string | null;
}

interface SelectedElement {
  bridgeId: string;
  tag: string;
  textContent: string;
  pageName: string;
}

interface Props {
  projectId: string;
  pages: string[];
  activePage: string;
  onPageClick: (page: string) => void;
  archComponents: Array<{ id: string; name: string }>;
}

export default function PageMappingPanel({ projectId, pages, activePage, onPageClick, archComponents }: Props) {
  const [mappings, setMappings] = useState<PageMapping[]>([]);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [navTarget, setNavTarget] = useState('');
  const [compId, setCompId] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch mappings
  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/page-mappings`);
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  // Listen for element selection from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'page-mapping-element-selected') {
        const el: SelectedElement = {
          bridgeId: e.data.bridgeId,
          tag: e.data.tag,
          textContent: e.data.textContent,
          pageName: e.data.pageName,
        };
        setSelectedElement(el);
        // Pre-fill with existing mapping if any
        const existing = mappings.find(m => m.bridge_id === e.data.bridgeId);
        setNavTarget(existing?.navigation_target || '');
        setCompId(existing?.arch_component_id || '');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [mappings]);

  const handleSave = async () => {
    if (!selectedElement) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/projects/${projectId}/page-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridgeId: selectedElement.bridgeId,
          pageName: selectedElement.pageName,
          navigationTarget: navTarget || null,
          archComponentId: compId || null,
        }),
      });
      if (res.ok) {
        await fetchMappings();
        // Reload iframe to reflect onclick changes
        window.postMessage({ type: 'reload-preview' }, '*');
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const getMappingCount = (page: string) =>
    mappings.filter(m => m.page_name === page && m.navigation_target).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 14 }}>
      {/* Left: Page overview */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E5E5' }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>頁面總覽</div>
        {pages.map(page => (
          <div
            key={page}
            onClick={() => onPageClick(page)}
            style={{
              padding: '8px 12px',
              marginBottom: 4,
              borderRadius: 6,
              cursor: 'pointer',
              background: page === activePage ? '#EDE9FE' : '#F9FAFB',
              color: page === activePage ? '#6D28D9' : '#374151',
              fontWeight: page === activePage ? 600 : 400,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{page}</span>
            {getMappingCount(page) > 0 && (
              <span style={{
                background: '#8B5CF6',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 600,
              }}>
                {getMappingCount(page)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Right: Element mapping settings */}
      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        {selectedElement ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 12, color: '#374151' }}>元素對應設定</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>元素</label>
              <div style={{
                padding: '6px 10px',
                background: '#F3F4F6',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 12,
              }}>
                &lt;{selectedElement.tag}&gt; {selectedElement.textContent.substring(0, 40)}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>所屬頁面</label>
              <div style={{ padding: '6px 10px', background: '#F3F4F6', borderRadius: 6, fontSize: 13 }}>
                {selectedElement.pageName || '(單頁)'}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>點擊導航到</label>
              <select
                value={navTarget}
                onChange={e => setNavTarget(e.target.value)}
                title="選擇導航目標頁面"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #D1D5DB',
                  fontSize: 13,
                  background: '#fff',
                }}
              >
                <option value="">（無導航）</option>
                {pages.filter(p => p !== selectedElement.pageName).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {archComponents.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6B7280', display: 'block', marginBottom: 4 }}>元件身份</label>
                <select
                  value={compId}
                  onChange={e => setCompId(e.target.value)}
                  title="選擇對應的架構元件"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #D1D5DB',
                    fontSize: 13,
                    background: '#fff',
                  }}
                >
                  <option value="">（未指定）</option>
                  {archComponents.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 8,
                border: 'none',
                background: saving ? '#D1D5DB' : '#8B5CF6',
                color: '#fff',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              {saving ? '儲存中...' : '儲存對應'}
            </button>
          </>
        ) : (
          <div style={{ color: '#9CA3AF', textAlign: 'center', marginTop: 40 }}>
            點選原型中的元素<br />設定頁面導航對應
          </div>
        )}

        {/* Existing mappings for current page */}
        {mappings.filter(m => m.page_name === activePage && m.navigation_target).length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid #E5E5E5', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>已設定的導航</div>
            {mappings.filter(m => m.page_name === activePage && m.navigation_target).map(m => (
              <div key={m.id} style={{
                padding: '6px 10px',
                background: '#F9FAFB',
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontFamily: 'monospace' }}>{m.bridge_id.substring(0, 20)}</span>
                <span>→ {m.navigation_target}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

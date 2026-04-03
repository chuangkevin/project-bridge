import { useState, useEffect, useCallback, useRef } from 'react';
import { authHeaders } from '../contexts/AuthContext';

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'navigation', label: '導航列' },
  { key: 'card', label: '卡片' },
  { key: 'form', label: '表單' },
  { key: 'button', label: '按鈕' },
  { key: 'hero', label: '主視覺' },
  { key: 'footer', label: '頁尾' },
  { key: 'modal', label: '彈窗' },
  { key: 'table', label: '表格' },
  { key: 'other', label: '其他' },
];

const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter(c => c.key !== 'all').map(c => [c.key, c.label])
);

interface ComponentItem {
  id: string;
  name: string;
  category: string;
  html: string;
  css: string;
  thumbnail_url?: string;
}

interface Props {
  projectId: string;
  onClose: () => void;
}

export default function ComponentPicker({ projectId, onClose }: Props) {
  const [allComponents, setAllComponents] = useState<ComponentItem[]>([]);
  const [boundIds, setBoundIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  // Fetch all components + bound ones in parallel
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [allRes, boundRes] = await Promise.all([
        fetch('/api/components', { headers: authHeaders() }),
        fetch(`/api/projects/${projectId}/components`, { headers: authHeaders() }),
      ]);
      if (allRes.ok) {
        const allData = await allRes.json();
        setAllComponents(Array.isArray(allData) ? allData : allData.items || allData.data || []);
      }
      if (boundRes.ok) {
        const boundData = await boundRes.json();
        const items: ComponentItem[] = Array.isArray(boundData) ? boundData : boundData.items || boundData.data || [];
        setBoundIds(new Set(items.map(c => c.id)));
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleBind = async (componentId: string) => {
    const isBound = boundIds.has(componentId);
    setToggling(prev => new Set(prev).add(componentId));
    try {
      if (isBound) {
        const res = await fetch(`/api/projects/${projectId}/components/${componentId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (res.ok) {
          setBoundIds(prev => {
            const next = new Set(prev);
            next.delete(componentId);
            return next;
          });
        }
      } else {
        const res = await fetch(`/api/projects/${projectId}/components/bind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ componentId }),
        });
        if (res.ok) {
          setBoundIds(prev => new Set(prev).add(componentId));
        }
      }
    } catch {
      // fail silently
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(componentId);
        return next;
      });
    }
  };

  // Filter
  const filtered = allComponents.filter(c => {
    if (activeCategory !== 'all' && c.category !== activeCategory) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    }
    return true;
  });

  // Group by category
  const grouped: Record<string, ComponentItem[]> = {};
  for (const c of filtered) {
    const cat = c.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>綁定元件</h2>
          <button type="button" style={styles.closeBtn} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category filter */}
        <div style={styles.categoryBar}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              style={{
                ...styles.categoryTab,
                ...(activeCategory === cat.key ? styles.categoryTabActive : {}),
              }}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={styles.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="搜尋元件..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Body */}
        <div style={styles.body}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              載入中...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              尚無元件
            </div>
          )}

          {!loading && Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={styles.group}>
              <h3 style={styles.groupLabel}>{CATEGORY_LABEL_MAP[cat] || cat}</h3>
              <div style={styles.compactGrid}>
                {items.map(comp => {
                  const isBound = boundIds.has(comp.id);
                  const isToggling = toggling.has(comp.id);
                  return (
                    <div
                      key={comp.id}
                      style={{
                        ...styles.compactCard,
                        ...(isBound ? styles.compactCardBound : {}),
                      }}
                      onClick={() => !isToggling && toggleBind(comp.id)}
                    >
                      {/* Mini thumbnail */}
                      <div style={styles.miniThumb}>
                        {comp.thumbnail_url ? (
                          <img src={comp.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : comp.html ? (
                          <iframe
                            srcDoc={`<!DOCTYPE html><html><head><style>${comp.css || ''}body{margin:0;padding:4px;font-family:sans-serif;transform:scale(0.25);transform-origin:top left;width:400%;}</style></head><body>${comp.html}</body></html>`}
                            sandbox="allow-same-origin"
                            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                            tabIndex={-1}
                          />
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M9 21V9" />
                          </svg>
                        )}
                      </div>

                      {/* Info */}
                      <div style={styles.compactInfo}>
                        <span style={styles.compactName}>{comp.name}</span>
                      </div>

                      {/* Toggle indicator */}
                      <div style={styles.toggleWrap}>
                        {isToggling ? (
                          <div style={styles.miniSpinner} />
                        ) : (
                          <div style={{
                            ...styles.toggleBox,
                            ...(isBound ? styles.toggleBoxChecked : {}),
                          }}>
                            {isBound && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            已綁定 {boundIds.size} 個元件
          </span>
          <button type="button" style={styles.doneBtn} onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  panel: {
    width: 440,
    maxWidth: '100vw',
    height: '100vh',
    backgroundColor: 'var(--bg-card)',
    borderLeft: '1px solid var(--border-primary)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--text-primary)',
    animation: 'slideInRight 0.2s ease-out',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border-primary)',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  categoryBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-primary)',
    flexShrink: 0,
  },
  categoryTab: {
    padding: '4px 10px',
    border: '1px solid var(--border-primary)',
    borderRadius: 14,
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  categoryTabActive: {
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    borderColor: '#8E6FA7',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    margin: '10px 16px',
    padding: '6px 10px',
    border: '1px solid var(--border-primary)',
    borderRadius: 6,
    backgroundColor: 'var(--bg-primary)',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 13,
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 16px',
  },
  group: {
    marginTop: 16,
    marginBottom: 8,
  },
  groupLabel: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compactGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  compactCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-primary)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  compactCardBound: {
    borderColor: '#8E6FA7',
    backgroundColor: 'rgba(142,111,167,0.06)',
  },
  miniThumb: {
    width: 40,
    height: 32,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--border)',
  },
  compactInfo: {
    flex: 1,
    minWidth: 0,
  },
  compactName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  },
  toggleWrap: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
  toggleBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    border: '2px solid var(--border-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  toggleBoxChecked: {
    backgroundColor: '#8E6FA7',
    borderColor: '#8E6FA7',
  },
  miniSpinner: {
    width: 14,
    height: 14,
    border: '2px solid var(--border-primary)',
    borderTopColor: '#8E6FA7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid var(--border-primary)',
    flexShrink: 0,
  },
  doneBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

// Reuse the same keyframe styles
if (typeof document !== 'undefined') {
  if (!document.getElementById('component-library-styles')) {
    const el = document.createElement('style');
    el.id = 'component-library-styles';
    el.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
    `;
    document.head.appendChild(el);
  }
}

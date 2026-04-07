import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeaders } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import CrawlExtractDialog from '../components/CrawlExtractDialog';

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
  tags?: string[];
  html: string;
  css: string;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

interface ComponentDetail extends ComponentItem {
  versions?: VersionEntry[];
}

interface VersionEntry {
  id: string;
  version: number;
  created_at: string;
  message?: string;
}

function parseUTC(dateStr: string): number {
  const s = dateStr.includes('T') || dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr
    : dateStr.replace(' ', 'T') + 'Z';
  return new Date(s).getTime();
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = parseUTC(dateStr);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffHr < 24) return `${diffHr} 小時前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(parseUTC(dateStr)).toLocaleDateString('zh-TW');
}

const PAGE_LIMIT = 20;

export default function ComponentLibraryPage() {
  const navigate = useNavigate();
  const [components, setComponents] = useState<ComponentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComponentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSourceTab, setActiveSourceTab] = useState<'html' | 'css'>('html');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCrawlDialog, setShowCrawlDialog] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  // Reset page when category changes
  useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  // Fetch components list
  const fetchComponents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', String(page));
      params.set('limit', String(PAGE_LIMIT));

      const res = await fetch(`/api/components?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch components');
      const data = await res.json();

      if (Array.isArray(data)) {
        setComponents(data);
        setTotalPages(1);
      } else {
        setComponents(data.items || data.data || []);
        const total = data.totalPages || data.total_pages || Math.ceil((data.total || 0) / PAGE_LIMIT) || 1;
        setTotalPages(total);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '載入元件失敗');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, debouncedSearch, page]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  // Fetch detail
  const fetchDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/components/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch component detail');
      const data = await res.json();
      setDetail(data);
      setEditing(false);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
      setEditing(false);
    }
  }, [selectedId, fetchDetail]);

  // Start editing
  const startEdit = () => {
    if (!detail) return;
    setEditName(detail.name);
    setEditCategory(detail.category);
    setEditTags((detail.tags || []).join(', '));
    setEditing(true);
  };

  // Save edit
  const saveEdit = async () => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/components/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updated = await res.json();
      setDetail(prev => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
      fetchComponents();
    } catch {
      alert('更新元件失敗');
    }
  };

  // Delete
  const confirmDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/components/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setDeleteConfirmId(null);
      setSelectedId(null);
      fetchComponents();
    } catch {
      alert('刪除元件失敗');
    }
  };

  const previewHtml = detail
    ? `<!DOCTYPE html><html><head><style>${detail.css || ''}</style></head><body style="margin:0;padding:16px;font-family:sans-serif">${detail.html || ''}</body></html>`
    : '';

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            type="button"
            style={styles.backBtn}
            onClick={() => navigate('/')}
            title="返回首頁"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 style={styles.title}>元件庫</h1>
        </div>
        <div style={styles.headerRight}>
          <ThemeToggle />
          <button type="button" style={styles.crawlBtn} onClick={() => setShowCrawlDialog(true)}>
            從網址擷取
          </button>
          <button type="button" style={styles.newBtn} onClick={() => {/* TODO: open create dialog */}}>
            + 新增元件
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Category tabs */}
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
        <div style={styles.searchBar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="搜尋元件名稱、標籤..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.spinnerWrap}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>載入元件中...</p>
          </div>
        )}

        {/* Error */}
        {error && <p style={styles.errorText}>{error}</p>}

        {/* Empty state */}
        {!loading && !error && components.length === 0 && (
          <div style={styles.emptyState}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" style={{ marginBottom: 16 }}>
              <rect x="8" y="8" width="20" height="20" rx="4" />
              <rect x="36" y="8" width="20" height="20" rx="4" />
              <rect x="8" y="36" width="20" height="20" rx="4" />
              <rect x="36" y="36" width="20" height="20" rx="4" strokeDasharray="4 4" />
              <line x1="42" y1="46" x2="50" y2="46" />
              <line x1="46" y1="42" x2="46" y2="50" />
            </svg>
            <p style={styles.emptyText}>尚無元件，從原型中擷取或從網站爬取來建立第一個元件</p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && components.length > 0 && (
          <>
            <div style={styles.grid}>
              {components.map(comp => (
                <div
                  key={comp.id}
                  style={styles.card}
                  onClick={() => setSelectedId(comp.id)}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#8E6FA7';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(142,111,167,0.15)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Thumbnail */}
                  <div style={styles.cardThumb}>
                    {comp.thumbnail_url ? (
                      <img src={comp.thumbnail_url} alt={comp.name} style={styles.cardThumbImg} />
                    ) : comp.html ? (
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><style>${comp.css || ''}body{margin:0;padding:8px;font-family:sans-serif;transform:scale(0.4);transform-origin:top left;width:250%;}</style></head><body>${comp.html}</body></html>`}
                        sandbox="allow-same-origin"
                        style={styles.cardThumbIframe}
                        tabIndex={-1}
                      />
                    ) : (
                      <div style={styles.cardThumbPlaceholder}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9h18M9 21V9" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={styles.cardInfo}>
                    <h3 style={styles.cardTitle}>{comp.name}</h3>
                    <div style={styles.cardMeta}>
                      <span style={styles.categoryBadge}>
                        {CATEGORY_LABEL_MAP[comp.category] || comp.category}
                      </span>
                      <span style={styles.cardDate}>{relativeTime(comp.updated_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={styles.pagination}>
                <button
                  type="button"
                  style={{ ...styles.pageBtn, ...(page <= 1 ? styles.pageBtnDisabled : {}) }}
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  上一頁
                </button>
                <span style={styles.pageInfo}>{page} / {totalPages}</span>
                <button
                  type="button"
                  style={{ ...styles.pageBtn, ...(page >= totalPages ? styles.pageBtnDisabled : {}) }}
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  下一頁
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Crawl Extract Dialog */}
      {showCrawlDialog && (
        <CrawlExtractDialog
          onClose={() => setShowCrawlDialog(false)}
          onSaved={() => fetchComponents()}
        />
      )}

      {/* Detail Panel (slide-in right) */}
      {selectedId && (
        <div style={styles.panelOverlay} onClick={() => setSelectedId(null)}>
          <div
            style={styles.panel}
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>{detail?.name || '載入中...'}</h2>
              <button type="button" style={styles.panelCloseBtn} onClick={() => setSelectedId(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading && (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={styles.spinner} />
              </div>
            )}

            {detail && !detailLoading && (
              <div style={styles.panelBody}>
                {/* Live preview */}
                <div style={styles.previewSection}>
                  <h3 style={styles.sectionLabel}>預覽</h3>
                  <div style={styles.previewFrame}>
                    <iframe
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      style={styles.previewIframe}
                      title="Component Preview"
                    />
                  </div>
                </div>

                {/* Source tabs */}
                <div style={styles.sourceSection}>
                  <div style={styles.sourceTabs}>
                    <button
                      type="button"
                      style={{ ...styles.sourceTab, ...(activeSourceTab === 'html' ? styles.sourceTabActive : {}) }}
                      onClick={() => setActiveSourceTab('html')}
                    >
                      HTML
                    </button>
                    <button
                      type="button"
                      style={{ ...styles.sourceTab, ...(activeSourceTab === 'css' ? styles.sourceTabActive : {}) }}
                      onClick={() => setActiveSourceTab('css')}
                    >
                      CSS
                    </button>
                  </div>
                  <pre style={styles.sourceCode}>
                    {activeSourceTab === 'html' ? (detail.html || '(empty)') : (detail.css || '(empty)')}
                  </pre>
                </div>

                {/* Edit section */}
                {editing ? (
                  <div style={styles.editSection}>
                    <h3 style={styles.sectionLabel}>編輯元件</h3>
                    <label style={styles.fieldLabel}>名稱</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={styles.fieldInput}
                    />
                    <label style={styles.fieldLabel}>分類</label>
                    <select
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      style={styles.fieldInput}
                    >
                      {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    <label style={styles.fieldLabel}>標籤 (逗號分隔)</label>
                    <input
                      type="text"
                      value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                      style={styles.fieldInput}
                      placeholder="header, responsive, dark"
                    />
                    <div style={styles.editActions}>
                      <button type="button" style={styles.cancelBtn} onClick={() => setEditing(false)}>取消</button>
                      <button type="button" style={styles.saveBtn} onClick={saveEdit}>儲存</button>
                    </div>
                  </div>
                ) : (
                  <div style={styles.editSection}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={styles.categoryBadge}>
                        {CATEGORY_LABEL_MAP[detail.category] || detail.category}
                      </span>
                      {(detail.tags || []).map(tag => (
                        <span key={tag} style={styles.tagBadge}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Version history */}
                {detail.versions && detail.versions.length > 0 && (
                  <div style={styles.versionSection}>
                    <h3 style={styles.sectionLabel}>版本紀錄</h3>
                    <div style={styles.versionList}>
                      {detail.versions.map(v => (
                        <div key={v.id} style={styles.versionItem}>
                          <span style={styles.versionNumber}>v{v.version}</span>
                          <span style={styles.versionDate}>{relativeTime(v.created_at)}</span>
                          {v.message && <span style={styles.versionMsg}>{v.message}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={styles.panelActions}>
                  {!editing && (
                    <button type="button" style={styles.editBtn} onClick={startEdit}>
                      編輯
                    </button>
                  )}
                  {deleteConfirmId === detail.id ? (
                    <div style={styles.deleteConfirm}>
                      <span style={{ fontSize: 13, color: '#dc2626' }}>確定刪除？</span>
                      <button type="button" style={styles.deleteConfirmYes} onClick={() => confirmDelete(detail.id)}>
                        確定
                      </button>
                      <button type="button" style={styles.cancelBtn} onClick={() => setDeleteConfirmId(null)}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      style={styles.deleteBtn}
                      onClick={() => setDeleteConfirmId(detail.id)}
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    backgroundColor: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-primary)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  crawlBtn: {
    padding: '8px 16px',
    border: '1px solid #8E6FA7',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#8E6FA7',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  newBtn: {
    padding: '8px 16px',
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  main: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 32px',
  },
  categoryBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 20,
  },
  categoryTab: {
    padding: '6px 14px',
    border: '1px solid var(--border-primary)',
    borderRadius: 20,
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  categoryTabActive: {
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    borderColor: '#8E6FA7',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    backgroundColor: 'var(--bg-card)',
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 14,
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
  },
  spinnerWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '64px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--border-primary)',
    borderTopColor: '#8E6FA7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    marginTop: 12,
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  errorText: {
    textAlign: 'center' as const,
    color: '#ef4444',
    fontSize: 14,
    padding: '32px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '64px 0',
  },
  emptyText: {
    color: 'var(--text-secondary)',
    fontSize: 15,
    textAlign: 'center' as const,
    maxWidth: 360,
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  card: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cardThumb: {
    height: 160,
    backgroundColor: 'var(--bg-primary)',
    borderBottom: '1px solid var(--border)',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  cardThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  cardThumbIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    pointerEvents: 'none' as const,
  },
  cardThumbPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    padding: '12px 16px',
  },
  cardTitle: {
    margin: '0 0 8px',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    backgroundColor: 'rgba(142,111,167,0.12)',
    color: '#8E6FA7',
    fontSize: 12,
    fontWeight: 500,
  },
  tagBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 500,
    border: '1px solid var(--border)',
  },
  cardDate: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 32,
  },
  pageBtn: {
    padding: '6px 14px',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  pageInfo: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },

  // Detail panel
  panelOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  panel: {
    width: 520,
    maxWidth: '100vw',
    height: '100vh',
    backgroundColor: 'var(--bg-card)',
    borderLeft: '1px solid var(--border-primary)',
    overflowY: 'auto' as const,
    animation: 'slideInRight 0.2s ease-out',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-primary)',
    position: 'sticky' as const,
    top: 0,
    backgroundColor: 'var(--bg-card)',
    zIndex: 1,
  },
  panelTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  panelCloseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  panelBody: {
    padding: '0 20px 20px',
  },
  previewSection: {
    marginTop: 16,
  },
  sectionLabel: {
    margin: '0 0 8px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  previewFrame: {
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  previewIframe: {
    width: '100%',
    height: 240,
    border: 'none',
    display: 'block',
  },
  sourceSection: {
    marginTop: 20,
  },
  sourceTabs: {
    display: 'flex',
    gap: 0,
    marginBottom: 0,
  },
  sourceTab: {
    padding: '6px 16px',
    border: '1px solid var(--border-primary)',
    borderBottom: 'none',
    borderRadius: '8px 8px 0 0',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  sourceTabActive: {
    backgroundColor: 'var(--bg-card)',
    color: '#8E6FA7',
    fontWeight: 600,
  },
  sourceCode: {
    margin: 0,
    padding: 16,
    border: '1px solid var(--border-primary)',
    borderRadius: '0 8px 8px 8px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    lineHeight: 1.6,
    overflowX: 'auto' as const,
    maxHeight: 200,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
  },
  editSection: {
    marginTop: 20,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    marginTop: 12,
  },
  fieldInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: 6,
    fontSize: 14,
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-input)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  editActions: {
    display: 'flex',
    gap: 8,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  versionSection: {
    marginTop: 20,
  },
  versionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  versionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  versionNumber: {
    fontSize: 12,
    fontWeight: 600,
    color: '#8E6FA7',
    minWidth: 32,
  },
  versionDate: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  versionMsg: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  panelActions: {
    display: 'flex',
    gap: 8,
    marginTop: 24,
    paddingTop: 16,
    borderTop: '1px solid var(--border-primary)',
  },
  editBtn: {
    padding: '8px 16px',
    border: '1px solid #8E6FA7',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#8E6FA7',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  deleteBtn: {
    padding: '8px 16px',
    border: '1px solid #dc2626',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: '#dc2626',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    marginLeft: 'auto',
  },
  deleteConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  deleteConfirmYes: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 6,
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    cursor: 'pointer',
  },
};

// Inject keyframe animation
if (typeof document !== 'undefined') {
  const styleEl = document.getElementById('component-library-styles') || (() => {
    const el = document.createElement('style');
    el.id = 'component-library-styles';
    document.head.appendChild(el);
    return el;
  })();
  styleEl.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
  `;
}

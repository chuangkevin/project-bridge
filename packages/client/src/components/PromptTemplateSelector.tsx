import { useState, useEffect, useRef, useCallback } from 'react';

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  is_system: number;
  created_at: string;
}

interface Props {
  onSelect: (content: string) => void;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  form: '表單',
  dashboard: '儀表板',
  landing: '落地頁',
  list: '清單',
  detail: '詳情',
  general: '一般',
};

export default function PromptTemplateSelector({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompt-templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && templates.length === 0) fetchTemplates();
  }, [open, fetchTemplates, templates.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = templates.filter(t =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped: Record<string, PromptTemplate[]> = {};
  for (const t of filtered) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        style={styles.triggerBtn}
        onClick={() => setOpen(o => !o)}
        title="提示詞模板庫"
        disabled={disabled}
        data-testid="prompt-template-btn"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2h12v12H2z" rx="1.5" />
          <path d="M5 5h6M5 8h4M5 11h5" />
        </svg>
      </button>

      {open && (
        <div style={styles.dropdown} data-testid="prompt-template-dropdown">
          <div style={styles.header}>
            <span style={styles.title}>提示詞模板庫</span>
          </div>
          <div style={styles.searchWrap}>
            <input
              style={styles.searchInput}
              placeholder="搜尋模板..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              data-testid="prompt-template-search"
            />
          </div>
          <div style={styles.list}>
            {loading && <div style={styles.empty}>載入中...</div>}
            {!loading && filtered.length === 0 && <div style={styles.empty}>找不到模板</div>}
            {!loading && Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div style={styles.categoryHeader}>
                  {CATEGORY_LABELS[cat] || cat}
                </div>
                {items.map(t => (
                  <button
                    key={t.id}
                    style={styles.templateRow}
                    onClick={() => { onSelect(t.content); setOpen(false); setSearch(''); }}
                    data-testid={`prompt-template-item-${t.id}`}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(142, 111, 167, 0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                  >
                    <div style={styles.templateName}>
                      {t.name}
                      {t.is_system === 1 && <span style={styles.systemBadge}>系統</span>}
                    </div>
                    <div style={styles.templatePreview}>
                      {t.content.length > 60 ? t.content.slice(0, 60) + '...' : t.content}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  triggerBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-primary)',
    borderRadius: '10px',
    cursor: 'pointer',
    flexShrink: 0,
    color: '#8E6FA7',
  },
  dropdown: {
    position: 'absolute',
    bottom: '42px',
    left: 0,
    width: '320px',
    maxHeight: '400px',
    backgroundColor: 'var(--bg-card, #fff)',
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 14px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#8E6FA7',
  },
  searchWrap: {
    padding: '4px 10px 8px',
  },
  searchInput: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    backgroundColor: 'var(--bg-input, #fff)',
    color: 'var(--text-primary, #1e293b)',
    boxSizing: 'border-box',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 6px 8px',
  },
  categoryHeader: {
    padding: '8px 8px 4px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    color: '#8E6FA7',
    letterSpacing: '0.5px',
  },
  templateRow: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '8px 10px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  templateName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary, #1e293b)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  systemBadge: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(142, 111, 167, 0.15)',
    color: '#8E6FA7',
    fontWeight: 600,
  },
  templatePreview: {
    fontSize: '11px',
    color: 'var(--text-secondary, #64748b)',
    marginTop: '2px',
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  empty: {
    padding: '16px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: 'var(--text-secondary, #64748b)',
  },
};

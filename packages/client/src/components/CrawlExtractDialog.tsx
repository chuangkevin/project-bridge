import { useState } from 'react';
import { authHeaders } from '../contexts/AuthContext';

interface ExtractedComponent {
  category: string;
  html: string;
  css: string;
  selector: string;
  tagName: string;
  textPreview: string;
  thumbnail?: string | null;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  navigation: '導航列',
  card: '卡片',
  form: '表單',
  button: '按鈕',
  hero: '主視覺',
  footer: '頁尾',
  modal: '彈窗',
  table: '表格',
  other: '其他',
};

type Phase = 'idle' | 'crawling' | 'results' | 'saving';

export default function CrawlExtractDialog({ onClose, onSaved }: Props) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [components, setComponents] = useState<ExtractedComponent[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saveProgress, setSaveProgress] = useState(0);

  const handleCrawl = async () => {
    if (!url.trim()) return;
    setError(null);
    setPhase('crawling');
    try {
      const res = await fetch('/api/components/crawl-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setComponents(data.components || []);
      setSelected(new Set());
      setPhase('results');
      if ((data.components || []).length === 0) {
        setError('未從該頁面擷取到任何元件');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '爬取失敗');
      setPhase('idle');
    }
  };

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === components.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(components.map((_, i) => i)));
    }
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setPhase('saving');
    setSaveProgress(0);
    setError(null);

    const items = Array.from(selected).map(i => components[i]);
    let saved = 0;

    for (const comp of items) {
      try {
        const name = `${comp.category}-${comp.tagName}`;
        await fetch('/api/components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            name,
            category: comp.category,
            html: comp.html,
            css: comp.css,
            source_url: url.trim(),
          }),
        });
        saved++;
        setSaveProgress(saved);
      } catch {
        // continue saving others
      }
    }

    onSaved();
    onClose();
  };

  const allSelected = components.length > 0 && selected.size === components.length;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>從網址擷取元件</h2>
          <button type="button" style={s.closeBtn} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* URL input */}
        <div style={s.urlRow}>
          <input
            type="url"
            placeholder="輸入網址，例如 https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && phase === 'idle') handleCrawl(); }}
            style={s.urlInput}
            disabled={phase === 'crawling' || phase === 'saving'}
          />
          <button
            type="button"
            style={{
              ...s.crawlBtn,
              ...(phase === 'crawling' || phase === 'saving' ? s.crawlBtnDisabled : {}),
            }}
            disabled={phase === 'crawling' || phase === 'saving' || !url.trim()}
            onClick={handleCrawl}
          >
            {phase === 'crawling' ? '爬取中...' : '爬取'}
          </button>
        </div>

        {/* Error */}
        {error && <p style={s.error}>{error}</p>}

        {/* Crawling spinner */}
        {phase === 'crawling' && (
          <div style={s.spinnerWrap}>
            <div style={s.spinner} />
            <p style={s.spinnerText}>正在爬取頁面並擷取元件...</p>
          </div>
        )}

        {/* Results */}
        {phase === 'results' && components.length > 0 && (
          <>
            <div style={s.resultsHeader}>
              <span style={s.resultsCount}>找到 {components.length} 個元件</span>
              <label style={s.selectAllLabel}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={s.checkbox}
                />
                {allSelected ? '取消全選' : '全選'}
              </label>
            </div>

            <div style={s.resultsList}>
              {components.map((comp, idx) => (
                <div
                  key={idx}
                  style={{
                    ...s.resultCard,
                    ...(selected.has(idx) ? s.resultCardSelected : {}),
                  }}
                  onClick={() => toggleSelect(idx)}
                >
                  <div style={s.resultCardTop}>
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleSelect(idx)}
                      onClick={e => e.stopPropagation()}
                      style={s.checkbox}
                    />
                    <span style={s.categoryBadge}>
                      {CATEGORY_LABELS[comp.category] || comp.category}
                    </span>
                    <span style={s.tagName}>&lt;{comp.tagName}&gt;</span>
                    <span style={s.selector}>{comp.selector}</span>
                  </div>
                  <div style={s.previewFrame}>
                    <iframe
                      srcDoc={`<!DOCTYPE html><html><head><style>${comp.css || ''}body{margin:0;padding:8px;font-family:sans-serif;transform:scale(0.35);transform-origin:top left;width:286%;}</style></head><body>${comp.html}</body></html>`}
                      sandbox="allow-same-origin"
                      style={s.previewIframe}
                      tabIndex={-1}
                    />
                  </div>
                  {comp.textPreview && (
                    <p style={s.textPreview}>{comp.textPreview}</p>
                  )}
                </div>
              ))}
            </div>

            <div style={s.footer}>
              <button type="button" style={s.cancelBtn} onClick={onClose}>取消</button>
              <button
                type="button"
                style={{
                  ...s.saveBtn,
                  ...(selected.size === 0 ? s.saveBtnDisabled : {}),
                }}
                disabled={selected.size === 0}
                onClick={handleSave}
              >
                儲存選取 ({selected.size})
              </button>
            </div>
          </>
        )}

        {/* Saving progress */}
        {phase === 'saving' && (
          <div style={s.spinnerWrap}>
            <div style={s.spinner} />
            <p style={s.spinnerText}>正在儲存... ({saveProgress}/{selected.size})</p>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: 720,
    maxWidth: '95vw',
    maxHeight: '90vh',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 12,
    border: '1px solid var(--border-primary)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-primary)',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
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
  urlRow: {
    display: 'flex',
    gap: 8,
    padding: '16px 20px',
  },
  urlInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: 8,
    fontSize: 14,
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-input, var(--bg-primary))',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  crawlBtn: {
    padding: '8px 20px',
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background-color 0.15s',
  },
  crawlBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  error: {
    margin: '0 20px 8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(220,38,38,0.08)',
    border: '1px solid rgba(220,38,38,0.2)',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: 13,
  },
  spinnerWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '48px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--border-primary)',
    borderTopColor: '#8E6FA7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  spinnerText: {
    marginTop: 12,
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px 12px',
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  selectAllLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#8E6FA7',
    width: 16,
    height: 16,
    cursor: 'pointer',
  },
  resultsList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    maxHeight: 'calc(90vh - 280px)',
  },
  resultCard: {
    border: '1px solid var(--border-primary)',
    borderRadius: 10,
    backgroundColor: 'var(--bg-primary)',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  resultCardSelected: {
    borderColor: '#8E6FA7',
    boxShadow: '0 0 0 1px #8E6FA7',
  },
  resultCardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
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
  tagName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", Consolas, monospace',
  },
  selector: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginLeft: 'auto',
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", Consolas, monospace',
  },
  previewFrame: {
    height: 120,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    position: 'relative' as const,
  },
  previewIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    pointerEvents: 'none' as const,
  },
  textPreview: {
    margin: 0,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    borderTop: '1px solid var(--border)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '16px 20px',
    borderTop: '1px solid var(--border-primary)',
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
  saveBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  saveBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};

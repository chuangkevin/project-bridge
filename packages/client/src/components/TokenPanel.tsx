import { useState, useEffect, useCallback } from 'react';

export interface DesignToken {
  name: string;
  value: string;
}

interface DesignTokens {
  colors: Record<string, string>;
  typography: {
    fontFamily: string;
    h1: { size: string; weight: string; lineHeight: string };
    h2: { size: string; weight: string; lineHeight: string };
    h3: { size: string; weight: string; lineHeight: string };
    body: { size: string; weight: string; lineHeight: string };
    small: { size: string; weight: string; lineHeight: string };
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  components: Record<string, any>;
  source: { referenceImages: string[]; specDocuments: string[]; crawledUrls: string[] };
  manualOverrides: Record<string, boolean>;
}

interface TokenPanelProps {
  tokens: DesignToken[];
  loading: boolean;
  onClose: () => void;
  projectId?: string;
}

function isColorValue(value: string): boolean {
  return /^#|^rgb|^hsl|^oklch|^color\(/i.test(value.trim());
}

type Tab = 'tokens' | 'editor';

export default function TokenPanel({ tokens, loading, onClose, projectId }: TokenPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(projectId ? 'editor' : 'tokens');
  const [designTokens, setDesignTokens] = useState<DesignTokens | null>(null);
  const [dtLoading, setDtLoading] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [toast, setToast] = useState('');

  const loadDesignTokens = useCallback(async () => {
    if (!projectId) return;
    setDtLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens`);
      if (res.ok) {
        const data = await res.json();
        setDesignTokens(data.tokens);
      }
    } catch { /* ignore */ }
    setDtLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (tab === 'editor' && projectId && !designTokens) {
      loadDesignTokens();
    }
  }, [tab, projectId, designTokens, loadDesignTokens]);

  const handleCopy = async (name: string) => {
    try { await navigator.clipboard.writeText(`var(${name})`); } catch {}
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleCrawl = async () => {
    if (!projectId || !crawlUrl.trim()) return;
    setCrawling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/crawl-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Style extracted');
        setCrawlUrl('');
        handleCompile();
      } else {
        showToast('Crawl failed: ' + (data.error || 'unknown'));
      }
    } catch { showToast('Crawl error'); }
    setCrawling(false);
  };

  const handleCompile = async () => {
    if (!projectId) return;
    setCompiling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/compile-tokens`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDesignTokens(data.tokens);
        showToast('Tokens compiled');
      }
    } catch { showToast('Compile error'); }
    setCompiling(false);
  };

  const handleSave = async () => {
    if (!projectId || !designTokens) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/design-tokens`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: designTokens }),
      });
      showToast('Saved');
    } catch { showToast('Save error'); }
    setSaving(false);
  };

  const handleEditColor = (path: string, value: string) => {
    if (!designTokens) return;
    const updated = JSON.parse(JSON.stringify(designTokens)) as DesignTokens;
    const parts = path.split('.');
    let obj: any = updated;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    updated.manualOverrides = { ...updated.manualOverrides, [path]: true };
    setDesignTokens(updated);
  };

  const handleResetOverride = (path: string) => {
    if (!designTokens) return;
    const updated = JSON.parse(JSON.stringify(designTokens)) as DesignTokens;
    delete updated.manualOverrides[path];
    setDesignTokens(updated);
    handleCompile(); // recompile to get original value
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={{ display: 'flex', gap: 4 }}>
            {projectId && (
              <>
                <button style={{ ...styles.tabBtn, ...(tab === 'editor' ? styles.tabBtnActive : {}) }} onClick={() => setTab('editor')}>編輯器</button>
                <button style={{ ...styles.tabBtn, ...(tab === 'tokens' ? styles.tabBtnActive : {}) }} onClick={() => setTab('tokens')}>CSS 變數</button>
              </>
            )}
            {!projectId && <span style={styles.title}>Design Tokens</span>}
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="關閉">&times;</button>
        </div>

        {toast && <div style={styles.toast}>{toast}</div>}

        <div style={styles.body}>
          {tab === 'tokens' && (
            <>
              {loading && <div style={styles.emptyState}>載入 tokens 中...</div>}
              {!loading && tokens.length === 0 && <div style={styles.emptyState}>找不到 CSS 自訂屬性。</div>}
              {!loading && tokens.length > 0 && (
                <ul style={styles.list}>
                  {tokens.map((token) => {
                    const isColor = isColorValue(token.value);
                    return (
                      <li key={token.name} style={styles.item}>
                        <div style={styles.itemLeft}>
                          {isColor && <span style={{ ...styles.colorSwatch, backgroundColor: token.value }} />}
                          <span style={styles.tokenName}>{token.name}</span>
                        </div>
                        <div style={styles.itemRight}>
                          <span style={styles.tokenValue}>{token.value}</span>
                          <button style={styles.copyBtn} onClick={() => handleCopy(token.name)}>
                            {copied === token.name ? '✓' : '複製'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {tab === 'editor' && (
            <>
              {dtLoading && <div style={styles.emptyState}>載入中...</div>}

              {!dtLoading && !designTokens && (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>尚無 design tokens。</p>
                  <button style={styles.actionBtn} onClick={handleCompile} disabled={compiling}>
                    {compiling ? '編譯中...' : '編譯 Tokens'}
                  </button>
                </div>
              )}

              {!dtLoading && designTokens && (
                <>
                  {/* Actions */}
                  <div style={styles.actions}>
                    <button style={styles.actionBtnSmall} onClick={handleCompile} disabled={compiling}>
                      {compiling ? '...' : '重新編譯'}
                    </button>
                    <button style={{ ...styles.actionBtnSmall, backgroundColor: '#3b82f6', color: '#fff' }} onClick={handleSave} disabled={saving}>
                      {saving ? '...' : '儲存'}
                    </button>
                  </div>

                  {/* Crawl URL */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>參考網址</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        style={styles.input}
                        placeholder="https://example.com"
                        value={crawlUrl}
                        onChange={e => setCrawlUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCrawl()}
                      />
                      <button style={styles.actionBtnSmall} onClick={handleCrawl} disabled={crawling || !crawlUrl.trim()}>
                        {crawling ? '...' : '提取'}
                      </button>
                    </div>
                    {designTokens.source.crawledUrls.length > 0 && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        {designTokens.source.crawledUrls.length} URL(s) crawled
                      </div>
                    )}
                  </div>

                  {/* Colors */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Colors</div>
                    {Object.entries(designTokens.colors).map(([key, value]) => {
                      const path = `colors.${key}`;
                      const isOverride = designTokens.manualOverrides[path];
                      const isEditing = editingKey === path;
                      return (
                        <div key={key} style={styles.tokenRow}>
                          <input
                            type="color"
                            value={value}
                            onChange={e => handleEditColor(path, e.target.value)}
                            style={styles.colorInput}
                            title={value}
                          />
                          <span style={styles.tokenLabel}>{key}</span>
                          {isEditing ? (
                            <input
                              style={styles.inlineInput}
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => { handleEditColor(path, editingValue); setEditingKey(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') { handleEditColor(path, editingValue); setEditingKey(null); } }}
                              autoFocus
                            />
                          ) : (
                            <span
                              style={{ ...styles.tokenVal, cursor: 'pointer' }}
                              onClick={() => { setEditingKey(path); setEditingValue(value); }}
                            >{value}</span>
                          )}
                          {isOverride && (
                            <button style={styles.resetBtn} onClick={() => handleResetOverride(path)} title="重置">↺</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Typography */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Typography</div>
                    <div style={styles.tokenRow}>
                      <span style={styles.tokenLabel}>Font</span>
                      <span style={styles.tokenVal}>{designTokens.typography.fontFamily.split(',')[0].replace(/"/g, '')}</span>
                    </div>
                    {(['h1', 'h2', 'h3', 'body', 'small'] as const).map(level => {
                      const t = designTokens.typography[level];
                      return (
                        <div key={level} style={styles.tokenRow}>
                          <span style={{ ...styles.tokenLabel, fontWeight: level.startsWith('h') ? 600 : 400 }}>{level}</span>
                          <span style={styles.tokenVal}>{t.size} / {t.weight}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Spacing */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Spacing</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(designTokens.spacing).map(([key, val]) => (
                        <span key={key} style={styles.badge}>{key}: {val}</span>
                      ))}
                    </div>
                  </div>

                  {/* Border Radius */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>Border Radius</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(designTokens.borderRadius).map(([key, val]) => (
                        <span key={key} style={styles.badge}>{key}: {val}</span>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div style={styles.section}>
                    <div style={styles.sectionTitle}>預覽</div>
                    <div style={{ padding: 12, background: designTokens.colors.background || '#f9fafb', borderRadius: 8, border: '1px solid ' + (designTokens.colors.border || '#e5e7eb') }}>
                      <button style={{
                        backgroundColor: designTokens.colors.primary || '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: designTokens.borderRadius.md || '8px',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        marginBottom: 8,
                        display: 'block',
                      }}>Primary Button</button>
                      <div style={{
                        background: designTokens.colors.surface || '#fff',
                        border: '1px solid ' + (designTokens.colors.border || '#e5e7eb'),
                        borderRadius: designTokens.borderRadius.lg || '12px',
                        padding: 12,
                        fontSize: 13,
                      }}>
                        <div style={{ fontWeight: 600, color: designTokens.colors.text || '#1f2937', marginBottom: 4 }}>Card Title</div>
                        <div style={{ color: designTokens.colors.textSecondary || '#6b7280', fontSize: 12 }}>Sample content text</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', pointerEvents: 'none' },
  panel: { position: 'absolute', top: 48, right: 0, bottom: 0, width: '320px', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)', pointerEvents: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 },
  title: { fontSize: '13px', fontWeight: 600, color: '#1e293b' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#94a3b8', lineHeight: 1, padding: '0 2px' },
  body: { flex: 1, overflowY: 'auto', padding: '0' },
  emptyState: { padding: '24px 16px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', gap: '8px', borderBottom: '1px solid #f1f5f9' },
  itemLeft: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 },
  colorSwatch: { width: '14px', height: '14px', borderRadius: '3px', border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0, display: 'inline-block' },
  tokenName: { fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemRight: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  tokenValue: { fontSize: '12px', color: '#64748b', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: { padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '11px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  tabBtn: { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontWeight: 500 },
  tabBtnActive: { backgroundColor: '#3b82f6', color: '#fff', borderColor: '#3b82f6' },
  toast: { padding: '6px 12px', backgroundColor: '#22c55e', color: '#fff', fontSize: '12px', textAlign: 'center' },
  section: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9' },
  sectionTitle: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  tokenRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 },
  tokenLabel: { color: '#1e293b', fontSize: 12, minWidth: 70 },
  tokenVal: { color: '#64748b', fontSize: 12, fontFamily: 'monospace' },
  colorInput: { width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, padding: 0, cursor: 'pointer', flexShrink: 0 },
  inlineInput: { width: 80, padding: '2px 4px', border: '1px solid #3b82f6', borderRadius: 3, fontSize: 12, fontFamily: 'monospace', outline: 'none' },
  resetBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8', padding: 0 },
  actions: { display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f1f5f9' },
  actionBtn: { padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  actionBtnSmall: { padding: '4px 10px', backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, cursor: 'pointer' },
  input: { flex: 1, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, outline: 'none' },
  badge: { padding: '2px 6px', backgroundColor: '#f1f5f9', borderRadius: 3, fontSize: 11, color: '#475569' },
};

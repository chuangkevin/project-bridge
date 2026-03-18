import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Toast from '../components/Toast';

interface DesignTokens {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  borderRadius: number;
  spacing: string;
  shadowStyle: string;
}

interface ReferenceImage {
  id: string;
  file: File;
  previewUrl: string;
  analysis: string | null;
  loading: boolean;
  expanded: boolean;
}

const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
  fontFamily: 'system',
  borderRadius: 8,
  spacing: '正常',
  shadowStyle: '輕柔',
};

export default function GlobalDesignPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [tokens, setTokens] = useState<DesignTokens>({ ...DEFAULT_TOKENS });
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [designConvention, setDesignConvention] = useState('');
  const [activeTab, setActiveTab] = useState<'design' | 'convention'>('design');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevAllDoneRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/global-design');
        if (!res.ok) return;
        const data = await res.json();
        if (data.profile) {
          setDescription(data.profile.description || '');
          if (data.profile.tokens) {
            setTokens({ ...DEFAULT_TOKENS, ...data.profile.tokens });
          }
          setDesignConvention(data.profile.design_convention || '');
        }
      } catch { /* silently fail */ }
    }
    load();
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Auto-summarize direction in Chinese when all images finish analyzing
  useEffect(() => {
    if (references.length === 0) { prevAllDoneRef.current = false; return; }
    const allDone = references.every(r => !r.loading);
    const wasAllDone = prevAllDoneRef.current;
    prevAllDoneRef.current = allDone;
    if (!allDone || wasAllDone) return;

    const validAnalyses = references.filter(r => r.analysis && r.analysis !== '分析失敗').map(r => r.analysis as string);
    if (validAnalyses.length === 0) return;

    setSummarizing(true);
    fetch('/api/global-design/summarize-direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyses: validAnalyses }),
    })
      .then(r => r.json())
      .then(data => { if (data.direction) setDescription(data.direction); })
      .catch(() => {})
      .finally(() => setSummarizing(false));
  }, [references]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (references.length + files.length > 5) {
      setToastMsg('最多上傳 5 張參考圖');
      return;
    }
    for (const file of files) {
      const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      setReferences(prev => [...prev, { id, file, previewUrl, analysis: null, loading: true, expanded: false }]);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/global-design/analyze-reference', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setReferences(prev => prev.map(r => r.id === id ? { ...r, analysis: data.analysis || '', loading: false } : r));
        } else {
          setReferences(prev => prev.map(r => r.id === id ? { ...r, analysis: '分析失敗', loading: false } : r));
        }
      } catch {
        setReferences(prev => prev.map(r => r.id === id ? { ...r, analysis: '分析失敗', loading: false } : r));
      }
    }
  }, [references.length]);

  const removeReference = useCallback((id: string) => {
    setReferences(prev => {
      const ref = prev.find(r => r.id === id);
      if (ref) URL.revokeObjectURL(ref.previewUrl);
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const referenceAnalysis = references
        .filter(r => r.analysis && r.analysis !== '分析失敗')
        .map(r => r.analysis).join('\n\n---\n\n');
      const res = await fetch('/api/global-design', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, referenceAnalysis, tokens, design_convention: designConvention }),
      });
      if (!res.ok) throw new Error('Save failed');
      setToastMsg('全域設計已儲存，所有繼承的專案下次生成將套用');
    } catch {
      setToastMsg('儲存失敗');
    } finally {
      setSaving(false);
    }
  }, [description, references, tokens, designConvention]);

  const handleResetConvention = async () => {
    const res = await fetch('/api/global-design/reset-convention', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setDesignConvention(data.content);
    }
  };

  const updateToken = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h1 style={styles.title}>🌐 全域設計</h1>
        <p style={styles.subtitle}>設定品牌基礎風格，所有繼承的專案生成時自動套用</p>
      </div>

      <div style={styles.scrollArea}>
        {/* Tab bar */}
        <div style={styles.tabBar}>
          <button type="button" onClick={() => setActiveTab('design')} style={{ ...styles.tabBtn, borderBottom: activeTab === 'design' ? '2px solid #8E6FA7' : '2px solid transparent', fontWeight: activeTab === 'design' ? 600 : 400, color: activeTab === 'design' ? '#8E6FA7' : '#666' }}>
            全域設計
          </button>
          <button type="button" onClick={() => setActiveTab('convention')} style={{ ...styles.tabBtn, borderBottom: activeTab === 'convention' ? '2px solid #8E6FA7' : '2px solid transparent', fontWeight: activeTab === 'convention' ? 600 : 400, color: activeTab === 'convention' ? '#8E6FA7' : '#666' }}>
            設計準則
          </button>
        </div>

        {activeTab === 'convention' && (
          <div>
            <p style={styles.conventionHint}>
              此內容會自動注入到每次 AI 生成的 system prompt 中。支援 Markdown 格式。
            </p>
            <textarea
              value={designConvention}
              onChange={e => setDesignConvention(e.target.value)}
              style={styles.conventionTextarea}
              placeholder="輸入設計準則..."
              title="設計準則"
            />
            <div style={styles.conventionActions}>
              <button type="button" onClick={handleResetConvention} style={styles.resetBtn}>
                重置為預設檔案
              </button>
            </div>
          </div>
        )}

        {activeTab === 'design' && (
        <>{/* Design Direction */}
        <div style={styles.section}>
          <div style={styles.sectionLabelRow}>
            <label style={styles.sectionLabel}>設計方向</label>
            {summarizing && (
              <span style={styles.summarizingLabel}>
                <span style={styles.summarizingSpinner} />
                AI 生成中...
              </span>
            )}
          </div>
          <textarea
            style={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述品牌設計風格，例如：現代簡約，企業感，主打信任感..."
            rows={4}
            disabled={summarizing}
            data-testid="global-design-description"
          />
        </div>

        {/* Visual References */}
        <div style={styles.section}>
          <label style={styles.sectionLabel}>視覺參考圖</label>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="image/png,image/jpeg" multiple onChange={handleFileSelect} />
          <button style={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={references.length >= 5} data-testid="global-add-reference-btn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1v12M1 7h12" /></svg>
            上傳參考圖
          </button>
          {references.length > 0 && (
            <div style={styles.referencesGrid}>
              {references.map((ref, index) => (
                <div key={ref.id} style={styles.referenceItem}>
                  <div style={styles.thumbnailWrapper}>
                    <img src={ref.previewUrl} alt={`Reference ${index + 1}`} style={styles.thumbnail} />
                    <button style={styles.removeBtn} onClick={() => removeReference(ref.id)}>×</button>
                  </div>
                  {ref.loading && <div style={styles.loadingRow}><div style={styles.spinner} /><span style={styles.loadingText}>分析中...</span></div>}
                  {!ref.loading && ref.analysis && (
                    <button style={styles.analysisToggle} onClick={() => setReferences(prev => prev.map(r => r.id === ref.id ? { ...r, expanded: !r.expanded } : r))}>
                      {ref.expanded ? '▾ 收起' : '▸ 查看分析'}
                    </button>
                  )}
                  {!ref.loading && ref.analysis && ref.expanded && <p style={styles.analysisText}>{ref.analysis}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Design Tokens */}
        <div style={styles.section}>
          <label style={styles.sectionLabel}>設計細節</label>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>主色</span>
            <div style={styles.colorInputGroup}>
              <input type="color" value={tokens.primaryColor} onChange={e => updateToken('primaryColor', e.target.value)} style={styles.colorPicker} data-testid="global-token-primary-color" />
              <input type="text" value={tokens.primaryColor} onChange={e => updateToken('primaryColor', e.target.value)} style={styles.hexInput} maxLength={7} placeholder="#3b82f6" />
            </div>
          </div>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>次色</span>
            <div style={styles.colorInputGroup}>
              <input type="color" value={tokens.secondaryColor} onChange={e => updateToken('secondaryColor', e.target.value)} style={styles.colorPicker} data-testid="global-token-secondary-color" />
              <input type="text" value={tokens.secondaryColor} onChange={e => updateToken('secondaryColor', e.target.value)} style={styles.hexInput} maxLength={7} placeholder="#64748b" />
            </div>
          </div>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>字型</span>
            <select value={tokens.fontFamily} onChange={e => updateToken('fontFamily', e.target.value)} style={styles.select} data-testid="global-token-font-family">
              <option value="system">系統預設 (System)</option>
              <option value="sans-serif">Sans-serif (現代)</option>
              <option value="serif">Serif (優雅)</option>
              <option value="monospace">Monospace (科技)</option>
            </select>
          </div>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>圓角</span>
            <div style={styles.sliderGroup}>
              <input type="range" min={0} max={24} value={tokens.borderRadius} onChange={e => updateToken('borderRadius', Number(e.target.value))} style={styles.slider} />
              <span style={styles.sliderValue}>{tokens.borderRadius}px</span>
            </div>
          </div>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>間距</span>
            <div style={styles.radioGroup}>
              {['緊湊', '正常', '寬鬆'].map(opt => (
                <label key={opt} style={styles.radioLabel}>
                  <input type="radio" name="global-spacing" value={opt} checked={tokens.spacing === opt} onChange={() => updateToken('spacing', opt)} style={{ margin: 0 }} />
                  <span style={styles.radioText}>{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={styles.tokenRow}>
            <span style={styles.tokenLabel}>陰影</span>
            <div style={styles.radioGroup}>
              {['無', '輕柔', '明顯'].map(opt => (
                <label key={opt} style={styles.radioLabel}>
                  <input type="radio" name="global-shadow" value={opt} checked={tokens.shadowStyle === opt} onChange={() => updateToken('shadowStyle', opt)} style={{ margin: 0 }} />
                  <span style={styles.radioText}>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        </>)}
      </div>

      <div style={styles.footer}>
        <button style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving} data-testid="global-save-design-btn">
          {saving ? '儲存中...' : '儲存全域設計'}
        </button>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { padding: '24px 32px 16px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' },
  backBtn: { position: 'absolute', top: '20px', left: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#ffffff', color: '#64748b', cursor: 'pointer' },
  title: { margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#1e293b', textAlign: 'center' },
  subtitle: { margin: 0, fontSize: '13px', color: '#64748b', textAlign: 'center' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
  section: { backgroundColor: '#ffffff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' },
  sectionLabel: { fontSize: '13px', fontWeight: 600, color: '#1e293b' },
  summarizingLabel: { fontSize: '11px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' },
  summarizingSpinner: { display: 'inline-block', width: '10px', height: '10px', border: '2px solid #e2e8f0', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  textarea: { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', resize: 'vertical' as const, outline: 'none', fontFamily: 'inherit', lineHeight: '1.5', color: '#1e293b', backgroundColor: '#ffffff', boxSizing: 'border-box' as const },
  uploadBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' },
  referencesGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  referenceItem: { display: 'flex', flexDirection: 'column', gap: '6px' },
  thumbnailWrapper: { position: 'relative', width: '80px', height: '80px', flexShrink: 0 },
  thumbnail: { width: '80px', height: '80px', objectFit: 'cover' as const, borderRadius: '6px', border: '1px solid #e2e8f0' },
  removeBtn: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '50%', fontSize: '12px', cursor: 'pointer', lineHeight: 1, padding: 0 },
  loadingRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  spinner: { width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: '12px', color: '#64748b' },
  analysisToggle: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  analysisText: { margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.5', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' as const },
  tokenRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  tokenLabel: { fontSize: '12px', fontWeight: 500, color: '#64748b', minWidth: '36px', flexShrink: 0 },
  colorInputGroup: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
  colorPicker: { width: '32px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px', cursor: 'pointer', backgroundColor: '#ffffff' },
  hexInput: { flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', outline: 'none', fontFamily: '"SF Mono", "Fira Code", monospace', color: '#1e293b' },
  select: { flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#1e293b', backgroundColor: '#ffffff', outline: 'none' },
  sliderGroup: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
  slider: { flex: 1, cursor: 'pointer' },
  sliderValue: { fontSize: '12px', color: '#475569', minWidth: '32px', textAlign: 'right' as const },
  radioGroup: { display: 'flex', gap: '12px', flex: 1 },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
  radioText: { fontSize: '12px', color: '#1e293b' },
  footer: { padding: '16px 32px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
  saveBtn: { width: '100%', padding: '10px 16px', backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tabBar: { display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '8px' },
  tabBtn: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' } as React.CSSProperties,
  conventionHint: { fontSize: '13px', color: '#666', marginBottom: '12px' },
  conventionTextarea: { width: '100%', height: '480px', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' as const, boxSizing: 'border-box' as const },
  conventionActions: { display: 'flex', gap: '8px', marginTop: '12px' },
  resetBtn: { padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#ffffff', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },
};

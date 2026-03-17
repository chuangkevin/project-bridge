import { useState, useEffect, useRef, useCallback } from 'react';

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

interface Props {
  projectId: string;
  onSaved?: () => void;
}

const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
  fontFamily: 'system',
  borderRadius: 8,
  spacing: '正常',
  shadowStyle: '輕柔',
};

export default function DesignPanel({ projectId, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [tokens, setTokens] = useState<DesignTokens>({ ...DEFAULT_TOKENS });
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load design profile on mount
  useEffect(() => {
    async function loadDesign() {
      try {
        const res = await fetch(`/api/projects/${projectId}/design`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.profile) {
          setDescription(data.profile.description || '');
          if (data.profile.tokens) {
            setTokens({ ...DEFAULT_TOKENS, ...data.profile.tokens });
          }
        }
      } catch {
        // silently fail
      }
    }
    loadDesign();
  }, [projectId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    if (references.length + files.length > 5) {
      setToastMsg({ text: '最多上傳 5 張參考圖', type: 'error' });
      return;
    }

    for (const file of files) {
      const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);

      const newRef: ReferenceImage = {
        id,
        file,
        previewUrl,
        analysis: null,
        loading: true,
        expanded: false,
      };

      setReferences(prev => [...prev, newRef]);

      // Upload and analyze
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`/api/projects/${projectId}/design/analyze-reference`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setReferences(prev =>
            prev.map(r => r.id === id ? { ...r, analysis: data.analysis || '', loading: false } : r)
          );
        } else {
          setReferences(prev =>
            prev.map(r => r.id === id ? { ...r, analysis: '分析失敗', loading: false } : r)
          );
        }
      } catch {
        setReferences(prev =>
          prev.map(r => r.id === id ? { ...r, analysis: '分析失敗', loading: false } : r)
        );
      }
    }
  }, [projectId, references.length]);

  const removeReference = useCallback((id: string) => {
    setReferences(prev => {
      const ref = prev.find(r => r.id === id);
      if (ref) URL.revokeObjectURL(ref.previewUrl);
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setReferences(prev =>
      prev.map(r => r.id === id ? { ...r, expanded: !r.expanded } : r)
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const referenceAnalysis = references
        .filter(r => r.analysis && r.analysis !== '分析失敗')
        .map(r => r.analysis)
        .join('\n\n---\n\n');

      const res = await fetch(`/api/projects/${projectId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          referenceAnalysis,
          tokens,
        }),
      });

      if (!res.ok) throw new Error('Save failed');

      setToastMsg({ text: '已儲存，下次生成將套用此設計', type: 'success' });
      if (onSaved) onSaved();
    } catch {
      setToastMsg({ text: '儲存失敗', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [projectId, description, references, tokens, onSaved]);

  const updateToken = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.scrollArea}>

        {/* Section 1: Design Direction */}
        <div style={panelStyles.section}>
          <label style={panelStyles.sectionLabel}>設計方向</label>
          <textarea
            style={panelStyles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述你的設計風格，例如：現代簡約，企業感，主打信任感..."
            rows={4}
            data-testid="design-description"
          />
        </div>

        {/* Section 2: Visual References */}
        <div style={panelStyles.section}>
          <label style={panelStyles.sectionLabel}>視覺參考圖</label>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept="image/png,image/jpeg"
            multiple
            onChange={handleFileSelect}
          />
          <button
            style={panelStyles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={references.length >= 5}
            data-testid="add-reference-btn"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 1v12M1 7h12" />
            </svg>
            上傳參考圖
          </button>

          {references.length > 0 && (
            <div style={panelStyles.referencesGrid}>
              {references.map((ref, index) => (
                <div key={ref.id} style={panelStyles.referenceItem} data-testid={`reference-image-${index}`}>
                  <div style={panelStyles.thumbnailWrapper}>
                    <img
                      src={ref.previewUrl}
                      alt={`Reference ${index + 1}`}
                      style={panelStyles.thumbnail}
                    />
                    <button
                      style={panelStyles.removeBtn}
                      onClick={() => removeReference(ref.id)}
                      title="移除"
                    >
                      ×
                    </button>
                  </div>
                  {ref.loading && (
                    <div style={panelStyles.loadingSpinner}>
                      <div style={panelStyles.spinner} />
                      <span style={panelStyles.loadingText}>分析中...</span>
                    </div>
                  )}
                  {!ref.loading && ref.analysis && (
                    <div style={panelStyles.analysisBlock}>
                      <button
                        style={panelStyles.analysisToggle}
                        onClick={() => toggleExpanded(ref.id)}
                      >
                        {ref.expanded ? '▾ 收起分析' : '▸ 查看分析'}
                      </button>
                      {ref.expanded && (
                        <p style={panelStyles.analysisText}>{ref.analysis}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Design Tokens */}
        <div style={panelStyles.section}>
          <label style={panelStyles.sectionLabel}>設計細節</label>

          {/* Primary Color */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>主色</span>
            <div style={panelStyles.colorInputGroup}>
              <input
                type="color"
                value={tokens.primaryColor}
                onChange={e => updateToken('primaryColor', e.target.value)}
                style={panelStyles.colorPicker}
                data-testid="token-primary-color"
              />
              <input
                type="text"
                value={tokens.primaryColor}
                onChange={e => updateToken('primaryColor', e.target.value)}
                style={panelStyles.hexInput}
                maxLength={7}
                placeholder="#3b82f6"
              />
            </div>
          </div>

          {/* Secondary Color */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>次色</span>
            <div style={panelStyles.colorInputGroup}>
              <input
                type="color"
                value={tokens.secondaryColor}
                onChange={e => updateToken('secondaryColor', e.target.value)}
                style={panelStyles.colorPicker}
                data-testid="token-secondary-color"
              />
              <input
                type="text"
                value={tokens.secondaryColor}
                onChange={e => updateToken('secondaryColor', e.target.value)}
                style={panelStyles.hexInput}
                maxLength={7}
                placeholder="#64748b"
              />
            </div>
          </div>

          {/* Font Family */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>字型</span>
            <select
              value={tokens.fontFamily}
              onChange={e => updateToken('fontFamily', e.target.value)}
              style={panelStyles.select}
              data-testid="token-font-family"
            >
              <option value="system">系統預設 (System)</option>
              <option value="sans-serif">Sans-serif (現代)</option>
              <option value="serif">Serif (優雅)</option>
              <option value="monospace">Monospace (科技)</option>
            </select>
          </div>

          {/* Border Radius */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>圓角</span>
            <div style={panelStyles.sliderGroup}>
              <input
                type="range"
                min={0}
                max={24}
                value={tokens.borderRadius}
                onChange={e => updateToken('borderRadius', Number(e.target.value))}
                style={panelStyles.slider}
                data-testid="token-border-radius"
              />
              <span style={panelStyles.sliderValue}>{tokens.borderRadius}px</span>
            </div>
          </div>

          {/* Spacing */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>間距</span>
            <div style={panelStyles.radioGroup} data-testid="token-spacing">
              {['緊湊', '正常', '寬鬆'].map(opt => (
                <label key={opt} style={panelStyles.radioLabel}>
                  <input
                    type="radio"
                    name="spacing"
                    value={opt}
                    checked={tokens.spacing === opt}
                    onChange={() => updateToken('spacing', opt)}
                    style={{ margin: 0 }}
                  />
                  <span style={panelStyles.radioText}>{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Shadow */}
          <div style={panelStyles.tokenRow}>
            <span style={panelStyles.tokenLabel}>陰影</span>
            <div style={panelStyles.radioGroup} data-testid="token-shadow">
              {['無', '輕柔', '明顯'].map(opt => (
                <label key={opt} style={panelStyles.radioLabel}>
                  <input
                    type="radio"
                    name="shadow"
                    value={opt}
                    checked={tokens.shadowStyle === opt}
                    onChange={() => updateToken('shadowStyle', opt)}
                    style={{ margin: 0 }}
                  />
                  <span style={panelStyles.radioText}>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={panelStyles.footer}>
        <button
          style={{
            ...panelStyles.saveBtn,
            opacity: saving ? 0.7 : 1,
          }}
          onClick={handleSave}
          disabled={saving}
          data-testid="save-design-btn"
        >
          {saving ? '儲存中...' : '儲存設計規格'}
        </button>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            ...panelStyles.toast,
            backgroundColor: toastMsg.type === 'success' ? '#16a34a' : '#dc2626',
          }}
        >
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '14px',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '2px',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  referencesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  referenceItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  thumbnailWrapper: {
    position: 'relative',
    width: '80px',
    height: '80px',
    flexShrink: 0,
  },
  thumbnail: {
    width: '80px',
    height: '80px',
    objectFit: 'cover' as const,
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  removeBtn: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '50%',
    fontSize: '12px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid #e2e8f0',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '12px',
    color: '#64748b',
  },
  analysisBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  analysisToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
  analysisText: {
    margin: 0,
    fontSize: '11px',
    color: '#475569',
    lineHeight: '1.5',
    padding: '8px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    whiteSpace: 'pre-wrap' as const,
  },
  tokenRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  tokenLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748b',
    minWidth: '36px',
    flexShrink: 0,
  },
  colorInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  colorPicker: {
    width: '32px',
    height: '28px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '2px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
  },
  hexInput: {
    flex: 1,
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    fontFamily: '"SF Mono", "Fira Code", monospace',
    color: '#1e293b',
  },
  select: {
    flex: 1,
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  sliderGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  slider: {
    flex: 1,
    cursor: 'pointer',
  },
  sliderValue: {
    fontSize: '12px',
    color: '#475569',
    minWidth: '32px',
    textAlign: 'right' as const,
  },
  radioGroup: {
    display: 'flex',
    gap: '12px',
    flex: 1,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  radioText: {
    fontSize: '12px',
    color: '#1e293b',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
  },
  saveBtn: {
    width: '100%',
    padding: '9px 16px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toast: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100,
  },
};

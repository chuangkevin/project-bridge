import { useState, useEffect, useRef, useCallback } from 'react';
import CrawlPreview from './CrawlPreview';
import SaveComponentDialog from './SaveComponentDialog';

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
  const [summarizing, setSummarizing] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevAllDoneRef = useRef(false);
  const [globalProfile, setGlobalProfile] = useState<{ description: string; tokens: Record<string, unknown> } | null>(null);
  const [inheritGlobal, setInheritGlobal] = useState(true);
  const [supplement, setSupplement] = useState('');
  const [shellHtml, setShellHtml] = useState('');
  const [hasShell, setHasShell] = useState(false);
  const [shellExpanded, setShellExpanded] = useState(false);
  const [savingShell, setSavingShell] = useState(false);
  const [extractingShell, setExtractingShell] = useState(false);

  // URL Crawl state (Phase 2 + 4)
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<{ html: string; tokens: any; screenshot: string } | null>(null);
  const [crawlZoom, setCrawlZoom] = useState(50);
  const [extractMode, setExtractMode] = useState(false);
  const [extractedComponent, setExtractedComponent] = useState<{ html: string; css: string } | null>(null);

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
          setInheritGlobal(data.profile.inheritGlobal !== false);
          setSupplement(data.profile.supplement || '');
        }
      } catch {
        // silently fail
      }
    }
    loadDesign();

    fetch('/api/global-design')
      .then(r => r.json())
      .then(data => {
        if (data.profile && (data.profile.description || data.profile.referenceAnalysis || Object.keys(data.profile.tokens || {}).length > 0)) {
          setGlobalProfile(data.profile);
        }
      })
      .catch(() => {});

    fetch(`/api/projects/${projectId}/platform-shell`)
      .then(r => r.json())
      .then(data => {
        if (data.shell) {
          setShellHtml(data.shell.shellHtml || '');
          setHasShell(true);
        }
      })
      .catch(() => {});
  }, [projectId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Auto-summarize design direction in Chinese when all images finish analyzing
  useEffect(() => {
    if (references.length === 0) {
      prevAllDoneRef.current = false;
      return;
    }
    const allDone = references.every(r => !r.loading);
    const wasAllDone = prevAllDoneRef.current;
    prevAllDoneRef.current = allDone;

    if (!allDone || wasAllDone) return;

    const validAnalyses = references
      .filter(r => r.analysis && r.analysis !== '分析失敗')
      .map(r => r.analysis as string);

    if (validAnalyses.length === 0) return;

    setSummarizing(true);
    fetch(`/api/projects/${projectId}/design/summarize-direction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyses: validAnalyses }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.direction) {
          setDescription(data.direction);
        }
      })
      .catch(() => { /* silently fail */ })
      .finally(() => setSummarizing(false));
  }, [references, projectId]);

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
          inheritGlobal,
          supplement,
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
  }, [projectId, description, references, tokens, inheritGlobal, supplement, onSaved]);

  const handleExtractShell = useCallback(async () => {
    setExtractingShell(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/platform-shell/extract`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        setToastMsg({ text: err.error || '擷取失敗', type: 'error' });
        return;
      }
      const data = await res.json();
      setShellHtml(data.shell.shellHtml);
      setHasShell(true);
      setToastMsg({ text: 'Platform Shell 已從原型擷取', type: 'success' });
    } catch {
      setToastMsg({ text: '擷取失敗', type: 'error' });
    } finally {
      setExtractingShell(false);
    }
  }, [projectId]);

  const handleSaveShell = useCallback(async () => {
    setSavingShell(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/platform-shell`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shellHtml }),
      });
      if (!res.ok) throw new Error('Save failed');
      setHasShell(true);
      setToastMsg({ text: 'Platform Shell 已儲存', type: 'success' });
    } catch {
      setToastMsg({ text: '儲存失敗', type: 'error' });
    } finally {
      setSavingShell(false);
    }
  }, [projectId, shellHtml]);

  const handleCrawl = useCallback(async () => {
    if (!crawlUrl.trim()) return;
    setCrawling(true);
    setCrawlResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/crawl-full-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '爬取失敗' }));
        setToastMsg({ text: err.error || '爬取失敗', type: 'error' });
        return;
      }
      const data = await res.json();
      setCrawlResult({ html: data.html || '', tokens: data.tokens || {}, screenshot: data.screenshot || '' });
      setToastMsg({ text: '爬取完成', type: 'success' });
    } catch {
      setToastMsg({ text: '爬取失敗', type: 'error' });
    } finally {
      setCrawling(false);
    }
  }, [projectId, crawlUrl]);

  const updateTokenDirect = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyCrawledStyle = useCallback(() => {
    if (!crawlResult?.tokens) return;
    const ct = crawlResult.tokens;
    if (ct.colors?.[0]?.value) {
      updateTokenDirect('primaryColor', ct.colors[0].value);
    }
    if (ct.typography?.fonts?.[0]?.value) {
      const font = ct.typography.fonts[0].value.toLowerCase();
      if (font.includes('serif') && !font.includes('sans')) {
        updateTokenDirect('fontFamily', 'serif');
      } else if (font.includes('mono')) {
        updateTokenDirect('fontFamily', 'monospace');
      } else if (font.includes('sans')) {
        updateTokenDirect('fontFamily', 'sans-serif');
      } else {
        updateTokenDirect('fontFamily', 'system');
      }
    }
    if (ct.borderRadii?.[0]?.value != null) {
      const raw = String(ct.borderRadii[0].value).replace(/px/g, '');
      const num = Math.min(24, Math.max(0, Math.round(Number(raw) || 0)));
      updateTokenDirect('borderRadius', num);
    }
    setToastMsg({ text: '已套用爬取的設計風格', type: 'success' });
  }, [crawlResult]);

  const updateToken = <K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.scrollArea}>

        {/* Section 0: URL Crawl */}
        <div style={panelStyles.section}>
          <label style={panelStyles.sectionLabel}>參考網站</label>
          <div style={panelStyles.crawlInputRow}>
            <input
              type="text"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              placeholder="https://example.com"
              style={panelStyles.crawlInput}
              disabled={crawling}
              data-testid="crawl-url-input"
              onKeyDown={e => { if (e.key === 'Enter') handleCrawl(); }}
            />
            <button
              type="button"
              style={{
                ...panelStyles.crawlBtn,
                opacity: crawling || !crawlUrl.trim() ? 0.6 : 1,
              }}
              onClick={handleCrawl}
              disabled={crawling || !crawlUrl.trim()}
              data-testid="crawl-btn"
            >
              {crawling ? '爬取中...' : '爬取'}
            </button>
          </div>
          {crawling && (
            <div style={panelStyles.loadingSpinner}>
              <div style={panelStyles.spinner} />
              <span style={panelStyles.loadingText}>正在爬取網頁...</span>
            </div>
          )}
          {crawlResult && (
            <>
              <CrawlPreview
                html={crawlResult.html}
                zoom={crawlZoom}
                extractMode={extractMode}
                onExtract={(data) => {
                  setExtractedComponent(data);
                  setExtractMode(false);
                }}
                onZoomChange={setCrawlZoom}
              />
              <div style={panelStyles.crawlActionRow}>
                <button
                  type="button"
                  style={{
                    ...panelStyles.crawlActionBtn,
                    ...(extractMode ? { backgroundColor: 'var(--accent)', color: '#fff' } : {}),
                  }}
                  onClick={() => setExtractMode(!extractMode)}
                  data-testid="crawl-copy-btn"
                >
                  {extractMode ? '取消選取模式' : '進入選取模式'}
                </button>
                <button
                  type="button"
                  style={panelStyles.crawlActionBtnAccent}
                  onClick={handleApplyCrawledStyle}
                  data-testid="crawl-similar-btn"
                >
                  類似設計
                </button>
              </div>
              {extractMode && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #93c5fd',
                  background: '#eff6ff',
                  color: '#1e40af',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  已進入選取模式：請直接在右側預覽畫面點一下要照抄的元件
                </div>
              )}
            </>
          )}
          {extractedComponent && (
            <SaveComponentDialog
              html={extractedComponent.html}
              css={extractedComponent.css}
              projectId={projectId}
              onClose={() => setExtractedComponent(null)}
              onSaved={() => {
                setExtractedComponent(null);
                setToastMsg({ text: '元件已存入元件庫', type: 'success' });
              }}
            />
          )}
        </div>

        {/* Section 1: Design Direction */}
        <div style={panelStyles.section}>
          <div style={panelStyles.sectionLabelRow}>
            <label style={panelStyles.sectionLabel}>設計方向</label>
            {summarizing && (
              <span style={panelStyles.summarizingLabel}>
                <span style={panelStyles.summarizingSpinner} />
                AI 生成中...
              </span>
            )}
          </div>
          <textarea
            style={panelStyles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述你的設計風格，例如：現代簡約，企業感，主打信任感..."
            rows={4}
            disabled={summarizing}
            data-testid="design-description"
          />
        </div>

        {/* Global Design Inheritance */}
        {globalProfile && (
          <div style={panelStyles.section}>
            <div style={panelStyles.inheritRow}>
              <span style={panelStyles.sectionLabel}>繼承全域設計</span>
              <label style={panelStyles.toggleLabel}>
                <input
                  type="checkbox"
                  aria-label="繼承全域設計"
                  checked={inheritGlobal}
                  onChange={e => setInheritGlobal(e.target.checked)}
                  style={{ display: 'none' }}
                />
                <span style={{
                  ...panelStyles.toggleTrack,
                  backgroundColor: inheritGlobal ? '#7c3aed' : '#cbd5e1',
                }}>
                  <span style={{
                    ...panelStyles.toggleThumb,
                    transform: inheritGlobal ? 'translateX(14px)' : 'translateX(0)',
                  }} />
                </span>
              </label>
            </div>
            {inheritGlobal && (
              <>
                <div style={panelStyles.globalPreview}>
                  <div style={panelStyles.globalPreviewRow}>
                    {!!globalProfile.tokens?.primaryColor && (
                      <span style={{
                        ...panelStyles.colorSwatch,
                        backgroundColor: globalProfile.tokens.primaryColor as string,
                      }} />
                    )}
                    <span style={panelStyles.globalPreviewText}>
                      {globalProfile.description
                        ? globalProfile.description.slice(0, 80) + (globalProfile.description.length > 80 ? '...' : '')
                        : '（無描述）'}
                    </span>
                  </div>
                </div>
                <label style={panelStyles.sectionLabel}>專案補充說明</label>
                <textarea
                  style={panelStyles.textarea}
                  value={supplement}
                  onChange={e => setSupplement(e.target.value)}
                  placeholder="針對此專案的補充設計說明，例如：此頁面的 CTA 按鈕使用橘色強調色..."
                  rows={3}
                  data-testid="supplement-textarea"
                />
              </>
            )}
          </div>
        )}

        {/* Platform Shell Section */}
        <div style={panelStyles.section}>
          <div style={panelStyles.inheritRow}>
            <span style={panelStyles.sectionLabel}>平台 Shell</span>
            {hasShell && (
              <span style={panelStyles.shellBadge} data-testid="shell-active-badge">已啟用</span>
            )}
          </div>
          <p style={panelStyles.shellHint}>定義現有系統的 nav/sidebar/header 框架，AI 生成子頁時將嵌入此框架中</p>
          <div style={panelStyles.shellBtnRow}>
            <button
              type="button"
              style={panelStyles.shellBtn}
              onClick={handleExtractShell}
              disabled={extractingShell}
              data-testid="extract-shell-btn"
            >
              {extractingShell ? '擷取中...' : '從現有原型擷取'}
            </button>
            <button
              type="button"
              style={panelStyles.shellBtnPurple}
              onClick={() => setShellExpanded(v => !v)}
            >
              {shellExpanded ? '收起手動輸入' : '手動貼上 Shell'}
            </button>
          </div>
          {shellExpanded && (
            <>
              <textarea
                style={panelStyles.shellTextarea}
                value={shellHtml}
                onChange={e => setShellHtml(e.target.value)}
                placeholder={'貼上現有系統的 HTML shell，使用 {CONTENT} 標記主內容插入位置\n\n例如：\n<nav>...</nav>\n<main>{CONTENT}</main>'}
                data-testid="shell-html-textarea"
              />
              <button
                type="button"
                style={panelStyles.shellSaveBtn}
                onClick={handleSaveShell}
                disabled={savingShell || !shellHtml.trim()}
                data-testid="save-shell-btn"
              >
                {savingShell ? '儲存中...' : '儲存 Shell'}
              </button>
            </>
          )}
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
  sectionLabelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2px',
  },
  summarizingLabel: {
    fontSize: '11px',
    color: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  summarizingSpinner: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    border: '2px solid #e2e8f0',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  inheritRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  toggleTrack: {
    position: 'relative' as const,
    display: 'inline-block',
    width: '32px',
    height: '18px',
    borderRadius: '9px',
    transition: 'background-color 0.2s',
    flexShrink: 0,
  },
  toggleThumb: {
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  globalPreview: {
    padding: '10px 12px',
    backgroundColor: '#f5f3ff',
    borderRadius: '8px',
    border: '1px solid #ddd6fe',
  },
  globalPreviewRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  colorSwatch: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    flexShrink: 0,
    marginTop: '2px',
    border: '1px solid rgba(0,0,0,0.1)',
  },
  globalPreviewText: {
    fontSize: '12px',
    color: '#4c1d95',
    lineHeight: '1.4',
  },
  shellBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  shellHint: {
    margin: '0 0 4px',
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: '1.4',
  },
  shellBtnRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  shellBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  shellBtnPurple: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    border: '1px solid #c4b5fd',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#7c3aed',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  shellTextarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: '"SF Mono","Fira Code",monospace',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: '1.5',
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    boxSizing: 'border-box' as const,
    minHeight: '120px',
  },
  shellSaveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start' as const,
  },
  crawlInputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  crawlInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  },
  crawlBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 14px',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  crawlPreviewBox: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  crawlZoomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
  },
  crawlIframeContainer: {
    width: '100%',
    height: '400px',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  crawlActionRow: {
    display: 'flex',
    gap: '8px',
  },
  crawlActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  crawlActionBtnAccent: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 14px',
    border: '1px solid #7c3aed',
    borderRadius: '8px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    fontSize: '13px',
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

import { useState, useEffect } from 'react';
import { authHeaders } from '../contexts/AuthContext';

interface Props {
  projectId: string;
  shareToken: string;
  onClose: () => void;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';
type ExportState = 'idle' | 'exporting' | 'success' | 'error';

export default function FigmaExportDialog({ projectId, shareToken, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState('');

  const shareUrl = `${window.location.origin}/share/${shareToken}`;

  // Check if code_to_design_api_key is configured
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings', { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const settings: { key: string; value: string }[] = data.settings || [];
          const ctdKey = settings.find(s => s.key === 'code_to_design_api_key');
          // A configured key will have a masked non-empty value
          setApiKeyConfigured(!!ctdKey?.value && ctdKey.value.length > 0);
        }
      } catch {
        // ignore — leave as not configured
      } finally {
        setCheckingKey(false);
      }
    })();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportFigma = async () => {
    setExportState('exporting');
    setExportError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/export/figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ viewport }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data.clipboardData));
      setExportState('success');
      setTimeout(() => setExportState('idle'), 4000);
    } catch (err: any) {
      setExportError(err.message || 'Export failed');
      setExportState('error');
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>匯出到 Figma</h2>
          <button style={styles.closeBtn} onClick={onClose} title="關閉">
            ✕
          </button>
        </div>

        {/* Quick Export Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>⚡</span>
            <span style={styles.sectionTitle}>快速匯出（免費）</span>
          </div>
          <p style={styles.sectionDesc}>
            使用 html.to.design Figma 插件將你的 prototype 匯入 Figma
          </p>

          {/* Share URL */}
          <label style={styles.label}>分享連結：</label>
          <div style={styles.urlRow}>
            <input
              style={styles.urlInput}
              value={shareUrl}
              readOnly
              onClick={e => (e.target as HTMLInputElement).select()}
              data-testid="figma-share-url"
            />
            <button
              style={styles.copyBtn}
              onClick={handleCopy}
              data-testid="figma-copy-btn"
            >
              {copied ? '已複製!' : '複製'}
            </button>
          </div>

          {/* Steps */}
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#92400e' }}>
            ⚠️ 內網網址無法被 Figma 插件直接存取。請改用 <strong>Chrome 擴充功能</strong>（步驟 1b）在瀏覽器中擷取。
          </div>
          <div style={styles.stepsHeader}>步驟：</div>
          <ol style={styles.stepsList}>
            <li style={styles.stepItem}>
              <strong>方法 A：</strong>安裝
              {' '}<a href="https://chromewebstore.google.com/detail/htmltodesign/ldnheaepmnmbjjjahokphckbpgciiaed" target="_blank" rel="noopener noreferrer" style={styles.link}>html.to.design Chrome 擴充功能</a>
              {' '}（推薦，支援內網）
            </li>
            <li style={styles.stepItem}>在瀏覽器開啟上方分享連結</li>
            <li style={styles.stepItem}>點擊 Chrome 擴充功能圖示 → 擷取頁面 → 下載 .h2d 檔案</li>
            <li style={styles.stepItem}>在 Figma 開啟 html.to.design 插件 → 匯入 .h2d 檔案</li>
          </ol>
          <details style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
            <summary style={{ cursor: 'pointer' }}>方法 B：Figma 插件直接匯入（僅限公開網址）</summary>
            <ol style={{ ...styles.stepsList, marginTop: 4 }}>
              <li style={styles.stepItem}>安裝 <a href="https://www.figma.com/community/plugin/1159123024924461424/html-to-design" target="_blank" rel="noopener noreferrer" style={styles.link}>Figma 插件</a></li>
              <li style={styles.stepItem}>在 Figma 中開啟插件 → 貼上連結</li>
              <li style={styles.stepItem}>選擇 viewport 大小並匯入</li>
            </ol>
          </details>
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>或</span>
          <span style={styles.dividerLine} />
        </div>

        {/* API Export Section */}
        <div style={{
          ...styles.section,
          ...(!apiKeyConfigured && !checkingKey ? styles.disabledSection : {}),
        }}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>🚀</span>
            <span style={styles.sectionTitle}>API 匯出</span>
          </div>
          <p style={styles.sectionDesc}>
            自動轉換，直接貼入 Figma
          </p>

          {checkingKey ? (
            <div style={styles.comingSoonNote}>檢查 API Key 設定中...</div>
          ) : !apiKeyConfigured ? (
            <div style={styles.comingSoonNote}>
              請在<a href="/settings" style={styles.link}>設定頁</a>配置 code.to.design API Key
            </div>
          ) : (
            <>
              {/* Viewport selector */}
              <label style={styles.label}>Viewport：</label>
              <div style={styles.urlRow}>
                <select
                  style={styles.selectInput}
                  value={viewport}
                  onChange={e => setViewport(e.target.value as Viewport)}
                  disabled={exportState === 'exporting'}
                  title="選擇 Viewport 大小"
                  data-testid="figma-viewport-select"
                >
                  <option value="desktop">Desktop (1440px)</option>
                  <option value="tablet">Tablet (768px)</option>
                  <option value="mobile">Mobile (390px)</option>
                </select>
                <button
                  type="button"
                  style={{
                    ...styles.exportBtn,
                    ...(exportState === 'exporting' ? styles.btnDisabled : {}),
                  }}
                  onClick={handleExportFigma}
                  disabled={exportState === 'exporting'}
                  data-testid="figma-export-btn"
                >
                  {exportState === 'exporting' && (
                    <span style={styles.spinner} />
                  )}
                  {exportState === 'exporting' ? '轉換中...' : '匯出到剪貼簿'}
                </button>
              </div>

              {exportState === 'success' && (
                <div style={styles.successNote}>
                  已複製！在 Figma 中按 Ctrl+V 貼上
                </div>
              )}
              {exportState === 'error' && (
                <div style={styles.errorNote}>
                  {exportError}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    width: '480px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1e293b',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    lineHeight: 1,
  },
  section: {
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  sectionIcon: {
    fontSize: '18px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
  },
  sectionDesc: {
    fontSize: '13px',
    color: '#64748b',
    margin: '0 0 14px',
    lineHeight: '1.5',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
    marginBottom: '6px',
  },
  urlRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  urlInput: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    color: '#334155',
    outline: 'none',
    minWidth: 0,
  },
  copyBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease',
  },
  stepsHeader: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
    marginBottom: '8px',
  },
  stepsList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#475569',
    lineHeight: '1.7',
  },
  stepItem: {
    marginBottom: '6px',
  },
  link: {
    color: '#8E6FA7',
    fontSize: '12px',
    textDecoration: 'none',
    fontWeight: 500,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  disabledSection: {
    opacity: 0.55,
    pointerEvents: 'none' as const,
  },
  comingSoonNote: {
    fontSize: '12px',
    color: '#94a3b8',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '10px 12px',
    lineHeight: '1.5',
  },
  selectInput: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    color: '#334155',
    outline: 'none',
    minWidth: 0,
    cursor: 'pointer',
  },
  exportBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'figma-spin 0.6s linear infinite',
  },
  successNote: {
    fontSize: '13px',
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '6px',
    padding: '10px 12px',
    lineHeight: '1.5',
  },
  errorNote: {
    fontSize: '13px',
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '10px 12px',
    lineHeight: '1.5',
  },
};

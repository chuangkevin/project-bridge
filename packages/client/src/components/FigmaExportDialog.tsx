import { useState } from 'react';

interface Props {
  projectId: string;
  shareToken: string;
  onClose: () => void;
}

export default function FigmaExportDialog({ projectId: _projectId, shareToken, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/share/${shareToken}`;

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
          <div style={styles.stepsHeader}>步驟：</div>
          <ol style={styles.stepsList}>
            <li style={styles.stepItem}>
              安裝 html.to.design 插件
              <br />
              <a
                href="https://www.figma.com/community/plugin/1159123024924461424/html-to-design"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.link}
              >
                前往 Figma Community →
              </a>
            </li>
            <li style={styles.stepItem}>在 Figma 中開啟插件</li>
            <li style={styles.stepItem}>貼上上方連結</li>
            <li style={styles.stepItem}>選擇 viewport 大小並匯入</li>
          </ol>
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>或</span>
          <span style={styles.dividerLine} />
        </div>

        {/* API Export Section (Coming Soon) */}
        <div style={{ ...styles.section, ...styles.disabledSection }}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>🚀</span>
            <span style={styles.sectionTitle}>API 匯出（即將推出）</span>
          </div>
          <p style={styles.sectionDesc}>
            自動轉換，直接貼入 Figma
          </p>
          <div style={styles.comingSoonNote}>
            即將推出 — 需設定 code.to.design API Key
          </div>
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
};

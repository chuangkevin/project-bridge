import { useState, useEffect, useCallback } from 'react';
import QualityBadge from './QualityBadge';

interface QualityScore {
  overall: number;
  html: number;
  accessibility: number;
  responsive: number;
  consistency: number;
}

interface Version {
  id: string;
  version: number;
  is_current: number;
  is_multi_page: number;
  created_at: string;
  preview?: string;
  quality_score?: QualityScore | null;
}

interface Props {
  projectId: string;
  currentVersion: number | null;
  onRestore: (html: string, version: number, isMultiPage: boolean, pages: string[]) => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({ projectId, currentVersion, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prototype/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  const handleRestore = async (version: number) => {
    if (version === currentVersion) return;
    setRestoring(version);
    try {
      const res = await fetch(`/api/projects/${projectId}/prototype/versions/${version}/restore`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onRestore(data.html, data.version, data.isMultiPage, data.pages);
        onClose();
      }
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>版本歷史</span>
          <button type="button" onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        {loading ? (
          <div style={styles.empty}>載入中...</div>
        ) : versions.length === 0 ? (
          <div style={styles.empty}>尚無版本記錄</div>
        ) : (
          <div style={styles.list}>
            {versions.map(v => (
              <div key={v.id} style={styles.itemWrapper}>
                <div style={{ ...styles.item, ...(v.is_current ? styles.itemCurrent : {}) }}>
                  {v.preview && (
                    <div style={styles.thumbnailWrapper}>
                      <iframe
                        srcDoc={v.preview}
                        style={styles.thumbnailIframe}
                        sandbox="allow-scripts"
                        title={`v${v.version} preview`}
                      />
                    </div>
                  )}
                  <div style={styles.itemLeft}>
                    <span style={styles.versionNum}>v{v.version}</span>
                    {v.is_current ? <span style={styles.currentBadge}>目前</span> : null}
                    {v.is_multi_page ? <span style={styles.multiPageBadge}>多頁</span> : null}
                    {v.quality_score && <QualityBadge score={v.quality_score} />}
                    <span style={styles.timestamp}>{new Date(v.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={styles.btnGroup}>
                    {v.preview && (
                      <button
                        type="button"
                        onClick={() => setExpandedPreview(expandedPreview === v.version ? null : v.version)}
                        style={styles.previewToggleBtn}
                      >
                        {expandedPreview === v.version ? '收起' : '展開預覽'}
                      </button>
                    )}
                    <a
                      href={`/api/projects/${projectId}/prototype/versions/${v.version}/html`}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.viewLink}
                    >
                      🔗 在新分頁查看
                    </a>
                    {!v.is_current && (
                      <button
                        type="button"
                        onClick={() => handleRestore(v.version)}
                        disabled={restoring === v.version}
                        style={styles.restoreBtn}
                      >
                        {restoring === v.version ? '還原中...' : '還原'}
                      </button>
                    )}
                  </div>
                </div>
                {expandedPreview === v.version && v.preview && (
                  <pre style={styles.previewBlock}>{v.preview.slice(0, 300)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.15)' },
  panel: {
    position: 'absolute', right: '16px', top: '48px',
    width: '360px', background: '#fff', borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid #e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f1f5f9' },
  title: { fontSize: '13px', fontWeight: 600, color: '#1e293b' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' },
  empty: { padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' },
  list: { maxHeight: '320px', overflowY: 'auto' },
  item: { display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between', padding: '10px 14px' },
  thumbnailWrapper: { width: '80px', height: '50px', overflow: 'hidden', borderRadius: '4px', border: '1px solid #e2e8f0', flexShrink: 0 },
  thumbnailIframe: { width: '400px', height: '250px', transform: 'scale(0.2)', transformOrigin: '0 0', pointerEvents: 'none' as const, border: 'none' },
  itemCurrent: { background: '#f0f9ff' },
  itemLeft: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const },
  versionNum: { fontSize: '13px', fontWeight: 600, color: '#1e293b' },
  currentBadge: { fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '10px', fontWeight: 600 },
  multiPageBadge: { fontSize: '10px', background: '#f0fdf4', color: '#15803d', padding: '1px 6px', borderRadius: '10px' },
  timestamp: { fontSize: '11px', color: '#94a3b8' },
  restoreBtn: { fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  viewLink: { fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', whiteSpace: 'nowrap' as const },
  itemWrapper: { borderBottom: '1px solid #f8fafc' },
  btnGroup: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  previewToggleBtn: { fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  previewBlock: { margin: '0', padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', overflowX: 'auto' as const, maxHeight: '100px', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const },
};

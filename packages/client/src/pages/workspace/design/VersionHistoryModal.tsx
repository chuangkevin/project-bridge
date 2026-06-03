import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { Artifact } from '../../../hooks/useArtifacts';
import VueSfcPreview from './VueSfcPreview';

interface Props {
  projectId: string;
  artifactId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function VersionHistoryModal({ projectId, artifactId, onClose, onSelect }: Props) {
  const [versions, setVersions] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewSfc, setPreviewSfc] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    api<{ versions: Artifact[] }>(`/api/projects/${projectId}/artifacts/${artifactId}/versions`)
      .then(r => setVersions(r.versions))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [projectId, artifactId]);

  const handlePreview = async (id: string) => {
    if (previewId === id) { setPreviewId(null); setPreviewSfc(null); return; }
    setPreviewId(id);
    setLoadingPreview(true);
    setPreviewSfc(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${id}/payload`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setPreviewSfc(text);
    } catch (e) {
      setPreviewSfc(null);
      alert(`載入失敗：${(e as Error).message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border-primary)',
        width: previewSfc ? 900 : 520,
        maxWidth: '95vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>版本歷史</h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: '2px 6px' }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Version list */}
          <div style={{ width: previewSfc ? 280 : '100%', overflowY: 'auto', padding: 16, borderRight: previewSfc ? '1px solid var(--border-subtle)' : 'none' }}>
            {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>載入中…</p>}
            {error && <p style={{ color: 'var(--color-error, #ef4444)', fontSize: 13 }}>載入失敗：{error}</p>}
            {!loading && versions.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>找不到版本紀錄</p>
            )}
            {versions.map((v, i) => (
              <div
                key={v.id}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: v.id === artifactId ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  background: v.id === artifactId ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>v{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: v.id === artifactId ? 600 : 400 }}>{v.name}</span>
                    {v.id === artifactId && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent-primary)', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>目前</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {new Date(v.createdAt).toLocaleString('zh-TW')}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    className="design__btn"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => handlePreview(v.id)}
                  >
                    {previewId === v.id ? '關閉預覽' : '預覽'}
                  </button>
                  {v.id !== artifactId && (
                    <button
                      className="design__btn"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => { onSelect(v.id); onClose(); }}
                      title="切換到此版本"
                    >
                      還原
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Preview pane */}
          {previewSfc && (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {loadingPreview ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  載入中…
                </div>
              ) : (
                <VueSfcPreview sfc={previewSfc} key={previewId} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import VueSfcPreview from './workspace/design/VueSfcPreview';

interface ShareArtifact {
  id: string;
  name: string;
  kind: string;
  payloadPath: string;
  createdAt: string;
}

interface ShareData {
  project: { id: string; name: string };
  artifacts: ShareArtifact[];
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sfcSource, setSfcSource] = useState<string | null>(null);
  const [loadingPayload, setLoadingPayload] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<ShareData>(`/api/share/${token}`)
      .then(d => {
        setData(d);
        if (d.artifacts.length > 0) setSelectedId(d.artifacts[0].id);
      })
      .catch((e) => {
        if (e?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!data || !selectedId) { setSfcSource(null); return; }
    setLoadingPayload(true);
    fetch(`/api/projects/${data.project.id}/artifacts/${selectedId}/payload`)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setSfcSource)
      .catch(() => setSfcSource(null))
      .finally(() => setLoadingPayload(false));
  }, [data, selectedId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        載入中…
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🔗</div>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>分享連結不存在或已過期</h2>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>請向專案擁有者索取新的分享連結。</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-root)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--glass-bg)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-accent)' }}>DesignBridge</span>
        <span style={{ color: 'var(--border-primary)' }}>|</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{data.project.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>唯讀預覽</span>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar: artifact chips */}
        {data.artifacts.length > 0 && (
          <aside style={{
            width: 200,
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            overflowY: 'auto',
            padding: '12px 8px',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, paddingLeft: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              頁面
            </div>
            {data.artifacts.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  marginBottom: 4,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: selectedId === a.id ? 'var(--accent-primary)' : 'transparent',
                  background: selectedId === a.id ? 'var(--bg-card)' : 'transparent',
                  color: selectedId === a.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {a.name}
              </button>
            ))}
          </aside>
        )}

        {/* Preview area */}
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {loadingPayload && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', zIndex: 1 }}>
              載入預覽中…
            </div>
          )}
          {!loadingPayload && sfcSource ? (
            <VueSfcPreview sfc={sfcSource} key={selectedId} />
          ) : !loadingPayload && data.artifacts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              此專案尚無可預覽的頁面
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

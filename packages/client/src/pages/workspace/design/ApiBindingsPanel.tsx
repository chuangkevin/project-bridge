import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiBinding {
  id: string;
  bridge_id: string;
  method: HttpMethod;
  url: string;
  created_at: string;
}

interface Props {
  projectId: string;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#22c55e',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  DELETE: '#ef4444',
  PATCH: '#a855f7',
};

export default function ApiBindingsPanel({ projectId }: Props) {
  const [bindings, setBindings] = useState<ApiBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New binding form state
  const [showForm, setShowForm] = useState(false);
  const [newBridgeId, setNewBridgeId] = useState('');
  const [newMethod, setNewMethod] = useState<HttpMethod>('GET');
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchBindings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ bindings: ApiBinding[] }>(
        `/api/projects/${projectId}/api-bindings`
      );
      setBindings(data.bindings ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchBindings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAdd = async () => {
    if (!newBridgeId.trim() || !newUrl.trim()) return;
    setSubmitting(true);
    try {
      await api(`/api/projects/${projectId}/api-bindings`, {
        method: 'POST',
        body: JSON.stringify({ bridge_id: newBridgeId.trim(), method: newMethod, url: newUrl.trim() }),
      });
      setNewBridgeId('');
      setNewMethod('GET');
      setNewUrl('');
      setShowForm(false);
      await fetchBindings();
    } catch (e) {
      alert(`新增失敗：${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (bid: string) => {
    if (!window.confirm('確定刪除此 API 綁定？')) return;
    try {
      await api(`/api/projects/${projectId}/api-bindings/${bid}`, { method: 'DELETE' });
      await fetchBindings();
    } catch (e) {
      alert(`刪除失敗：${(e as Error).message}`);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/api-bindings/export`);
      if (!res.ok) throw new Error(`匯出失敗：${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `api-bindings-${projectId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`匯出失敗：${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        gap: 6,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>API 綁定</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleExport}
            disabled={exporting || bindings.length === 0}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 10px',
              fontSize: 11,
              cursor: exporting || bindings.length === 0 ? 'not-allowed' : 'pointer',
              opacity: exporting || bindings.length === 0 ? 0.5 : 1,
            }}
          >
            {exporting ? '匯出中…' : '匯出 JSON'}
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + 新增綁定
          </button>
        </div>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <input
            type="text"
            placeholder="Bridge ID（例：submit-btn）"
            value={newBridgeId}
            onChange={e => setNewBridgeId(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={newMethod}
              onChange={e => setNewMethod(e.target.value as HttpMethod)}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: 12,
                minWidth: 80,
              }}
            >
              {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as HttpMethod[]).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="API URL（例：/api/orders）"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: 12,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !newBridgeId.trim() || !newUrl.trim()}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 10px',
                fontSize: 11,
                cursor: submitting || !newBridgeId.trim() || !newUrl.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !newBridgeId.trim() || !newUrl.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
        {loading && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 16 }}>
            載入中…
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-error, #ef4444)', textAlign: 'center', marginTop: 16 }}>
            {error}
          </div>
        )}
        {!loading && !error && bindings.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 16 }}>
            尚無 API 綁定。點選「新增綁定」開始建立。
          </div>
        )}
        {bindings.map(b => (
          <div
            key={b.id}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 10px',
              marginBottom: 8,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                background: METHOD_COLORS[b.method] ?? '#64748b',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 3,
                flexShrink: 0,
                fontFamily: 'monospace',
              }}
            >
              {b.method}
            </span>
            <span
              style={{
                flex: 1,
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={b.url}
            >
              {b.url}
            </span>
            <span
              style={{
                color: 'var(--text-muted)',
                fontSize: 10,
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              #{b.bridge_id}
            </span>
            <button
              onClick={() => handleDelete(b.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-error, #ef4444)',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              刪除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

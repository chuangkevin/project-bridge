import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Annotation {
  id: string;
  bridge_id: string;
  content: string;
  created_at: string;
}

interface Props {
  projectId: string;
}

export default function AnnotationsPanel({ projectId }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New annotation form state
  const [showForm, setShowForm] = useState(false);
  const [newBridgeId, setNewBridgeId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAnnotations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ annotations: Annotation[] }>(
        `/api/projects/${projectId}/annotations`
      );
      setAnnotations(data.annotations ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) fetchAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      await api(`/api/projects/${projectId}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ bridge_id: newBridgeId.trim() || undefined, content: newContent.trim() }),
      });
      setNewBridgeId('');
      setNewContent('');
      setShowForm(false);
      await fetchAnnotations();
    } catch (e) {
      alert(`新增失敗：${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (aid: string) => {
    if (!window.confirm('確定刪除此標註？')) return;
    try {
      await api(`/api/projects/${projectId}/annotations/${aid}`, { method: 'DELETE' });
      await fetchAnnotations();
    } catch (e) {
      alert(`刪除失敗：${(e as Error).message}`);
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
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>標註</span>
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
          + 新增標註
        </button>
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
            placeholder="Bridge ID（選填，例：hero-btn）"
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
          <textarea
            placeholder="標註內容…"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={3}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 12,
              resize: 'vertical',
            }}
          />
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
              disabled={submitting || !newContent.trim()}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 10px',
                fontSize: 11,
                cursor: submitting || !newContent.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !newContent.trim() ? 0.6 : 1,
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
        {!loading && !error && annotations.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 16 }}>
            尚無標註。點選「新增標註」開始建立。
          </div>
        )}
        {annotations.map(ann => (
          <div key={ann.id} className="annotation-card">
            {ann.bridge_id && (
              <div className="annotation-card__bridge">#{ann.bridge_id}</div>
            )}
            <div className="annotation-card__content">{ann.content}</div>
            <div className="annotation-card__actions">
              <button
                onClick={() => handleDelete(ann.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-error, #ef4444)',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                刪除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

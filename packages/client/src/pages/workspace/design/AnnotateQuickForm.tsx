import { useState } from 'react';

interface Props {
  projectId: string;
  bridgeId: string;
  onDone: () => void;
}

export default function AnnotateQuickForm({ projectId, bridgeId, onDone }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeId, content: content.trim(), label: bridgeId }),
      });
      if (!res.ok) throw new Error(`儲存失敗 (${res.status})`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <textarea
        autoFocus
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="標註內容…"
        rows={3}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: 'var(--color-error, #ef4444)', marginTop: 4 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            cursor: saving || !content.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !content.trim() ? 0.6 : 1,
          }}
        >
          {saving ? '儲存中…' : '新增標註'}
        </button>
      </div>
    </div>
  );
}

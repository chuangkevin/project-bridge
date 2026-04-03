import { useState } from 'react';
import { authHeaders } from '../contexts/AuthContext';

const CATEGORIES = [
  { key: 'navigation', label: '導航列' },
  { key: 'card', label: '卡片' },
  { key: 'form', label: '表單' },
  { key: 'button', label: '按鈕' },
  { key: 'hero', label: '主視覺' },
  { key: 'footer', label: '頁尾' },
  { key: 'modal', label: '彈窗' },
  { key: 'table', label: '表格' },
  { key: 'other', label: '其他' },
];

interface Props {
  html: string;
  css: string;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function SaveComponentDialog({ html, css, projectId, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('請輸入元件名稱');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch('/api/components/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          html,
          css,
          name: name.trim(),
          category,
          tags: tagList.length > 0 ? tagList : undefined,
          source_project_id: projectId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '儲存失敗' }));
        setError(data.error || '儲存失敗');
        return;
      }
      onSaved();
    } catch {
      setError('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>儲存為元件</span>
          <button type="button" style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.preview}>
          <iframe
            srcDoc={`<html><head><style>body{margin:8px;font-family:sans-serif;}${css}</style></head><body>${html}</body></html>`}
            style={styles.previewIframe}
            sandbox="allow-scripts"
            title="元件預覽"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>名稱 *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：導航列、登入表單"
            style={styles.input}
            autoFocus
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>分類</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={styles.input}>
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>標籤（逗號分隔）</label>
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="例如：dark, responsive, mobile"
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={onClose}>取消</button>
          <button type="button" style={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? '儲存中...' : '儲存元件'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  dialog: {
    backgroundColor: 'var(--bg-primary, #fff)',
    borderRadius: '12px',
    padding: '24px',
    width: '440px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary, #1e293b)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: 'var(--text-secondary, #64748b)',
    padding: '4px',
  },
  preview: {
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '16px',
    backgroundColor: '#fff',
  },
  previewIframe: {
    width: '100%',
    height: '150px',
    border: 'none',
    pointerEvents: 'none' as const,
  },
  field: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary, #64748b)',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: 'var(--bg-secondary, #f8fafc)',
    color: 'var(--text-primary, #1e293b)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    marginBottom: '12px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid var(--border-primary, #e2e8f0)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary, #f8fafc)',
    color: 'var(--text-secondary, #64748b)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#10b981',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};

import { useState, useRef, useEffect } from 'react';
import { authHeaders } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
  onCreated: (project: { id: string; name: string; share_token: string; created_at: string; updated_at: string }) => void;
}

type ProjectMode = 'architecture' | 'design';

export default function NewProjectDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ProjectMode>('architecture');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: name.trim(), mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }
      const project = await res.json();
      onCreated(project);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  const modeCardStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '14px 12px',
    border: selected ? '2px solid #8E6FA7' : '2px solid #e2e8f0',
    borderRadius: '10px',
    backgroundColor: selected ? 'rgba(142, 111, 167, 0.08)' : '#ffffff',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>新增專案</h2>
        <form onSubmit={handleSubmit}>
          <label style={styles.label}>建立模式</label>
          <div style={styles.modeRow}>
            <button
              type="button"
              style={modeCardStyle(mode === 'architecture')}
              onClick={() => setMode('architecture')}
              data-testid="mode-architecture"
            >
              <div style={styles.modeTitle}>
                <span style={styles.modeIcon}>🏗️</span> 架構設計
              </div>
              <div style={styles.modeDesc}>先定義頁面結構，AI 生成時更精準</div>
            </button>
            <button
              type="button"
              style={modeCardStyle(mode === 'design')}
              onClick={() => setMode('design')}
              data-testid="mode-design"
            >
              <div style={styles.modeTitle}>
                <span style={styles.modeIcon}>💬</span> 直接設計
              </div>
              <div style={styles.modeDesc}>跳過架構，直接開始聊天生成</div>
            </button>
          </div>

          <label style={{ ...styles.label, marginTop: '16px' }}>專案名稱</label>
          <input
            ref={inputRef}
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="我的原型專案"
            disabled={submitting}
          />
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" style={styles.createBtn} disabled={submitting || !name.trim()} data-testid="create-project-btn">
              {submitting ? '建立中...' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    width: '440px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  title: {
    margin: '0 0 20px',
    fontSize: '18px',
    fontWeight: 600,
    color: '#1e293b',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#475569',
    marginBottom: '6px',
  },
  modeRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '4px',
  },
  modeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '4px',
  },
  modeIcon: {
    fontSize: '15px',
  },
  modeDesc: {
    fontSize: '12px',
    color: '#64748b',
    lineHeight: '1.4',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    margin: '8px 0 0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '14px',
    cursor: 'pointer',
  },
  createBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
